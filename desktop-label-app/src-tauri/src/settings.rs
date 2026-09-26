//! Where the server is, how to authenticate, and which printer share to
//! print to. The same three-value shape the Mac app keeps (server_url,
//! api_key) plus one Windows-specific addition (printer_name) — this app
//! renders nothing itself, so without a server it has nothing to print.
//!
//! Persisted as plain JSON in the app's own data directory rather than a
//! registry key or a Tauri store plugin, so it's trivial to inspect or
//! hand-edit if something goes wrong on a shop's PC.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_server_url")]
    pub server_url: String,
    #[serde(default)]
    pub api_key: String,
    /// The printer's name exactly as Windows shows it in Settings →
    /// Bluetooth & devices → Printers & scanners (e.g. "TSC TE244").
    /// Printed to directly via the Win32 spooler's RAW datatype — see
    /// printer.rs — so no sharing or special setup on the printer itself
    /// is needed, just the name.
    #[serde(default)]
    pub printer_name: String,
    /// "tspl" or "escpos" — which job format to ask the server for. See
    /// lib/label-tspl-server.ts (main repo) for why these are genuinely
    /// different bytes, not just a label on the same ones. Defaults to
    /// "tspl": a real TSC TE244 is the printer this app was built for.
    #[serde(default = "default_printer_lang")]
    pub printer_lang: String,
}

fn default_server_url() -> String {
    "http://localhost:3000".to_string()
}

fn default_printer_lang() -> String {
    "tspl".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            server_url: default_server_url(),
            api_key: String::new(),
            printer_name: String::new(),
            printer_lang: default_printer_lang(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve the app data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(_) => return AppSettings::default(),
    };
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Could not serialise settings: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("Could not write {}: {e}", path.display()))
}
