import { useEffect, useState } from "react";
import { FileSearch, Trash2, RefreshCw } from "lucide-react";
import { useLargeFiles, deletePaths, DirEntry } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function LargeFiles() {
  const { data, loading, error, fetch } = useLargeFiles();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minSize, setMinSize] = useState(50);
  const [deleting, setDeleting] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch(minSize);
  }, [fetch, minSize]);

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedSize = data
    .filter((f) => selected.has(f.path))
    .reduce((sum, f) => sum + f.size_bytes, 0);

  const handleDelete = async () => {
    setShowConfirm(false);
    if (selected.size === 0) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const freed = await deletePaths(Array.from(selected));
      setLastFreed(freed);
      setSelected(new Set());
      await fetch(minSize);
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
          <h2 className="text-2xl font-bold">Large Files</h2>
          <p className="text-text-muted text-sm mt-1">
            Scanning home directory, Library & project folders
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-sm text-text-muted">Min size:</label>
          <select
            value={minSize}
            onChange={(e) => setMinSize(Number(e.target.value))}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value={1}>1 MB</option>
            <option value={10}>10 MB</option>
            <option value={50}>50 MB</option>
            <option value={100}>100 MB</option>
            <option value={250}>250 MB</option>
            <option value={500}>500 MB</option>
            <option value={1000}>1 GB</option>
            <option value={5000}>5 GB</option>
          </select>
          <button
            onClick={() => fetch(minSize)}
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
          <FileSearch size={48} className="text-text-muted mb-4" />
          <p className="text-text-muted">Scanning for large files...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <FileSearch size={48} className="text-text-muted mb-4" />
          <p className="text-text-muted">
            No files larger than {minSize} MB found
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((file: DirEntry) => (
            <div
              key={file.path}
              onClick={() => toggleSelect(file.path)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                selected.has(file.path)
                  ? "bg-danger/5 border-danger/30"
                  : "bg-surface border-border hover:bg-surface-hover"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(file.path)}
                onChange={() => toggleSelect(file.path)}
                className="w-4 h-4 accent-danger"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-text-muted truncate">{file.path}</p>
              </div>
              <p className="font-semibold text-sm shrink-0">
                {file.size_display}
              </p>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Delete selected files?"
        message={`This will permanently delete ${selected.size} ${selected.size === 1 ? "file" : "files"} (${formatBytes(selectedSize)}). This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
