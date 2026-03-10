mod system;

use system::{
    AppInfo, CacheCategory, CleanableItem, DirEntry, DiskInfo, DuplicateScanResult,
    ImageScanResult, ProcessInfo, ProtectedInfo, StaleNodeModules, StartupItem, SystemOverview,
};

async fn spawn_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_system_overview() -> Result<SystemOverview, String> {
    spawn_blocking(|| system::get_system_overview().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn get_disk_info() -> Result<DiskInfo, String> {
    spawn_blocking(|| system::get_disk_info().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn get_top_processes() -> Result<Vec<ProcessInfo>, String> {
    spawn_blocking(|| system::get_top_processes().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_caches() -> Result<Vec<CacheCategory>, String> {
    spawn_blocking(|| system::scan_caches().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_large_files(min_size_mb: u64) -> Result<Vec<DirEntry>, String> {
    spawn_blocking(move || system::scan_large_files(min_size_mb).map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn delete_paths(paths: Vec<String>) -> Result<u64, String> {
    spawn_blocking(move || system::delete_paths(&paths).map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn get_directory_sizes(path: String) -> Result<Vec<DirEntry>, String> {
    spawn_blocking(move || system::get_directory_sizes(&path).map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_stale_node_modules(stale_days: u64) -> Result<Vec<StaleNodeModules>, String> {
    spawn_blocking(move || {
        system::scan_stale_node_modules(stale_days).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn scan_junk_files() -> Result<Vec<CleanableItem>, String> {
    spawn_blocking(|| system::scan_junk_files().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_system_data() -> Result<Vec<CacheCategory>, String> {
    spawn_blocking(|| system::scan_system_data().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_single_path(name: String, path: String) -> Result<Option<CacheCategory>, String> {
    spawn_blocking(move || system::scan_single_path(&name, &path).map_err(|e| e.to_string()))
        .await
}

#[tauri::command]
async fn scan_images() -> Result<ImageScanResult, String> {
    spawn_blocking(|| system::scan_images().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_applications() -> Result<Vec<AppInfo>, String> {
    spawn_blocking(|| system::scan_applications().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_startup_items() -> Result<Vec<StartupItem>, String> {
    spawn_blocking(|| system::scan_startup_items().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn scan_duplicates() -> Result<DuplicateScanResult, String> {
    spawn_blocking(|| system::scan_duplicates().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn sudo_delete_paths(paths: Vec<String>) -> Result<u64, String> {
    spawn_blocking(move || system::sudo_delete_paths(&paths).map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn check_protected(paths: Vec<String>) -> Result<Vec<ProtectedInfo>, String> {
    Ok(system::check_protected(&paths))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_overview,
            get_disk_info,
            get_top_processes,
            scan_caches,
            scan_large_files,
            delete_paths,
            get_directory_sizes,
            scan_stale_node_modules,
            scan_junk_files,
            scan_system_data,
            scan_single_path,
            scan_images,
            scan_applications,
            scan_startup_items,
            scan_duplicates,
            sudo_delete_paths,
            check_protected,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
