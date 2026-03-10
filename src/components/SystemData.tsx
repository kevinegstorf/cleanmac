import { useState, useCallback } from "react";
import {
  RefreshCw,
  Database,
  ChevronRight,
  ArrowLeft,
  Folder,
  File,
  Trash2,
  ShieldAlert,
  Lock,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { CacheCategory, DirEntry } from "../hooks/use-system";
import { deletePaths, sudoDeletePaths, checkProtected } from "../hooks/use-system";
import { ConfirmDialog } from "./ConfirmDialog";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824)
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const SCAN_PATHS: { name: string; path: string }[] = [
  { name: "User Library", path: "USER_HOME/Library" },
  { name: "Application Support", path: "USER_HOME/Library/Application Support" },
  { name: "App Containers", path: "USER_HOME/Library/Containers" },
  { name: "Group Containers", path: "USER_HOME/Library/Group Containers" },
  { name: "Saved App State", path: "USER_HOME/Library/Saved Application State" },
  { name: "User Caches", path: "USER_HOME/Library/Caches" },
  { name: "User Logs", path: "USER_HOME/Library/Logs" },
  { name: "WebKit Data", path: "USER_HOME/Library/WebKit" },
  { name: "Virtual Memory (swap) *", path: "/private/var/vm" },
  { name: "Temporary Files *", path: "/private/var/folders" },
  { name: "System-wide Caches *", path: "/Library/Caches" },
  { name: "System Logs *", path: "/private/var/log" },
  { name: "Spotlight Index *", path: "/.Spotlight-V100" },
  { name: "APFS/System Database *", path: "/private/var/db" },
  {
    name: "Time Machine Snapshots *",
    path: "/Volumes/com.apple.TimeMachine.localsnapshots",
  },
];

export function SystemData() {
  const [results, setResults] = useState<CacheCategory[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Browse state
  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const [browseHistory, setBrowseHistory] = useState<string[]>([]);
  const [browseEntries, setBrowseEntries] = useState<DirEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Delete state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [protectedPaths, setProtectedPaths] = useState<Set<string>>(new Set());

  const scan = useCallback(async () => {
    setScanning(true);
    setResults([]);
    setScannedCount(0);
    setError(null);
    try {
      for (const { name, path } of SCAN_PATHS) {
        try {
          const result = await invoke<CacheCategory | null>(
            "scan_single_path",
            { name, path },
          );
          if (result) {
            setResults((prev) => {
              const next = [...prev, result];
              next.sort((a, b) => b.size_bytes - a.size_bytes);
              return next;
            });
          }
        } catch {
          // skip permission errors
        }
        setScannedCount((prev) => prev + 1);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  const browseDir = useCallback(async (path: string, pushHistory = false) => {
    if (pushHistory && browsePath) {
      setBrowseHistory((prev) => [...prev, browsePath]);
    }
    setBrowsePath(path);
    setBrowseLoading(true);
    setBrowseError(null);
    setBrowseEntries([]);
    setSelected(new Set());
    try {
      const entries = await invoke<DirEntry[]>("get_directory_sizes", {
        path,
      });
      setBrowseEntries(entries);
      // Check which entries are protected
      const info = await checkProtected(entries.map((e) => e.path));
      setProtectedPaths(
        new Set(info.filter((i) => i.is_protected).map((i) => i.path)),
      );
    } catch (e) {
      setBrowseError(String(e));
    } finally {
      setBrowseLoading(false);
    }
  }, [browsePath]);

  const navigateInto = (path: string) => {
    browseDir(path, true);
  };

  const navigateBack = () => {
    const prev = browseHistory[browseHistory.length - 1];
    if (prev) {
      setBrowseHistory((h) => h.slice(0, -1));
      setBrowsePath(prev);
      setBrowseLoading(true);
      setBrowseError(null);
      setBrowseEntries([]);
      setSelected(new Set());
      invoke<DirEntry[]>("get_directory_sizes", { path: prev })
        .then((entries) => setBrowseEntries(entries))
        .catch((e) => setBrowseError(String(e)))
        .finally(() => setBrowseLoading(false));
    } else {
      setBrowsePath(null);
      setBrowseHistory([]);
      setBrowseEntries([]);
      setSelected(new Set());
    }
  };

  const toggleSelect = (path: string) => {
    if (protectedPaths.has(path)) return; // Cannot select protected items
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedSize = browseEntries
    .filter((e) => selected.has(e.path))
    .reduce((sum, e) => sum + e.size_bytes, 0);

  const needsSudo = browsePath
    ? browsePath.startsWith("/private/") ||
      browsePath.startsWith("/Library/") ||
      browsePath.startsWith("/.") ||
      browsePath.startsWith("/Volumes/")
    : false;

  const handleDelete = async () => {
    setShowConfirm(false);
    if (selected.size === 0) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const paths = Array.from(selected);
      const freed = needsSudo
          ? await sudoDeletePaths(paths)
          : await deletePaths(paths);
      setLastFreed(freed);
      setSelected(new Set());
      if (browsePath) await browseDir(browsePath, false);
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  // Auto-scan on mount
  const [mounted, setMounted] = useState(false);
  if (!mounted) {
    setMounted(true);
    scan();
  }

  const totalSize = results.reduce((sum, c) => sum + c.size_bytes, 0);

  // ── Browse view ──
  if (browsePath) {
    const dirName = browsePath.split("/").filter(Boolean).pop() || browsePath;
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={navigateBack}
              className="p-2 bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold truncate">{dirName}</h2>
              <p className="text-text-muted text-xs truncate">{browsePath}</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            {needsSudo && (
              <span className="text-[10px] px-2 py-1 rounded bg-warning/15 text-warning flex items-center gap-1">
                <Lock size={10} />
                requires admin
              </span>
            )}
            <button
              onClick={() => browseDir(browsePath, false)}
              disabled={browseLoading}
              className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw
                size={14}
                className={browseLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={deleting}
                className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={14} />
                {needsSudo ? "Sudo " : ""}Delete ({formatBytes(selectedSize)})
              </button>
            )}
          </div>
        </div>

        {lastFreed !== null && (
          <div className="bg-success/10 border border-success/20 rounded-lg p-3 mb-4 text-sm text-success">
            Freed {formatBytes(lastFreed)} of disk space!
          </div>
        )}

        {(browseError || deleteError) && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4 text-sm text-danger">
            {deleteError || browseError}
          </div>
        )}

        {browseLoading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-text-muted">Loading directory contents...</p>
          </div>
        ) : browseEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Folder size={48} className="text-text-muted mb-4" />
            <p className="text-text-muted">
              Empty or not accessible
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {browseEntries.map((entry) => (
              <div
                key={entry.path}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  selected.has(entry.path)
                    ? "bg-danger/5 border-danger/30"
                    : "bg-surface border-border hover:bg-surface-hover"
                }`}
              >
                {protectedPaths.has(entry.path) ? (
                  <ShieldAlert size={16} className="text-warning shrink-0" />
                ) : (
                  <input
                    type="checkbox"
                    checked={selected.has(entry.path)}
                    onChange={() => toggleSelect(entry.path)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 accent-danger shrink-0"
                  />
                )}
                <div
                  className="flex items-center gap-3 flex-1 min-w-0"
                  onClick={() =>
                    entry.is_dir ? navigateInto(entry.path) : toggleSelect(entry.path)
                  }
                >
                  {entry.is_dir ? (
                    <Folder size={16} className="text-accent shrink-0" />
                  ) : (
                    <File size={16} className="text-text-muted shrink-0" />
                  )}
                  <p className="text-sm truncate flex-1">{entry.name}</p>
                  <p className="text-sm font-semibold shrink-0">
                    {entry.size_display}
                  </p>
                  {entry.is_dir && (
                    <ChevronRight
                      size={14}
                      className="text-text-muted shrink-0"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={showConfirm}
          title="Delete selected items?"
          message={`This will permanently delete ${selected.size} ${selected.size === 1 ? "item" : "items"} (${formatBytes(selectedSize)}). ${needsSudo ? "You will be prompted for your administrator password. " : ""}Deleting system data can affect app behavior. This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      </div>
    );
  }

  // ── Overview view ──
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">System Data</h2>
          <p className="text-text-muted text-sm mt-1">
            What macOS reports as "Systeemgegevens" &middot;{" "}
            {formatBytes(totalSize)} scanned
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          Scan
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mb-4 text-sm text-text-muted">
        Click any category to browse and delete individual items. Items marked
        with * require admin access for accurate sizes.
      </div>

      {scanning && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span>
              Scanning... {scannedCount}/{SCAN_PATHS.length}
            </span>
            <span>
              {Math.round((scannedCount / SCAN_PATHS.length) * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{
                width: `${(scannedCount / SCAN_PATHS.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {results.length === 0 && !scanning ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Database size={48} className="text-text-muted mb-4" />
          <p className="text-text-muted">No system data found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((item: CacheCategory) => {
            const pct =
              totalSize > 0
                ? ((item.size_bytes / totalSize) * 100).toFixed(1)
                : "0";
            const needsRoot = item.name.endsWith("*");
            return (
              <div
                key={item.path}
                onClick={() => navigateInto(item.path)}
                className="bg-surface border border-border rounded-xl p-4 cursor-pointer hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{item.name}</p>
                      {needsRoot && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                          needs root
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted truncate">
                      {item.path}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <div className="text-right">
                      <p className="font-semibold text-sm">
                        {item.size_display}
                      </p>
                      <p className="text-xs text-text-muted">
                        {item.file_count.toLocaleString()} files &middot; {pct}%
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-text-muted" />
                  </div>
                </div>
                <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
