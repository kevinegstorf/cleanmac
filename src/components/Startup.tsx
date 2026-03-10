import { useEffect, useState } from "react";
import { Trash2, RefreshCw, Info } from "lucide-react";
import { useStartupItems, deletePaths, StartupItem } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

export function Startup() {
  const { data, loading, error, fetch } = useStartupItems();
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
          <h2 className="text-2xl font-bold">Startup Items</h2>
          <p className="text-text-muted text-sm mt-1">
            Manage login items for faster boot
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
            Remove ({selected.size})
          </button>
        </div>
      </div>

      <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg flex items-start gap-2 mb-4">
        <Info size={16} className="text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted">
          Removing third-party launch agents can speed up boot time. Apple items
          (com.apple.*) should not be removed.
        </p>
      </div>

      {lastFreed !== null && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3 mb-4 text-sm text-success">
          Removed {lastFreed} startup item plist file(s).
        </div>
      )}

      {(error || deleteError) && (
        <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4 text-sm text-danger">
          {deleteError || error}
        </div>
      )}

      {loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-text-muted">Scanning startup items...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((item: StartupItem) => (
            <div key={item.path} onClick={() => toggleSelect(item.path)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                selected.has(item.path) ? "bg-danger/5 border-danger/30" : "bg-surface border-border hover:bg-surface-hover"
              }`}>
              <input type="checkbox" checked={selected.has(item.path)}
                onChange={() => toggleSelect(item.path)} className="w-4 h-4 accent-danger" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{item.name}</p>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    item.item_type === "Launch Daemon" ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent"
                  }`}>
                    {item.item_type}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    item.is_enabled ? "bg-success/10 text-success" : "bg-surface-hover text-text-muted"
                  }`}>
                    {item.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                  {item.is_third_party && (
                    <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs rounded-full">
                      Third-party
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted truncate mt-0.5">
                  {item.plist_label || item.path}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={showConfirm} title="Remove selected startup items?"
        message={`This will permanently delete ${selected.size} startup plist ${selected.size === 1 ? "file" : "files"}. The associated services will no longer start at boot.`}
        confirmLabel="Remove" onConfirm={handleDelete} onCancel={() => setShowConfirm(false)} />
    </div>
  );
}
