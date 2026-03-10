import { useEffect, useState } from "react";
import { Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { useCaches, deletePaths, CacheCategory } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function CacheCleaner() {
  const { data, loading, error, fetch } = useCaches();
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

  const selectAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.map((c) => c.path)));
    }
  };

  const selectedSize = data
    .filter((c) => selected.has(c.path))
    .reduce((sum, c) => sum + c.size_bytes, 0);

  const handleClean = async () => {
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

  const totalSize = data.reduce((sum, c) => sum + c.size_bytes, 0);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Cache Cleaner</h2>
          <p className="text-text-muted text-sm mt-1">
            {data.length} categories found &middot; {formatBytes(totalSize)}{" "}
            total
          </p>
        </div>
        <div className="flex gap-2">
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
            Clean {selected.size > 0 && `(${formatBytes(selectedSize)})`}
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
          <p className="text-text-muted">Scanning caches...</p>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={selectAll}
            className="text-xs text-text-muted hover:text-text cursor-pointer mb-2"
          >
            {selected.size === data.length ? "Deselect all" : "Select all"}
          </button>
          {data.map((cache: CacheCategory) => (
            <div
              key={cache.path}
              onClick={() => toggleSelect(cache.path)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                selected.has(cache.path)
                  ? "bg-danger/5 border-danger/30"
                  : "bg-surface border-border hover:bg-surface-hover"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(cache.path)}
                onChange={() => toggleSelect(cache.path)}
                className="w-4 h-4 accent-danger"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{cache.name}</p>
                <p className="text-xs text-text-muted truncate">{cache.path}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">{cache.size_display}</p>
                <p className="text-xs text-text-muted">
                  {cache.file_count.toLocaleString()} files
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted">
            Cleaning caches is generally safe, but some apps may need to rebuild
            their caches. System Caches and Browser Caches will be recreated
            automatically.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Clean selected caches?"
        message={`This will permanently delete ${selected.size} cache ${selected.size === 1 ? "category" : "categories"} (${formatBytes(selectedSize)}). This action cannot be undone.`}
        confirmLabel="Clean"
        onConfirm={handleClean}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
