import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useProcesses } from "../hooks/use-system";

export function Processes() {
  const { data, loading, error, fetch } = useProcesses();

  useEffect(() => {
    fetch();
  }, [fetch]);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Processes</h2>
          <p className="text-text-muted text-sm mt-1">
            Top 20 processes by memory usage
          </p>
        </div>
        <button
          onClick={fetch}
          disabled={loading}
          className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-text-muted">Loading processes...</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                  Process
                </th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider text-right">
                  PID
                </th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider text-right">
                  Memory
                </th>
                <th className="px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider text-right">
                  CPU
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((proc, i) => (
                <tr
                  key={`${proc.pid}-${i}`}
                  className="border-b border-border/50 hover:bg-surface-hover transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    {proc.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted text-right">
                    {proc.pid}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span
                      className={
                        proc.memory_mb > 500
                          ? "text-danger"
                          : proc.memory_mb > 200
                            ? "text-warning"
                            : ""
                      }
                    >
                      {proc.memory_mb.toFixed(1)} MB
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span
                      className={
                        proc.cpu_percent > 50
                          ? "text-danger"
                          : proc.cpu_percent > 20
                            ? "text-warning"
                            : ""
                      }
                    >
                      {proc.cpu_percent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
