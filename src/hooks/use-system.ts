import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SystemOverview {
  hostname: string;
  os_version: string;
  cpu_brand: string;
  cpu_count: number;
  total_memory_gb: number;
  used_memory_gb: number;
  memory_usage_percent: number;
  total_disk_gb: number;
  used_disk_gb: number;
  disk_usage_percent: number;
}

export interface DiskInfo {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
  mount_point: string;
  fs_type: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  memory_mb: number;
  cpu_percent: number;
}

export interface CacheCategory {
  name: string;
  path: string;
  size_bytes: number;
  size_display: string;
  file_count: number;
}

export interface DirEntry {
  name: string;
  path: string;
  size_bytes: number;
  size_display: string;
  is_dir: boolean;
}

export function useSystemOverview() {
  const [data, setData] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SystemOverview>("get_system_overview");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export function useProcesses() {
  const [data, setData] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ProcessInfo[]>("get_top_processes");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export function useCaches() {
  const [data, setData] = useState<CacheCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<CacheCategory[]>("scan_caches");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export function useLargeFiles() {
  const [data, setData] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (minSizeMb: number = 50) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DirEntry[]>("scan_large_files", {
        minSizeMb,
      });
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export interface StaleNodeModules {
  project_name: string;
  node_modules_path: string;
  size_bytes: number;
  size_display: string;
  days_since_modified: number;
}

export function useStaleNodeModules() {
  const [data, setData] = useState<StaleNodeModules[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (staleDays: number = 30) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<StaleNodeModules[]>(
        "scan_stale_node_modules",
        { staleDays },
      );
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export interface CleanableItem {
  category: string;
  name: string;
  path: string;
  size_bytes: number;
  size_display: string;
  description: string;
}

export function useJunkFiles() {
  const [data, setData] = useState<CleanableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<CleanableItem[]>("scan_junk_files");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export function useSystemData() {
  const [data, setData] = useState<CacheCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<CacheCategory[]>("scan_system_data");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export interface ImageInfo {
  name: string;
  path: string;
  size_bytes: number;
  size_display: string;
  format: string;
  modified_days_ago: number;
  is_screenshot: boolean;
  hash: string;
}

export interface FormatStats {
  format: string;
  count: number;
  size_bytes: number;
  size_display: string;
}

export interface ImageScanResult {
  images: ImageInfo[];
  duplicates: ImageInfo[][];
  format_breakdown: FormatStats[];
  total_size_bytes: number;
  total_count: number;
}

export function useImageScanner() {
  const [data, setData] = useState<ImageScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ImageScanResult>("scan_images");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export interface AppInfo {
  name: string;
  path: string;
  size_bytes: number;
  size_display: string;
  bundle_id: string;
  last_opened_days_ago: number | null;
  is_suspicious: boolean;
  suspicious_reason: string;
}

export function useApplications() {
  const [data, setData] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<AppInfo[]>("scan_applications");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export interface StartupItem {
  name: string;
  path: string;
  item_type: string;
  is_enabled: boolean;
  is_third_party: boolean;
  plist_label: string;
}

export function useStartupItems() {
  const [data, setData] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<StartupItem[]>("scan_startup_items");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export interface DuplicateFile {
  name: string;
  path: string;
  modified_days_ago: number;
}

export interface DuplicateGroup {
  hash: string;
  size_bytes: number;
  size_display: string;
  wasted_bytes: number;
  wasted_display: string;
  files: DuplicateFile[];
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  total_wasted_bytes: number;
  total_wasted_display: string;
  total_groups: number;
}

export function useDuplicates() {
  const [data, setData] = useState<DuplicateScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DuplicateScanResult>("scan_duplicates");
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch };
}

export async function deletePaths(paths: string[]): Promise<number> {
  return invoke<number>("delete_paths", { paths });
}

export async function sudoDeletePaths(paths: string[]): Promise<number> {
  return invoke<number>("sudo_delete_paths", { paths });
}

export interface ProtectedInfo {
  path: string;
  is_protected: boolean;
}

export async function checkProtected(paths: string[]): Promise<ProtectedInfo[]> {
  return invoke<ProtectedInfo[]>("check_protected", { paths });
}
