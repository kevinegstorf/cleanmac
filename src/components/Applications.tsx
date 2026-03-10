import { useEffect, useState } from "react";
import { Trash2, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { useApplications, deletePaths, AppInfo } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function Applications() {
  const { data, loading, error, fetch } = useApplications();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"all" | "suspicious">("all");
  const [deleting, setDeleting] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => { fetch(); }, [fetch]);

  const suspicious = data.filter((a) => a.is_suspicious);
  const displayed = tab === "suspicious" ? suspicious : data;

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedSize = data
    .filter((a) => selected.has(a.path))
    .reduce((sum, a) => sum + a.size_bytes, 0);

  const totalSize = data.reduce((sum, a) => sum + a.size_bytes, 0);

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
          <h2 className="text-2xl font-bold">Applications</h2>
          <p className="text-text-muted text-sm mt-1">
            {data.length} apps &middot; {formatBytes(totalSize)} total
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetch} disabled={loading}
            className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Scan
          </button>
          <button onClick={() => setShowConfirm(true)} disabled={selected.size === 0 || deleting}
            className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2">
            <Trash2 size={14} />
            Delete {selected.size > 0 && `(${formatBytes(selectedSize)})`}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${tab === "all" ? "bg-accent/15 text-accent-hover" : "bg-surface hover:bg-surface-hover text-text-muted"}`}>
          All Apps ({data.length})
        </button>
        <button onClick={() => setTab("suspicious")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${tab === "suspicious" ? "bg-danger/15 text-danger" : "bg-surface hover:bg-surface-hover text-text-muted"}`}>
          Suspicious ({suspicious.length})
        </button>
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
          <p className="text-text-muted">Scanning applications...</p>
        </div>
      ) : tab === "suspicious" && suspicious.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <CheckCircle size={48} className="text-success mb-4" />
          <p className="text-text-muted">No suspicious apps found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((app: AppInfo) => (
            <div key={app.path} onClick={() => toggleSelect(app.path)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                selected.has(app.path) ? "bg-danger/5 border-danger/30" : "bg-surface border-border hover:bg-surface-hover"
              }`}>
              <input type="checkbox" checked={selected.has(app.path)}
                onChange={() => toggleSelect(app.path)} className="w-4 h-4 accent-danger" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{app.name}</p>
                  {app.is_suspicious && (
                    <span className="px-2 py-0.5 bg-danger/10 text-danger text-xs rounded-full flex items-center gap-1">
                      <AlertTriangle size={10} /> Suspicious
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted truncate">{app.bundle_id || "No bundle ID"}</p>
                {app.is_suspicious && (
                  <p className="text-xs text-danger mt-0.5">{app.suspicious_reason}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">{app.size_display}</p>
                <p className="text-xs text-text-muted">
                  {app.last_opened_days_ago !== null ? `${app.last_opened_days_ago}d ago` : "Unknown"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={showConfirm} title="Delete selected applications?"
        message={`This will permanently delete ${selected.size} ${selected.size === 1 ? "application" : "applications"} (${formatBytes(selectedSize)}). This action cannot be undone.`}
        onConfirm={handleDelete} onCancel={() => setShowConfirm(false)} />
    </div>
  );
}
