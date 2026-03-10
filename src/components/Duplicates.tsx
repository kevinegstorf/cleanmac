import { useEffect, useState } from "react";
import { Trash2, RefreshCw } from "lucide-react";
import { useDuplicates, deletePaths, DuplicateGroup } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function Duplicates() {
  const { data, loading, error, fetch } = useDuplicates();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllDuplicates = () => {
    if (!data) return;
    const paths = new Set<string>();
    for (const group of data.groups) {
      const sorted = [...group.files].sort(
        (a, b) => a.modified_days_ago - b.modified_days_ago,
      );
      for (let i = 1; i < sorted.length; i++) {
        paths.add(sorted[i].path);
      }
    }
    setSelected(paths);
  };

  const selectedSize = (() => {
    if (!data) return 0;
    let total = 0;
    for (const group of data.groups) {
      for (const file of group.files) {
        if (selected.has(file.path)) {
          total += group.size_bytes;
        }
      }
    }
    return total;
  })();

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

  const newestInGroup = (group: DuplicateGroup): string => {
    const sorted = [...group.files].sort(
      (a, b) => a.modified_days_ago - b.modified_days_ago,
    );
    return sorted[0]?.path ?? "";
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Duplicate Files</h2>
          <p className="text-text-muted text-sm mt-1">
            {data
              ? `${data.total_groups} groups · ${data.total_wasted_display} wasted`
              : "Scan to find duplicates"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetch} disabled={loading}
            className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Scan
          </button>
          <button onClick={selectAllDuplicates} disabled={!data || data.groups.length === 0}
            className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50">
            Select all duplicates (keep newest)
          </button>
          <button onClick={() => setShowConfirm(true)} disabled={selected.size === 0 || deleting}
            className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2">
            <Trash2 size={14} />
            Delete {selected.size > 0 && `(${formatBytes(selectedSize)})`}
          </button>
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

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-text-muted">Scanning for duplicates...</p>
        </div>
      ) : data && data.groups.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-text-muted">No duplicate files found</p>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {data.groups.map((group: DuplicateGroup) => {
            const newest = newestInGroup(group);
            return (
              <div key={group.hash}
                className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-text-muted">
                    {group.files.length} files &middot; {group.size_display} each
                    &middot; {group.wasted_display} wasted
                  </p>
                </div>
                <div className="space-y-2">
                  {group.files.map((file) => (
                    <div key={file.path} onClick={() => toggleSelect(file.path)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selected.has(file.path)
                          ? "bg-danger/5 border-danger/30"
                          : "bg-surface border-border hover:bg-surface-hover"
                      }`}>
                      <input type="checkbox" checked={selected.has(file.path)}
                        onChange={() => toggleSelect(file.path)}
                        className="w-4 h-4 accent-danger" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{file.name}</p>
                          {file.path === newest && (
                            <span className="px-2 py-0.5 bg-success/10 text-success text-xs rounded-full">
                              newest
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted truncate">
                          {file.path}
                        </p>
                      </div>
                      <p className="text-xs text-text-muted shrink-0">
                        {file.modified_days_ago}d ago
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <ConfirmDialog open={showConfirm} title="Delete selected duplicates?"
        message={`This will permanently delete ${selected.size} ${selected.size === 1 ? "file" : "files"} (${formatBytes(selectedSize)}). This action cannot be undone.`}
        onConfirm={handleDelete} onCancel={() => setShowConfirm(false)} />
    </div>
  );
}
