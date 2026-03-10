import { useState } from "react";
import { Trash2, FileText, Wifi, Archive, RefreshCw, Copy, CheckCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { deletePaths, CacheCategory } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

interface CardState {
  data: CacheCategory | null;
  loading: boolean;
  error: string | null;
}

export function Maintenance() {
  const [cacheState, setCacheState] = useState<CardState>({ data: null, loading: false, error: null });
  const [logsState, setLogsState] = useState<CardState>({ data: null, loading: false, error: null });
  const [trashState, setTrashState] = useState<CardState>({ data: null, loading: false, error: null });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lastFreed, setLastFreed] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scanPath = async (
    name: string,
    path: string,
    setter: React.Dispatch<React.SetStateAction<CardState>>,
  ) => {
    setter({ data: null, loading: true, error: null });
    try {
      const result = await invoke<CacheCategory | null>("scan_single_path", { name, path });
      setter({ data: result, loading: false, error: null });
    } catch (e) {
      setter({ data: null, loading: false, error: String(e) });
    }
  };

  const handleDelete = async (path: string, label: string, setter: React.Dispatch<React.SetStateAction<CardState>>) => {
    setShowConfirm(null);
    setDeleting(label);
    try {
      const freed = await deletePaths([path]);
      setLastFreed(`${label}: freed ${formatBytes(freed)}`);
      setter({ data: null, loading: false, error: null });
    } catch (e) {
      setter((prev) => ({ ...prev, error: String(e) }));
    } finally {
      setDeleting(null);
    }
  };

  const copyDnsCommand = async () => {
    await navigator.clipboard.writeText("sudo dscacheutil -flushcache");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">System Maintenance</h2>
        <p className="text-text-muted text-sm mt-1">Quick actions for system cleanup</p>
      </div>

      {lastFreed && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3 mb-4 text-sm text-success">
          {lastFreed}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* System Cache */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Archive size={20} className="text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">System Cache</h3>
              <p className="text-xs text-text-muted">Clean system caches</p>
            </div>
          </div>
          {cacheState.data && (
            <p className="text-sm font-medium mb-3">
              {cacheState.data.size_display} &middot; {cacheState.data.file_count.toLocaleString()} files
            </p>
          )}
          {cacheState.error && (
            <p className="text-xs text-danger mb-3">{cacheState.error}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => scanPath("System Caches", "USER_HOME/Library/Caches", setCacheState)}
              disabled={cacheState.loading}
              className="px-3 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <RefreshCw size={12} className={cacheState.loading ? "animate-spin" : ""} />
              Scan
            </button>
            {cacheState.data && (
              <button onClick={() => setShowConfirm("cache")}
                disabled={deleting === "System Cache"}
                className="px-3 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
                <Trash2 size={12} /> Clean
              </button>
            )}
          </div>
        </div>

        {/* System Logs */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <FileText size={20} className="text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">System Logs</h3>
              <p className="text-xs text-text-muted">Clear old log files</p>
            </div>
          </div>
          {logsState.data && (
            <p className="text-sm font-medium mb-3">
              {logsState.data.size_display} &middot; {logsState.data.file_count.toLocaleString()} files
            </p>
          )}
          {logsState.error && (
            <p className="text-xs text-danger mb-3">{logsState.error}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => scanPath("System Logs", "USER_HOME/Library/Logs", setLogsState)}
              disabled={logsState.loading}
              className="px-3 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <RefreshCw size={12} className={logsState.loading ? "animate-spin" : ""} />
              Scan
            </button>
            {logsState.data && (
              <button onClick={() => setShowConfirm("logs")}
                disabled={deleting === "System Logs"}
                className="px-3 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
                <Trash2 size={12} /> Clean
              </button>
            )}
          </div>
        </div>

        {/* DNS Cache */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Wifi size={20} className="text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">DNS Cache</h3>
              <p className="text-xs text-text-muted">Flush DNS cache</p>
            </div>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Requires sudo. Copy the command and run it in Terminal.
          </p>
          <button onClick={copyDnsCommand}
            className="px-3 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1">
            {copied ? <CheckCircle size={12} className="text-success" /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy command"}
          </button>
        </div>

        {/* Trash */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-danger/10">
              <Trash2 size={20} className="text-danger" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Trash</h3>
              <p className="text-xs text-text-muted">Empty Trash</p>
            </div>
          </div>
          {trashState.data && (
            <p className="text-sm font-medium mb-3">
              {trashState.data.size_display} &middot; {trashState.data.file_count.toLocaleString()} files
            </p>
          )}
          {trashState.error && (
            <p className="text-xs text-danger mb-3">{trashState.error}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => scanPath("Trash", "USER_HOME/.Trash", setTrashState)}
              disabled={trashState.loading}
              className="px-3 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <RefreshCw size={12} className={trashState.loading ? "animate-spin" : ""} />
              Scan
            </button>
            {trashState.data && (
              <button onClick={() => setShowConfirm("trash")}
                disabled={deleting === "Trash"}
                className="px-3 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
                <Trash2 size={12} /> Empty
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm === "cache"}
        title="Clean system caches?"
        message={`This will delete ${cacheState.data?.size_display ?? ""} of cached data. Apps may need to rebuild their caches.`}
        confirmLabel="Clean"
        onConfirm={() => handleDelete(cacheState.data!.path, "System Cache", setCacheState)}
        onCancel={() => setShowConfirm(null)}
      />
      <ConfirmDialog
        open={showConfirm === "logs"}
        title="Clear system logs?"
        message={`This will delete ${logsState.data?.size_display ?? ""} of log files.`}
        confirmLabel="Clear"
        onConfirm={() => handleDelete(logsState.data!.path, "System Logs", setLogsState)}
        onCancel={() => setShowConfirm(null)}
      />
      <ConfirmDialog
        open={showConfirm === "trash"}
        title="Empty Trash?"
        message={`This will permanently delete ${trashState.data?.size_display ?? ""} from Trash. This cannot be undone.`}
        confirmLabel="Empty Trash"
        onConfirm={() => handleDelete(trashState.data!.path, "Trash", setTrashState)}
        onCancel={() => setShowConfirm(null)}
      />
    </div>
  );
}
