import { useEffect, useRef } from "react";
import { Cpu, HardDrive, MemoryStick, Monitor } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useSystemOverview } from "../hooks/use-system";

const COLORS = {
  disk: { used: "#6366f1", free: "#2a2a3a" },
  memory: { used: "#22c55e", free: "#2a2a3a" },
};

function UsageRing({
  percent,
  used,
  free,
  usedLabel,
  freeLabel,
  color,
}: {
  percent: number;
  used: number;
  free: number;
  usedLabel: string;
  freeLabel: string;
  color: { used: string; free: string };
}) {
  const chartData = [
    { name: "Used", value: used },
    { name: "Free", value: free },
  ];

  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={40}
              dataKey="value"
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
            >
              <Cell fill={color.used} />
              <Cell fill={color.free} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-2xl font-bold">{percent}%</p>
        <p className="text-xs text-text-muted">{usedLabel} used</p>
        <p className="text-xs text-text-muted">{freeLabel} free</p>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <p className="text-sm font-medium text-text-muted">{title}</p>
      </div>
      {children}
    </div>
  );
}

export function Dashboard() {
  const { data, loading, error, fetch } = useSystemOverview();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch]);

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-muted">Loading system info...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const diskFree = data.total_disk_gb - data.used_disk_gb;
  const memFree = data.total_memory_gb - data.used_memory_gb;

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-text-muted text-sm mt-1">
            {data.hostname} &middot; {data.os_version}
          </p>
        </div>
        <button
          onClick={fetch}
          className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors cursor-pointer"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          icon={<HardDrive size={18} className="text-accent" />}
          title="Disk Usage"
        >
          <UsageRing
            percent={data.disk_usage_percent}
            used={data.used_disk_gb}
            free={diskFree}
            usedLabel={`${data.used_disk_gb} / ${data.total_disk_gb} GB`}
            freeLabel={`${diskFree.toFixed(1)} GB`}
            color={COLORS.disk}
          />
        </StatCard>

        <StatCard
          icon={<MemoryStick size={18} className="text-success" />}
          title="Memory"
        >
          <UsageRing
            percent={data.memory_usage_percent}
            used={data.used_memory_gb}
            free={memFree}
            usedLabel={`${data.used_memory_gb} / ${data.total_memory_gb} GB`}
            freeLabel={`${memFree.toFixed(1)} GB`}
            color={COLORS.memory}
          />
        </StatCard>

        <StatCard
          icon={<Cpu size={18} className="text-warning" />}
          title="CPU"
        >
          <p className="text-lg font-semibold">{data.cpu_brand}</p>
          <p className="text-sm text-text-muted">{data.cpu_count} cores</p>
        </StatCard>

        <StatCard
          icon={<Monitor size={18} className="text-danger" />}
          title="System"
        >
          <p className="text-lg font-semibold">{data.hostname}</p>
          <p className="text-sm text-text-muted">{data.os_version}</p>
        </StatCard>
      </div>

      <p className="text-xs text-text-muted text-center">
        Auto-refreshes every 30s
      </p>
    </div>
  );
}
