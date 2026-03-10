import {
  LayoutDashboard,
  Trash2,
  FileSearch,
  Activity,
  Package,
  Archive,
  Database,
  Image,
  Copy,
  AppWindow,
  Zap,
  Wrench,
} from "lucide-react";

export type Page =
  | "dashboard"
  | "caches"
  | "junk-files"
  | "images"
  | "duplicates"
  | "large-files"
  | "applications"
  | "node-modules"
  | "startup"
  | "maintenance"
  | "system-data"
  | "processes";

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { id: "caches", label: "Cache Cleaner", icon: <Trash2 size={20} /> },
  { id: "junk-files", label: "Junk Files", icon: <Archive size={20} /> },
  { id: "images", label: "Images", icon: <Image size={20} /> },
  { id: "duplicates", label: "Duplicates", icon: <Copy size={20} /> },
  { id: "large-files", label: "Large Files", icon: <FileSearch size={20} /> },
  { id: "applications", label: "Applications", icon: <AppWindow size={20} /> },
  { id: "node-modules", label: "Node Modules", icon: <Package size={20} /> },
  { id: "startup", label: "Startup Items", icon: <Zap size={20} /> },
  { id: "maintenance", label: "Maintenance", icon: <Wrench size={20} /> },
  { id: "system-data", label: "System Data", icon: <Database size={20} /> },
  { id: "processes", label: "Processes", icon: <Activity size={20} /> },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="p-5 pb-3">
        <h1 className="text-lg font-bold tracking-tight">CleanMac</h1>
        <p className="text-xs text-text-muted mt-0.5">Storage Manager</p>
      </div>
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activePage === item.id
                ? "bg-accent/15 text-accent-hover"
                : "text-text-muted hover:bg-surface-hover hover:text-text"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-4 text-xs text-text-muted border-t border-border">
        v0.1.0
      </div>
    </aside>
  );
}
