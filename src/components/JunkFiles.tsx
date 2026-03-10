import { useEffect, useState } from "react";
import { Trash2, RefreshCw, Archive } from "lucide-react";
import { useJunkFiles, deletePaths, CleanableItem } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824)
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function JunkFiles() {
  const { data, loading, error, fetch } = useJunkFiles();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  useEffect(() => {
    fetch();
  }, [fetch]);

  const categories = [...new Set(data.map((d) => d.category))];

  const filtered =
    filterCategory === "all"
      ? data
      : data.filter((d) => d.category === filterCategory);

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.path)));
    }
  };

  const selectedSize = data
    .filter((d) => selected.has(d.path))
    .reduce((sum, d) => sum + d.size_bytes, 0);

  const totalSize = data.reduce((sum, d) => sum + d.size_bytes, 0);

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

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Junk Files</h2>
          <p className="text-text-muted text-sm mt-1">
            {data.length} files found &middot; {formatBytes(totalSize)} total
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button
            onClick={fetch}
            disabled={loading}
            className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Scan
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={selected.size === 0 || deleting}
            className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
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

      {loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-text-muted">Scanning for junk files...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Archive size={48} className="text-text-muted mb-4" />
          <p className="text-text-muted">No junk files found</p>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={selectAll}
            className="text-xs text-text-muted hover:text-text cursor-pointer mb-2"
          >
            {selected.size === filtered.length ? "Deselect all" : "Select all"}
          </button>
          {filtered.map((item: CleanableItem) => (
            <div
              key={item.path}
              onClick={() => toggleSelect(item.path)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                selected.has(item.path)
                  ? "bg-danger/5 border-danger/30"
                  : "bg-surface border-border hover:bg-surface-hover"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(item.path)}
                onChange={() => toggleSelect(item.path)}
                className="w-4 h-4 accent-danger"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{item.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-border text-text-muted">
                    {item.category}
                  </span>
                </div>
                <p className="text-xs text-text-muted truncate">{item.path}</p>
              </div>
              <p className="font-semibold text-sm shrink-0">
                {item.size_display}
              </p>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Delete junk files?"
        message={`This will permanently delete ${selected.size} ${selected.size === 1 ? "file" : "files"} (${formatBytes(selectedSize)}). This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
