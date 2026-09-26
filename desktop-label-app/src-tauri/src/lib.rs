mod api;
mod printer;
mod settings;

use settings::AppSettings;
use tauri::AppHandle;

#[tauri::command]
fn get_settings(app: AppHandle) -> AppSettings {
    settings::load(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    settings::save(&app, &settings)
}

#[tauri::command]
async fn search_products(app: AppHandle, query: String) -> Result<Vec<api::Product>, String> {
    let settings = settings::load(&app);
    api::search_products(&settings, &query).await
}

/// Fetch the finished job for `ids`/`copies`, then hand it to the printer.
/// One command, not two, so the frontend never holds raw printer bytes —
/// it only ever sees success or an error message.
#[tauri::command]
async fn print_labels(app: AppHandle, ids: Vec<i64>, copies: u32) -> Result<(), String> {
    let settings = settings::load(&app);
    let bytes = api::label_bytes(&settings, &ids, copies).await?;
    printer::print_raw(&bytes, &settings.printer_name).await
}

#[tauri::command]
async fn print_test_label(app: AppHandle) -> Result<(), String> {
    let settings = settings::load(&app);
    let bytes = api::test_label_bytes(&settings).await?;
    printer::print_raw(&bytes, &settings.printer_name).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            search_products,
            print_labels,
            print_test_label,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
