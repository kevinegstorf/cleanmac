import { useEffect, useState } from "react";
import { Trash2, RefreshCw, Package } from "lucide-react";
import {
  useStaleNodeModules,
  deletePaths,
  StaleNodeModules,
} from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824)
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function NodeModules() {
  const { data, loading, error, fetch } = useStaleNodeModules();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [staleDays, setStaleDays] = useState(30);
  const [deleting, setDeleting] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch(staleDays);
  }, [fetch, staleDays]);

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
      setSelected(new Set(data.map((d) => d.node_modules_path)));
    }
  };

  const selectedSize = data
    .filter((d) => selected.has(d.node_modules_path))
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
      await fetch(staleDays);
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
          <h2 className="text-2xl font-bold">Node Modules</h2>
          <p className="text-text-muted text-sm mt-1">
            {data.length} stale {data.length === 1 ? "project" : "projects"}{" "}
            found &middot; {formatBytes(totalSize)} reclaimable
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-sm text-text-muted">Unused for:</label>
          <select
            value={staleDays}
            onChange={(e) => setStaleDays(Number(e.target.value))}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            onClick={() => fetch(staleDays)}
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
          <p className="text-text-muted">
            Scanning for stale node_modules...
          </p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Package size={48} className="text-text-muted mb-4" />
          <p className="text-text-muted">
            No stale node_modules found (older than {staleDays} days)
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={selectAll}
            className="text-xs text-text-muted hover:text-text cursor-pointer mb-2"
          >
            {selected.size === data.length ? "Deselect all" : "Select all"}
          </button>
          {data.map((item: StaleNodeModules) => (
            <div
              key={item.node_modules_path}
              onClick={() => toggleSelect(item.node_modules_path)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                selected.has(item.node_modules_path)
                  ? "bg-danger/5 border-danger/30"
                  : "bg-surface border-border hover:bg-surface-hover"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(item.node_modules_path)}
                onChange={() => toggleSelect(item.node_modules_path)}
                className="w-4 h-4 accent-danger"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.project_name}</p>
                <p className="text-xs text-text-muted truncate">
                  {item.node_modules_path}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">{item.size_display}</p>
                <p className="text-xs text-text-muted">
                  {item.days_since_modified}d ago
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Delete stale node_modules?"
        message={`This will delete node_modules from ${selected.size} ${selected.size === 1 ? "project" : "projects"} (${formatBytes(selectedSize)}). You can reinstall them with pnpm/npm install.`}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
