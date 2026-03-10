import { useEffect, useState } from "react";
import { RefreshCw, Trash2, Image } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, type PieLabelRenderProps } from "recharts";
import {
  useImageScanner,
  deletePaths,
  ImageInfo,
} from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

const PIE_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#a855f7",
];

type Tab = "all" | "duplicates" | "screenshots" | "large" | "formats";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824)
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function Images() {
  const { data, loading, error, fetch } = useImageScanner();
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = (images: ImageInfo[]) => {
    setSelected(new Set(images.map((i) => i.path)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const selectDuplicatesKeepNewest = () => {
    if (!data) return;
    const toSelect = new Set<string>();
    for (const group of data.duplicates) {
      const sorted = [...group].sort(
        (a, b) => a.modified_days_ago - b.modified_days_ago,
      );
      // Keep the newest (first after sort), select the rest
      for (let i = 1; i < sorted.length; i++) {
        toSelect.add(sorted[i].path);
      }
    }
    setSelected(toSelect);
  };

  const selectedSize = data
    ? data.images
        .filter((f) => selected.has(f.path))
        .reduce((sum, f) => sum + f.size_bytes, 0)
    : 0;

  const handleDelete = async () => {
    setShowConfirm(false);
    if (selected.size === 0) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const freed = await deletePaths(Array.from(selected));
      setLastFreed(freed);
      setSelected(new Set());
      await fetch();
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  const screenshots = data?.images.filter((i) => i.is_screenshot) ?? [];
  const largeImages =
    data?.images.filter((i) => i.size_bytes >= 10 * 1_048_576) ?? [];

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All Images" },
    { id: "duplicates", label: "Duplicates" },
    { id: "screenshots", label: "Screenshots" },
    { id: "large", label: "Large (10MB+)" },
    { id: "formats", label: "Formats" },
  ];

  const renderImageRow = (img: ImageInfo) => (
    <div
      key={img.path}
      onClick={() => toggleSelect(img.path)}
      className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
        selected.has(img.path)
          ? "bg-danger/5 border-danger/30"
          : "bg-surface border-border hover:bg-surface-hover"
      }`}
    >
      <input
        type="checkbox"
        checked={selected.has(img.path)}
        onChange={() => toggleSelect(img.path)}
        className="w-4 h-4 accent-danger"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{img.name}</p>
        <p className="text-xs text-text-muted truncate">{img.path}</p>
      </div>
      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-accent/10 text-accent shrink-0">
        {img.format}
      </span>
      <p className="font-semibold text-sm shrink-0">{img.size_display}</p>
      <p className="text-xs text-text-muted shrink-0 w-16 text-right">
        {img.modified_days_ago}d ago
      </p>
    </div>
  );

  const renderListControls = (images: ImageInfo[]) => (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => selectAll(images)}
        className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer"
      >
        Select all
      </button>
      <button
        onClick={deselectAll}
        className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer"
      >
        Deselect all
      </button>
    </div>
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Image size={24} />
            Images
          </h2>
          <p className="text-text-muted text-sm mt-1">
            {data
              ? `${data.total_count.toLocaleString()} images \u00b7 ${formatBytes(data.total_size_bytes)}`
              : "Scan to discover images across your system"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => fetch()}
            disabled={loading}
            className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Scan
          </button>
          {tab !== "formats" && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={selected.size === 0 || deleting}
              className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 size={14} />
              Delete{" "}
              {selected.size > 0 && `(${formatBytes(selectedSize)})`}
            </button>
          )}
        </div>
      </div>

      {lastFreed !== null && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3 mb-4 text-sm text-success">
          Freed {formatBytes(lastFreed)} of disk space!
        </div>
      )}

      {(error || deleteError) && (
        <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4 text-sm text-danger">
          {deleteError || error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setSelected(new Set());
            }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.id === "duplicates" && data && data.duplicates.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-danger/10 text-danger">
                {data.duplicates.length}
              </span>
            )}
            {t.id === "screenshots" && screenshots.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-accent/10 text-accent">
                {screenshots.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Image size={48} className="text-text-muted mb-4" />
          <p className="text-text-muted">Scanning for images...</p>
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Image size={48} className="text-text-muted mb-4" />
          <p className="text-text-muted">
            Click Scan to discover images across your system
          </p>
        </div>
      ) : (
        <>
          {/* All Images */}
          {tab === "all" && (
            <>
              {renderListControls(data.images)}
              {data.images.length === 0 ? (
                <p className="text-text-muted text-center py-10">
                  No images found
                </p>
              ) : (
                <div className="space-y-2">
                  {data.images.map(renderImageRow)}
                </div>
              )}
            </>
          )}

          {/* Duplicates */}
          {tab === "duplicates" && (
            <>
              {data.duplicates.length > 0 && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={selectDuplicatesKeepNewest}
                    className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Select all duplicates (keep newest)
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Deselect all
                  </button>
                </div>
              )}
              {data.duplicates.length === 0 ? (
                <p className="text-text-muted text-center py-10">
                  No duplicate images found
                </p>
              ) : (
                <div className="space-y-6">
                  {data.duplicates.map((group, gi) => {
                    const groupSize = group.reduce(
                      (sum, i) => sum + i.size_bytes,
                      0,
                    );
                    return (
                      <div
                        key={gi}
                        className="border border-border rounded-xl overflow-hidden"
                      >
                        <div className="bg-surface-hover px-4 py-3 text-sm font-medium">
                          {group.length} duplicates &middot;{" "}
                          {formatBytes(groupSize)}
                        </div>
                        <div className="space-y-2 p-2">
                          {group.map(renderImageRow)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Screenshots */}
          {tab === "screenshots" && (
            <>
              {renderListControls(screenshots)}
              {screenshots.length === 0 ? (
                <p className="text-text-muted text-center py-10">
                  No screenshots found
                </p>
              ) : (
                <div className="space-y-2">
                  {screenshots.map(renderImageRow)}
                </div>
              )}
            </>
          )}

          {/* Large */}
          {tab === "large" && (
            <>
              {renderListControls(largeImages)}
              {largeImages.length === 0 ? (
                <p className="text-text-muted text-center py-10">
                  No images larger than 10 MB found
                </p>
              ) : (
                <div className="space-y-2">
                  {largeImages.map(renderImageRow)}
                </div>
              )}
            </>
          )}

          {/* Formats */}
          {tab === "formats" && (
            <>
              {data.format_breakdown.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-6 mb-6">
                  <h3 className="text-sm font-semibold mb-4">
                    Space by Format
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={data.format_breakdown}
                        dataKey="size_bytes"
                        nameKey="format"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(props: PieLabelRenderProps) => {
                          const fmt = String((props as unknown as { format: string }).format ?? "");
                          const pct = Number(props.percent ?? 0);
                          return `${fmt} ${(pct * 100).toFixed(0)}%`;
                        }}
                      >
                        {data.format_breakdown.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatBytes(Number(value))}
                        contentStyle={{
                          backgroundColor: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "0.5rem",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-semibold">Format</th>
                      <th className="px-4 py-3 font-semibold text-right">
                        Count
                      </th>
                      <th className="px-4 py-3 font-semibold text-right">
                        Total Size
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.format_breakdown.map((fmt) => (
                      <tr
                        key={fmt.format}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">{fmt.format}</td>
                        <td className="px-4 py-3 text-right text-text-muted">
                          {fmt.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {fmt.size_display}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Delete selected images?"
        message={`This will permanently delete ${selected.size} ${selected.size === 1 ? "image" : "images"} (${formatBytes(selectedSize)}). This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
