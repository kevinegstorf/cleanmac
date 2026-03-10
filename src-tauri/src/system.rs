use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use sysinfo::{Disks, Pid, System};

// ─── Protected paths (never delete these) ───────────────────────────
// Paths relative to the user's home directory that must never be deleted.
// Also includes absolute system paths critical to macOS operation.

const PROTECTED_HOME_PATHS: &[&str] = &[
    "Library/Keychains",
    "Library/Preferences",
    "Library/Mail",
    "Library/Messages",
    "Library/Safari/Bookmarks.plist",
    "Library/Safari/History.db",
    "Library/Cookies",
    "Library/Accounts",
    "Library/Calendars",
    "Library/ContactsFoundation",
    "Library/HomeKit",
    "Library/IdentityServices",
    "Library/Biome",
    "Library/DataAccess",
    "Library/Sharing",
    ".ssh",
    ".gnupg",
    ".zshrc",
    ".zprofile",
    ".bash_profile",
    ".bashrc",
    ".gitconfig",
    "Desktop",
    "Documents",
    "Pictures",
    "Music",
    "Movies",
    "Downloads",
];

const PROTECTED_ABSOLUTE_PATHS: &[&str] = &[
    "/System",
    "/usr",
    "/bin",
    "/sbin",
    "/private/var/db/SystemPolicyConfiguration",
    "/private/var/db/dslocal",
    "/Library/Preferences/SystemConfiguration",
    "/Library/Keychains",
    "/private/var/protected",
];

fn is_protected(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // Check absolute protected paths
    for &protected in PROTECTED_ABSOLUTE_PATHS {
        if path_str.as_ref() == protected || path_str.starts_with(&format!("{}/", protected)) {
            return true;
        }
    }

    // Check home-relative protected paths
    if let Some(home) = dirs::home_dir() {
        let home_str = home.to_string_lossy();
        for &rel in PROTECTED_HOME_PATHS {
            let full = format!("{}/{}", home_str, rel);
            if path_str.as_ref() == full || path_str.starts_with(&format!("{}/", full)) {
                return true;
            }
        }
        // Never delete the home directory itself
        if path_str.as_ref() == home_str.as_ref() {
            return true;
        }
    }

    false
}

#[derive(Serialize, Clone)]
pub struct SystemOverview {
    pub hostname: String,
    pub os_version: String,
    pub cpu_brand: String,
    pub cpu_count: usize,
    pub total_memory_gb: f64,
    pub used_memory_gb: f64,
    pub memory_usage_percent: f64,
    pub total_disk_gb: f64,
    pub used_disk_gb: f64,
    pub disk_usage_percent: f64,
}

#[derive(Serialize, Clone)]
pub struct DiskInfo {
    pub total_gb: f64,
    pub used_gb: f64,
    pub free_gb: f64,
    pub usage_percent: f64,
    pub mount_point: String,
    pub fs_type: String,
}

#[derive(Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub memory_mb: f64,
    pub cpu_percent: f32,
}

#[derive(Serialize, Clone)]
pub struct CacheCategory {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub file_count: u64,
}

#[derive(Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub is_dir: bool,
}

#[derive(Serialize, Clone)]
pub struct StaleNodeModules {
    pub project_name: String,
    pub node_modules_path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub days_since_modified: u64,
}

/// A cleanable item found by the system junk scanner
#[derive(Serialize, Clone)]
pub struct CleanableItem {
    pub category: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub description: String,
}

const BYTES_GB: f64 = 1_073_741_824.0;
const BYTES_MB: f64 = 1_048_576.0;

fn format_size(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / BYTES_GB)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / BYTES_MB)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

/// Single-pass directory stats: returns (total_bytes, file_count).
fn dir_stats(path: &Path) -> (u64, u64) {
    let mut size: u64 = 0;
    let mut count: u64 = 0;
    dir_stats_inner(path, &mut size, &mut count);
    (size, count)
}

fn dir_stats_inner(path: &Path, size: &mut u64, count: &mut u64) {
    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            dir_stats_inner(&entry.path(), size, count);
        } else {
            if let Ok(meta) = entry.metadata() {
                *size += meta.len();
            }
            *count += 1;
        }
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

pub fn get_system_overview() -> Result<SystemOverview, Box<dyn std::error::Error>> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let disks = Disks::new_with_refreshed_list();
    let disk = disks
        .iter()
        .find(|d| d.mount_point() == Path::new("/"))
        .or_else(|| disks.iter().next());

    let (total_disk, used_disk) = disk
        .map(|d| {
            let total = d.total_space() as f64 / BYTES_GB;
            let free = d.available_space() as f64 / BYTES_GB;
            (total, total - free)
        })
        .unwrap_or((0.0, 0.0));

    let total_mem = sys.total_memory() as f64 / BYTES_GB;
    let used_mem = sys.used_memory() as f64 / BYTES_GB;

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_default();

    Ok(SystemOverview {
        hostname: System::host_name().unwrap_or_else(|| "Unknown".into()),
        os_version: System::long_os_version().unwrap_or_else(|| "macOS".into()),
        cpu_brand,
        cpu_count: sys.cpus().len(),
        total_memory_gb: round1(total_mem),
        used_memory_gb: round1(used_mem),
        memory_usage_percent: if total_mem > 0.0 {
            ((used_mem / total_mem) * 100.0).round()
        } else {
            0.0
        },
        total_disk_gb: round1(total_disk),
        used_disk_gb: round1(used_disk),
        disk_usage_percent: if total_disk > 0.0 {
            ((used_disk / total_disk) * 100.0).round()
        } else {
            0.0
        },
    })
}

pub fn get_disk_info() -> Result<DiskInfo, Box<dyn std::error::Error>> {
    let disks = Disks::new_with_refreshed_list();
    let disk = disks
        .iter()
        .find(|d| d.mount_point() == Path::new("/"))
        .or_else(|| disks.iter().next())
        .ok_or("No disk found")?;

    let total = disk.total_space() as f64 / BYTES_GB;
    let free = disk.available_space() as f64 / BYTES_GB;
    let used = total - free;

    Ok(DiskInfo {
        total_gb: round1(total),
        used_gb: round1(used),
        free_gb: round1(free),
        usage_percent: if total > 0.0 {
            ((used / total) * 100.0).round()
        } else {
            0.0
        },
        mount_point: disk.mount_point().to_string_lossy().to_string(),
        fs_type: disk.file_system().to_string_lossy().to_string(),
    })
}

pub fn get_top_processes() -> Result<Vec<ProcessInfo>, Box<dyn std::error::Error>> {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_all();

    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(&pid, proc_)| {
            let pid_val: Pid = pid;
            ProcessInfo {
                pid: pid_val.as_u32(),
                name: proc_.name().to_string_lossy().to_string(),
                memory_mb: round1(proc_.memory() as f64 / BYTES_MB),
                cpu_percent: (proc_.cpu_usage() * 10.0).round() / 10.0,
            }
        })
        .collect();

    processes.sort_by(|a, b| {
        b.memory_mb
            .partial_cmp(&a.memory_mb)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    processes.truncate(20);
    Ok(processes)
}

// ─── Cache / junk scanning ──────────────────────────────────────────

pub fn scan_caches() -> Result<Vec<CacheCategory>, Box<dyn std::error::Error>> {
    let home = dirs_home();

    let cache_paths: Vec<(&str, PathBuf)> = vec![
        // ── macOS system ──
        ("System Caches", home.join("Library/Caches")),
        ("Logs", home.join("Library/Logs")),
        ("Crash Reports", home.join("Library/Logs/DiagnosticReports")),
        ("Trash", home.join(".Trash")),
        // ── Xcode / Apple dev ──
        ("Xcode DerivedData", home.join("Library/Developer/Xcode/DerivedData")),
        ("Xcode Archives", home.join("Library/Developer/Xcode/Archives")),
        ("Xcode Device Support", home.join("Library/Developer/Xcode/iOS DeviceSupport")),
        ("Xcode Simulators", home.join("Library/Developer/CoreSimulator/Devices")),
        ("CocoaPods Cache", home.join("Library/Caches/CocoaPods")),
        // ── iOS backups ──
        ("iOS Backups", home.join("Library/Application Support/MobileSync/Backup")),
        // ── JavaScript ──
        ("npm Cache", home.join(".npm")),
        ("pnpm Store", home.join("Library/pnpm/store")),
        ("Yarn Cache", home.join("Library/Caches/Yarn")),
        ("Bun Cache", home.join(".bun/install/cache")),
        // ── Other languages ──
        ("Cargo Cache", home.join(".cargo/registry")),
        ("pip Cache", home.join("Library/Caches/pip")),
        ("Gradle Cache", home.join(".gradle/caches")),
        ("Maven Cache", home.join(".m2/repository")),
        ("Go Module Cache", home.join("go/pkg/mod/cache")),
        ("Composer Cache", home.join("Library/Caches/composer")),
        // ── Homebrew ──
        ("Homebrew Cache", if PathBuf::from("/opt/homebrew/cache").exists() {
            PathBuf::from("/opt/homebrew/cache")
        } else {
            home.join("Library/Caches/Homebrew")
        }),
        // ── Containers & VMs ──
        ("Docker", home.join("Library/Containers/com.docker.docker")),
        ("Orbstack", home.join("Library/Containers/com.orbstack")),
        // ── Browsers ──
        ("Safari Cache", home.join("Library/Caches/com.apple.Safari")),
        ("Chrome Cache", home.join("Library/Caches/Google/Chrome")),
        ("Firefox Cache", home.join("Library/Caches/Firefox")),
        // ── Apps ──
        ("Spotify Cache", home.join("Library/Caches/com.spotify.client")),
        ("Slack Cache", home.join("Library/Caches/com.tinyspeck.slackmacgap")),
        ("Discord Cache", home.join("Library/Caches/com.hnc.Discord")),
        ("Teams Cache", home.join("Library/Caches/com.microsoft.teams2")),
        // ── Mail ──
        ("Mail Downloads", home.join("Library/Containers/com.apple.mail/Data/Library/Mail Downloads")),
        // ── System data (systeemgegevens) ──
        ("Application Support Caches", home.join("Library/Application Support/CrashReporter")),
    ];

    let mut categories: Vec<CacheCategory> = cache_paths
        .into_par_iter()
        .filter_map(|(name, path)| {
            if !path.exists() {
                return None;
            }
            let (size, file_count) = dir_stats(&path);
            if size == 0 {
                return None;
            }
            Some(CacheCategory {
                name: name.to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
                size_display: format_size(size),
                file_count,
            })
        })
        .collect();

    categories.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(categories)
}

// ─── Large files ────────────────────────────────────────────────────

pub fn scan_large_files(min_size_mb: u64) -> Result<Vec<DirEntry>, Box<dyn std::error::Error>> {
    let home = dirs_home();
    let min_bytes = min_size_mb * 1_048_576;

    // Scan user-facing directories deeply
    let scan_dirs = vec![
        home.join("Downloads"),
        home.join("Documents"),
        home.join("Desktop"),
        home.join("Movies"),
        home.join("Music"),
        home.join("Pictures"),
    ];

    let mut large_files: Vec<DirEntry> = scan_dirs
        .into_par_iter()
        .flat_map(|dir| {
            let mut results = Vec::new();
            if dir.exists() {
                scan_dir_for_large_files(&dir, min_bytes, &mut results, 10);
            }
            results
        })
        .collect();

    // Also scan Library for massive files (VM images, iOS backups, etc.)
    let library_dirs = vec![
        home.join("Library/Application Support/MobileSync"),   // iOS backups
        home.join("Library/Developer"),                        // Xcode stuff
        home.join("Library/Containers"),                       // Sandboxed apps
        home.join("Library/Caches"),                           // Caches
        home.join("Library/Application Support"),              // App data
    ];

    let mut library_files: Vec<DirEntry> = library_dirs
        .into_par_iter()
        .flat_map(|dir| {
            let mut results = Vec::new();
            if dir.exists() {
                scan_dir_for_large_files(&dir, min_bytes, &mut results, 6);
            }
            results
        })
        .collect();

    large_files.append(&mut library_files);

    // Also find large files in workspace/dev directories
    let dev_dirs: Vec<PathBuf> = vec![
        "workspace", "projects", "dev", "Developer", "code", "repos", "src", "Sites",
    ]
    .into_iter()
    .map(|d| home.join(d))
    .filter(|d| d.is_dir())
    .collect();

    let mut dev_files: Vec<DirEntry> = dev_dirs
        .into_par_iter()
        .flat_map(|dir| {
            let mut results = Vec::new();
            scan_dir_for_large_files(&dir, min_bytes, &mut results, 6);
            results
        })
        .collect();

    large_files.append(&mut dev_files);
    large_files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    large_files.truncate(200);
    Ok(large_files)
}

fn scan_dir_for_large_files(
    path: &Path,
    min_bytes: u64,
    results: &mut Vec<DirEntry>,
    max_depth: u32,
) {
    if max_depth == 0 {
        return;
    }
    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }
        let entry_path = entry.path();
        if let Some(name) = entry_path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') || name_str == "node_modules" {
                continue;
            }
        }
        if ft.is_dir() {
            scan_dir_for_large_files(&entry_path, min_bytes, results, max_depth - 1);
        } else if let Ok(meta) = entry.metadata() {
            if meta.len() >= min_bytes {
                results.push(DirEntry {
                    name: entry_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    size_bytes: meta.len(),
                    size_display: format_size(meta.len()),
                    is_dir: false,
                });
            }
        }
    }
}

// ─── Installers / junk files (DMG, PKG, ZIP, ISO etc.) ──────────────

/// Scans Downloads (and optionally Desktop) for old installer files,
/// disk images, archives, and other junk that's typically safe to delete.
pub fn scan_junk_files() -> Result<Vec<CleanableItem>, Box<dyn std::error::Error>> {
    let home = dirs_home();

    let scan_dirs = vec![
        home.join("Downloads"),
        home.join("Desktop"),
    ];

    let junk_extensions: &[&str] = &[
        // Disk images & installers
        "dmg", "pkg", "iso", "app",
        // Archives (often extracted and forgotten)
        "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
        // Windows installers (on mac = useless)
        "exe", "msi",
        // Temp / partial downloads
        "part", "crdownload", "download",
        // Logs
        "log",
    ];

    let mut items: Vec<CleanableItem> = scan_dirs
        .into_par_iter()
        .flat_map(|dir| {
            let mut results = Vec::new();
            if !dir.exists() {
                return results;
            }
            collect_junk_files(&dir, junk_extensions, &mut results, 3);
            results
        })
        .collect();

    // Also scan for old screenshots on Desktop
    let desktop = home.join("Desktop");
    if desktop.exists() {
        if let Ok(entries) = fs::read_dir(&desktop) {
            for entry in entries.flatten() {
                let ft = match entry.file_type() {
                    Ok(ft) => ft,
                    Err(_) => continue,
                };
                if ft.is_symlink() || ft.is_dir() {
                    continue;
                }
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                // macOS screenshots: "Screenshot YYYY-MM-DD" or "Schermafbeelding"
                if (name_str.starts_with("Screenshot") || name_str.starts_with("Schermafbeelding"))
                    && (name_str.ends_with(".png") || name_str.ends_with(".jpg"))
                {
                    if let Ok(meta) = entry.metadata() {
                        items.push(CleanableItem {
                            category: "Screenshots".to_string(),
                            name: name_str.to_string(),
                            path: entry.path().to_string_lossy().to_string(),
                            size_bytes: meta.len(),
                            size_display: format_size(meta.len()),
                            description: "Old screenshot".to_string(),
                        });
                    }
                }
            }
        }
    }

    items.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(items)
}

fn collect_junk_files(
    dir: &Path,
    extensions: &[&str],
    results: &mut Vec<CleanableItem>,
    max_depth: u32,
) {
    if max_depth == 0 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }
        let path = entry.path();
        if ft.is_dir() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if !name_str.starts_with('.') {
                collect_junk_files(&path, extensions, results, max_depth - 1);
            }
            continue;
        }
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if extensions.contains(&ext.as_str()) {
            if let Ok(meta) = entry.metadata() {
                let category = match ext.as_str() {
                    "dmg" | "iso" => "Disk Images",
                    "pkg" => "Installers",
                    "zip" | "tar" | "gz" | "bz2" | "xz" | "7z" | "rar" => "Archives",
                    "exe" | "msi" => "Windows Installers",
                    "part" | "crdownload" | "download" => "Incomplete Downloads",
                    "log" => "Log Files",
                    "app" => "Applications",
                    _ => "Other",
                };
                let name_str = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                results.push(CleanableItem {
                    category: category.to_string(),
                    name: name_str,
                    path: path.to_string_lossy().to_string(),
                    size_bytes: meta.len(),
                    size_display: format_size(meta.len()),
                    description: format!(".{} file", ext),
                });
            }
        }
    }
}

// ─── System data (systeemgegevens) ─────────────────────────────────

/// Scans for macOS "System Data" (systeemgegevens) - things that eat disk
/// space in the System Data category of About This Mac.
/// Scan a single directory and return its stats as a CacheCategory.
pub fn scan_single_path(name: &str, path: &str) -> Result<Option<CacheCategory>, Box<dyn std::error::Error>> {
    let resolved = if path.starts_with("USER_HOME") {
        let home = dirs_home();
        home.join(path.strip_prefix("USER_HOME/").unwrap_or(path))
    } else {
        PathBuf::from(path)
    };
    let p = resolved.as_path();
    if !p.exists() {
        return Ok(None);
    }
    let (size, file_count) = dir_stats(p);
    if size == 0 {
        return Ok(None);
    }
    Ok(Some(CacheCategory {
        name: name.to_string(),
        path: p.to_string_lossy().to_string(),
        size_bytes: size,
        size_display: format_size(size),
        file_count,
    }))
}

pub fn scan_system_data() -> Result<Vec<CacheCategory>, Box<dyn std::error::Error>> {
    let home = dirs_home();

    // User-accessible paths (no root needed)
    let user_paths: Vec<(&str, PathBuf)> = vec![
        ("User Library", home.join("Library")),
        ("Application Support", home.join("Library/Application Support")),
        ("App Containers", home.join("Library/Containers")),
        ("Group Containers", home.join("Library/Group Containers")),
        ("Saved App State", home.join("Library/Saved Application State")),
        ("User Caches", home.join("Library/Caches")),
        ("User Logs", home.join("Library/Logs")),
        ("WebKit Data", home.join("Library/WebKit")),
    ];

    // System paths (need root for accurate sizes — will show partial data)
    let system_paths: Vec<(&str, PathBuf)> = vec![
        ("Virtual Memory (swap) *", PathBuf::from("/private/var/vm")),
        ("Temporary Files *", PathBuf::from("/private/var/folders")),
        ("System-wide Caches *", PathBuf::from("/Library/Caches")),
        ("System Logs *", PathBuf::from("/private/var/log")),
        ("Spotlight Index *", PathBuf::from("/.Spotlight-V100")),
        ("APFS/System Database *", PathBuf::from("/private/var/db")),
        ("Time Machine Snapshots *", PathBuf::from("/Volumes/com.apple.TimeMachine.localsnapshots")),
    ];

    let all_paths: Vec<(&str, PathBuf)> = user_paths
        .into_iter()
        .chain(system_paths.into_iter())
        .collect();

    let mut categories: Vec<CacheCategory> = all_paths
        .into_par_iter()
        .filter_map(|(name, path)| {
            if !path.exists() {
                return None;
            }
            let (size, file_count) = dir_stats(&path);
            if size == 0 {
                return None;
            }
            Some(CacheCategory {
                name: name.to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
                size_display: format_size(size),
                file_count,
            })
        })
        .collect();

    categories.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(categories)
}

// ─── Node modules ──────────────────────────────────────────────────

pub fn scan_stale_node_modules(
    stale_days: u64,
) -> Result<Vec<StaleNodeModules>, Box<dyn std::error::Error>> {
    let home = dirs_home();
    let stale_secs = stale_days * 86_400;
    let now = std::time::SystemTime::now();

    // Scan the entire home directory, but skip dirs that definitely
    // won't contain projects to keep it fast
    let skip_dirs: &[&str] = &[
        "Library", "Applications", "Music", "Pictures", "Movies",
        ".Trash", ".npm", ".cargo", ".rustup", ".gradle", ".m2",
        ".local", ".cache", ".docker", ".orbstack", "go",
        "node_modules", ".git", "target", "build", "dist",
        ".next", ".nuxt", "venv", ".venv", "__pycache__",
    ];

    let mut results = Vec::new();
    find_stale_node_modules(&home, stale_secs, now, &mut results, 8, skip_dirs);

    results.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(results)
}

fn find_stale_node_modules(
    dir: &Path,
    stale_secs: u64,
    now: std::time::SystemTime,
    results: &mut Vec<StaleNodeModules>,
    max_depth: u32,
    skip_dirs: &[&str],
) {
    if max_depth == 0 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if ft.is_symlink() || !ft.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str.starts_with('.') {
            continue;
        }

        if name_str == "node_modules" {
            let nm_path = entry.path();
            // Only count if parent has package.json (real JS project)
            if !dir.join("package.json").exists() {
                continue;
            }
            // Use the project activity signal, NOT node_modules dir mtime
            // (Spotlight/antivirus updates the dir mtime even if unused).
            // Check lockfile > package.json > fallback to node_modules.
            let project_mtime = project_last_activity(dir);
            let modified = match project_mtime {
                Some(t) => t,
                None => continue,
            };
            let age_secs = now.duration_since(modified).map(|d| d.as_secs()).unwrap_or(0);
            if age_secs < stale_secs {
                continue;
            }
            let (size, _) = dir_stats(&nm_path);
            if size == 0 {
                continue;
            }
            let project_name = dir
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            results.push(StaleNodeModules {
                project_name,
                node_modules_path: nm_path.to_string_lossy().to_string(),
                size_bytes: size,
                size_display: format_size(size),
                days_since_modified: age_secs / 86_400,
            });
            continue;
        }

        if skip_dirs.contains(&name_str.as_ref()) {
            continue;
        }

        find_stale_node_modules(&entry.path(), stale_secs, now, results, max_depth - 1, skip_dirs);
    }
}

/// Determine last real project activity by checking lockfiles and package.json.
/// These files only change when a developer actually works on the project,
/// unlike node_modules which gets its mtime bumped by Spotlight, fsevents, etc.
fn project_last_activity(project_dir: &Path) -> Option<std::time::SystemTime> {
    let candidates = [
        "pnpm-lock.yaml",
        "package-lock.json",
        "yarn.lock",
        "bun.lockb",
        "package.json",
    ];
    let mut newest: Option<std::time::SystemTime> = None;
    for name in &candidates {
        let path = project_dir.join(name);
        if let Ok(meta) = fs::metadata(&path) {
            if let Ok(mtime) = meta.modified() {
                newest = Some(match newest {
                    Some(prev) if mtime > prev => mtime,
                    Some(prev) => prev,
                    None => mtime,
                });
            }
        }
    }
    newest
}

// ─── Delete / directory sizes ──────────────────────────────────────

pub fn delete_paths(paths: &[String]) -> Result<u64, Box<dyn std::error::Error>> {
    // Check for protected paths first — reject the entire batch if any are protected
    for path_str in paths {
        let path = Path::new(path_str);
        if is_protected(path) {
            return Err(format!(
                "Cannot delete protected path: {}. This file/folder is critical to macOS or your user account.",
                path_str
            ).into());
        }
    }

    let mut freed: u64 = 0;
    for path_str in paths {
        let path = Path::new(path_str);
        if !path.exists() {
            continue;
        }
        let size = if path.is_dir() {
            let (s, _) = dir_stats(path);
            fs::remove_dir_all(path)?;
            s
        } else {
            let meta = path.metadata()?;
            let s = meta.len();
            fs::remove_file(path)?;
            s
        };
        freed += size;
    }
    Ok(freed)
}

/// Delete paths that require root privileges using osascript for elevation.
pub fn sudo_delete_paths(paths: &[String]) -> Result<u64, Box<dyn std::error::Error>> {
    for path_str in paths {
        let path = Path::new(path_str);
        if is_protected(path) {
            return Err(format!(
                "Cannot delete protected path: {}. This file/folder is critical to macOS.",
                path_str
            ).into());
        }
    }

    // Build a shell script that removes each path and prints bytes freed
    let mut script_parts = Vec::new();
    for path_str in paths {
        // Escape single quotes in path
        let escaped = path_str.replace('\'', "'\\''");
        script_parts.push(format!(
            "if [ -e '{}' ]; then du -sk '{}' 2>/dev/null | cut -f1; rm -rf '{}'; else echo 0; fi",
            escaped, escaped, escaped
        ));
    }
    let script = script_parts.join("; ");

    let output = Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "do shell script \"{}\" with administrator privileges",
            script.replace('\\', "\\\\").replace('"', "\\\"")
        ))
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") || stderr.contains("user canceled") {
            return Err("Administrator access was canceled.".into());
        }
        return Err(format!("Failed with admin privileges: {}", stderr).into());
    }

    // Parse du output (in KB) and sum up
    let stdout = String::from_utf8_lossy(&output.stdout);
    let freed: u64 = stdout
        .lines()
        .filter_map(|line| line.trim().parse::<u64>().ok())
        .sum::<u64>()
        * 1024; // du -sk reports in KB

    Ok(freed)
}

/// Check if a path is protected from deletion.
pub fn check_protected(paths: &[String]) -> Vec<ProtectedInfo> {
    paths
        .iter()
        .map(|p| {
            let protected = is_protected(Path::new(p));
            ProtectedInfo {
                path: p.clone(),
                is_protected: protected,
            }
        })
        .collect()
}

#[derive(Serialize, Clone)]
pub struct ProtectedInfo {
    pub path: String,
    pub is_protected: bool,
}

pub fn get_directory_sizes(path: &str) -> Result<Vec<DirEntry>, Box<dyn std::error::Error>> {
    let dir = Path::new(path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Directory does not exist".into());
    }

    let dir_entries: Vec<_> = fs::read_dir(dir)?
        .flatten()
        .filter(|e| {
            e.file_type()
                .map(|ft| !ft.is_symlink())
                .unwrap_or(false)
        })
        .collect();

    let mut entries: Vec<DirEntry> = dir_entries
        .into_par_iter()
        .map(|entry| {
            let path = entry.path();
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
            let size = if is_dir {
                let (s, _) = dir_stats(&path);
                s
            } else {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            };
            DirEntry {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
                size_display: format_size(size),
                is_dir,
            }
        })
        .collect();

    entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(entries)
}

// ─── Image scanning ────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct ImageInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub format: String,
    pub modified_days_ago: u64,
    pub is_screenshot: bool,
    pub hash: String,
}

#[derive(Serialize, Clone)]
pub struct ImageScanResult {
    pub images: Vec<ImageInfo>,
    pub duplicates: Vec<Vec<ImageInfo>>,
    pub format_breakdown: Vec<FormatStats>,
    pub total_size_bytes: u64,
    pub total_count: u64,
}

#[derive(Serialize, Clone)]
pub struct FormatStats {
    pub format: String,
    pub count: u64,
    pub size_bytes: u64,
    pub size_display: String,
}

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "svg", "ico",
    "heic", "heif", "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2",
    "psd", "xcf",
];

fn ext_to_format(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "JPEG",
        "png" => "PNG",
        "heic" | "heif" => "HEIC",
        "cr2" | "cr3" | "nef" | "arw" | "dng" | "orf" | "rw2" | "raw" => "RAW",
        "psd" => "PSD",
        "tiff" | "tif" => "TIFF",
        "gif" => "GIF",
        "webp" => "WebP",
        "svg" => "SVG",
        "bmp" => "BMP",
        "ico" => "ICO",
        "xcf" => "XCF",
        _ => "Other",
    }
}

fn is_screenshot_name(name: &str) -> bool {
    name.starts_with("Screenshot")
        || name.starts_with("Schermafbeelding")
        || name.starts_with("Screen Shot")
        || name.starts_with("Capture")
        || name.starts_with("CleanShot")
        || name.to_lowercase().contains("screenshot")
}

fn hash_file_head(path: &Path, file_size: u64) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::io::Read;

    let mut hasher = DefaultHasher::new();
    file_size.hash(&mut hasher);

    if let Ok(mut f) = fs::File::open(path) {
        let mut buf = [0u8; 8192];
        if let Ok(n) = f.read(&mut buf) {
            buf[..n].hash(&mut hasher);
        }
    }

    format!("{:016x}", hasher.finish())
}

fn collect_images(
    dir: &Path,
    results: &mut Vec<ImageInfo>,
    max_depth: u32,
    now: std::time::SystemTime,
) {
    if max_depth == 0 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }
        let entry_path = entry.path();
        if let Some(name) = entry_path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') {
                continue;
            }
            let skip = ["node_modules", ".git", "target", "build", "dist"];
            if skip.contains(&name_str.as_ref()) {
                continue;
            }
        }
        if ft.is_dir() {
            collect_images(&entry_path, results, max_depth - 1, now);
            continue;
        }
        let ext = entry_path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let file_size = meta.len();
        let modified_days_ago = meta
            .modified()
            .ok()
            .and_then(|mt| now.duration_since(mt).ok())
            .map(|d| d.as_secs() / 86_400)
            .unwrap_or(0);
        let name_str = entry_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let format = ext_to_format(&ext).to_string();
        let hash = hash_file_head(&entry_path, file_size);

        results.push(ImageInfo {
            name: name_str.clone(),
            path: entry_path.to_string_lossy().to_string(),
            size_bytes: file_size,
            size_display: format_size(file_size),
            format,
            modified_days_ago,
            is_screenshot: is_screenshot_name(&name_str),
            hash,
        });
    }
}

pub fn scan_images() -> Result<ImageScanResult, Box<dyn std::error::Error>> {
    let home = dirs_home();
    let now = std::time::SystemTime::now();

    let scan_dirs: Vec<PathBuf> = vec![
        home.join("Pictures"),
        home.join("Desktop"),
        home.join("Downloads"),
        home.join("Documents"),
        home.join("Library/Mobile Documents"),
        home.join("workspace"),
        home.join("projects"),
        home.join("dev"),
        home.join("Developer"),
    ];

    let mut images: Vec<ImageInfo> = scan_dirs
        .into_par_iter()
        .flat_map(|dir| {
            let mut results = Vec::new();
            if dir.exists() {
                collect_images(&dir, &mut results, 10, now);
            }
            results
        })
        .collect();

    // Sort by size descending
    images.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    // Build duplicates: group by hash
    let mut hash_groups: HashMap<String, Vec<ImageInfo>> = HashMap::new();
    for img in &images {
        hash_groups
            .entry(img.hash.clone())
            .or_default()
            .push(img.clone());
    }
    let duplicates: Vec<Vec<ImageInfo>> = hash_groups
        .into_values()
        .filter(|group| group.len() > 1)
        .collect();

    // Format breakdown
    let mut format_map: HashMap<String, (u64, u64)> = HashMap::new();
    for img in &images {
        let entry = format_map.entry(img.format.clone()).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += img.size_bytes;
    }
    let mut format_breakdown: Vec<FormatStats> = format_map
        .into_iter()
        .map(|(format, (count, size_bytes))| FormatStats {
            format,
            count,
            size_bytes,
            size_display: format_size(size_bytes),
        })
        .collect();
    format_breakdown.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    let total_size_bytes = images.iter().map(|i| i.size_bytes).sum();
    let total_count = images.len() as u64;

    Ok(ImageScanResult {
        images,
        duplicates,
        format_breakdown,
        total_size_bytes,
        total_count,
    })
}

// ─── Applications scanner ───────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub bundle_id: String,
    pub last_opened_days_ago: Option<u64>,
    pub is_suspicious: bool,
    pub suspicious_reason: String,
}

const ADWARE_BUNDLE_IDS: &[&str] = &[
    "mackeeper", "cleanmymac", "zeobit", "macbooster", "advanced-mac-cleaner",
    "pcvark", "search-operator", "searchmine", "trovi", "conduit", "genieo",
    "vsearch", "crossrider", "operatorhelp", "spchlpr", "mughthesec",
];

const ADWARE_APP_NAMES: &[&str] = &["Adware", "Toolbar", "Search Protect", "Coupon"];

fn extract_bundle_id(app_path: &Path) -> String {
    let plist_path = app_path.join("Contents/Info.plist");
    let content = match fs::read_to_string(&plist_path) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        if line.contains("CFBundleIdentifier") {
            // The value is on the next line between <string> tags
            if let Some(next_line) = lines.get(i + 1) {
                let trimmed = next_line.trim();
                if let (Some(start), Some(end)) = (trimmed.find("<string>"), trimmed.find("</string>")) {
                    return trimmed[start + 8..end].to_string();
                }
            }
        }
    }
    String::new()
}

fn check_suspicious(name: &str, bundle_id: &str) -> (bool, String) {
    let bid_lower = bundle_id.to_lowercase();
    for pattern in ADWARE_BUNDLE_IDS {
        if bid_lower.contains(pattern) {
            return (true, format!("Known adware/PUP bundle ID: {}", pattern));
        }
    }
    for pattern in ADWARE_APP_NAMES {
        if name.contains(pattern) {
            return (true, format!("Suspicious app name contains: {}", pattern));
        }
    }
    (false, String::new())
}

pub fn scan_applications() -> Result<Vec<AppInfo>, Box<dyn std::error::Error>> {
    let home = dirs_home();
    let now = std::time::SystemTime::now();

    let app_dirs = vec![
        PathBuf::from("/Applications"),
        home.join("Applications"),
    ];

    let app_paths: Vec<PathBuf> = app_dirs
        .into_iter()
        .filter(|d| d.exists())
        .flat_map(|d| {
            fs::read_dir(&d)
                .into_iter()
                .flat_map(|entries| entries.flatten())
                .filter(|e| {
                    e.path()
                        .extension()
                        .map(|ext| ext == "app")
                        .unwrap_or(false)
                })
                .map(|e| e.path())
                .collect::<Vec<_>>()
        })
        .collect();

    let mut apps: Vec<AppInfo> = app_paths
        .into_par_iter()
        .filter_map(|app_path| {
            let name = app_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let (size, _) = dir_stats(&app_path);
            let bundle_id = extract_bundle_id(&app_path);
            let last_opened_days_ago = app_path
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|mt| now.duration_since(mt).ok())
                .map(|d| d.as_secs() / 86_400);
            let (is_suspicious, suspicious_reason) = check_suspicious(&name, &bundle_id);

            Some(AppInfo {
                name,
                path: app_path.to_string_lossy().to_string(),
                size_bytes: size,
                size_display: format_size(size),
                bundle_id,
                last_opened_days_ago,
                is_suspicious,
                suspicious_reason,
            })
        })
        .collect();

    apps.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(apps)
}

// ─── Startup items ──────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct StartupItem {
    pub name: String,
    pub path: String,
    pub item_type: String,
    pub is_enabled: bool,
    pub is_third_party: bool,
    pub plist_label: String,
}

fn extract_plist_label(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed == "<key>Label</key>" {
            if let Some(next_line) = lines.get(i + 1) {
                let next_trimmed = next_line.trim();
                if let (Some(start), Some(end)) = (next_trimmed.find("<string>"), next_trimmed.find("</string>")) {
                    return next_trimmed[start + 8..end].to_string();
                }
            }
        }
    }
    String::new()
}

fn is_plist_disabled(content: &str) -> bool {
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed == "<key>Disabled</key>" {
            if let Some(next_line) = lines.get(i + 1) {
                return next_line.trim() == "<true/>";
            }
        }
    }
    false
}

pub fn scan_startup_items() -> Result<Vec<StartupItem>, Box<dyn std::error::Error>> {
    let home = dirs_home();

    let scan_dirs: Vec<(PathBuf, &str)> = vec![
        (home.join("Library/LaunchAgents"), "Launch Agent"),
        (PathBuf::from("/Library/LaunchAgents"), "Launch Agent"),
        (PathBuf::from("/Library/LaunchDaemons"), "Launch Daemon"),
    ];

    let plist_entries: Vec<(PathBuf, String)> = scan_dirs
        .into_iter()
        .filter(|(d, _)| d.exists())
        .flat_map(|(dir, item_type)| {
            fs::read_dir(&dir)
                .into_iter()
                .flat_map(|entries| entries.flatten())
                .filter(|e| {
                    e.path()
                        .extension()
                        .map(|ext| ext == "plist")
                        .unwrap_or(false)
                })
                .map(|e| (e.path(), item_type.to_string()))
                .collect::<Vec<_>>()
        })
        .collect();

    let mut items: Vec<StartupItem> = plist_entries
        .into_par_iter()
        .filter_map(|(plist_path, item_type)| {
            let content = fs::read_to_string(&plist_path).ok()?;
            let label = extract_plist_label(&content);
            let is_enabled = !is_plist_disabled(&content);
            let is_third_party = !label.starts_with("com.apple.");
            let name = plist_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            Some(StartupItem {
                name,
                path: plist_path.to_string_lossy().to_string(),
                item_type,
                is_enabled,
                is_third_party,
                plist_label: label,
            })
        })
        .collect();

    items.sort_by(|a, b| {
        b.is_third_party
            .cmp(&a.is_third_party)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(items)
}

// ─── Duplicate file finder ──────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub wasted_bytes: u64,
    pub wasted_display: String,
    pub files: Vec<DuplicateFile>,
}

#[derive(Serialize, Clone)]
pub struct DuplicateFile {
    pub name: String,
    pub path: String,
    pub modified_days_ago: u64,
}

#[derive(Serialize, Clone)]
pub struct DuplicateScanResult {
    pub groups: Vec<DuplicateGroup>,
    pub total_wasted_bytes: u64,
    pub total_wasted_display: String,
    pub total_groups: u64,
}

fn collect_files_for_duplicates(
    dir: &Path,
    results: &mut Vec<(u64, PathBuf)>,
    max_depth: u32,
    now: std::time::SystemTime,
) {
    if max_depth == 0 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }
        let entry_path = entry.path();
        if let Some(name) = entry_path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') {
                continue;
            }
            let skip = ["node_modules", ".git", "target", "build", "dist"];
            if skip.contains(&name_str.as_ref()) {
                continue;
            }
        }
        if ft.is_dir() {
            collect_files_for_duplicates(&entry_path, results, max_depth - 1, now);
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let size = meta.len();
            if size >= 1024 {
                results.push((size, entry_path));
            }
        }
    }
}

pub fn scan_duplicates() -> Result<DuplicateScanResult, Box<dyn std::error::Error>> {
    let home = dirs_home();
    let now = std::time::SystemTime::now();

    let scan_dirs = vec![
        home.join("Downloads"),
        home.join("Documents"),
        home.join("Desktop"),
        home.join("Pictures"),
        home.join("Music"),
    ];

    // Phase 1: collect all files with their sizes
    let mut all_files: Vec<(u64, PathBuf)> = scan_dirs
        .into_par_iter()
        .flat_map(|dir| {
            let mut results = Vec::new();
            if dir.exists() {
                collect_files_for_duplicates(&dir, &mut results, 10, now);
            }
            results
        })
        .collect();

    // Group by size
    let mut size_groups: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for (size, path) in all_files.drain(..) {
        size_groups.entry(size).or_default().push(path);
    }

    // Keep only groups with 2+ files
    let size_matched: Vec<(u64, Vec<PathBuf>)> = size_groups
        .into_iter()
        .filter(|(_, paths)| paths.len() >= 2)
        .collect();

    // Phase 2: hash first 8KB for confirmation
    let hash_groups_vec: Vec<(String, u64, PathBuf)> = size_matched
        .into_par_iter()
        .flat_map(|(size, paths)| {
            paths
                .into_iter()
                .map(|p| {
                    let hash = hash_file_head(&p, size);
                    (hash, size, p)
                })
                .collect::<Vec<_>>()
        })
        .collect();

    let mut hash_map: HashMap<String, (u64, Vec<PathBuf>)> = HashMap::new();
    for (hash, size, path) in hash_groups_vec {
        hash_map.entry(hash).or_insert_with(|| (size, Vec::new())).1.push(path);
    }

    let mut groups: Vec<DuplicateGroup> = hash_map
        .into_iter()
        .filter(|(_, (_, paths))| paths.len() >= 2)
        .map(|(hash, (size, paths))| {
            let files: Vec<DuplicateFile> = paths
                .into_iter()
                .map(|p| {
                    let modified_days_ago = p
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|mt| now.duration_since(mt).ok())
                        .map(|d| d.as_secs() / 86_400)
                        .unwrap_or(0);
                    DuplicateFile {
                        name: p
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
                        path: p.to_string_lossy().to_string(),
                        modified_days_ago,
                    }
                })
                .collect();
            let wasted = (files.len() as u64 - 1) * size;
            DuplicateGroup {
                hash,
                size_bytes: size,
                size_display: format_size(size),
                wasted_bytes: wasted,
                wasted_display: format_size(wasted),
                files,
            }
        })
        .collect();

    groups.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes));
    groups.truncate(100);

    let total_wasted: u64 = groups.iter().map(|g| g.wasted_bytes).sum();

    Ok(DuplicateScanResult {
        total_groups: groups.len() as u64,
        total_wasted_bytes: total_wasted,
        total_wasted_display: format_size(total_wasted),
        groups,
    })
}

fn dirs_home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/Users/default".to_string()))
}
