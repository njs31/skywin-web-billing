//! Client for the Skywin server — the same three endpoints the Mac and
//! Android label apps use (see mac/Sources/Api.swift). Deliberately thin:
//! the server renders the label and returns finished printer bytes, so the
//! label design lives in one place and changing it needs no rebuild of
//! this app.

use crate::settings::AppSettings;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub mrp: String,
    pub stock: String,
    #[serde(default)]
    pub expiry: String,
}

#[derive(Deserialize)]
struct ProductsResponse {
    products: Vec<Product>,
}

fn base_url(settings: &AppSettings) -> Result<String, String> {
    let trimmed = settings.server_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Set the server address in Settings first.".to_string());
    }
    Ok(trimmed.to_string())
}

async fn get_bytes(settings: &AppSettings, path: &str) -> Result<Vec<u8>, String> {
    let url = format!("{}{}", base_url(settings)?, path);
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("x-api-key", settings.api_key.clone())
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Could not reach the server: {e}"))?;

    let status = res.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("The server rejected the API key. Check it in Settings.".to_string());
    }
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Server error {}. {}", status.as_u16(), truncate(&body, 200)));
    }
    res.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Could not read the server's response: {e}"))
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

pub async fn search_products(settings: &AppSettings, query: &str) -> Result<Vec<Product>, String> {
    let encoded = urlencoding_light(query);
    let bytes = get_bytes(settings, &format!("/api/labels/products?limit=100&q={encoded}")).await?;
    let parsed: ProductsResponse = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Unexpected response from the server: {e}"))?;
    Ok(parsed.products)
}

/// "tspl" or "escpos" — never anything else, since it goes straight into
/// a URL. Anything unrecognised falls back to "escpos" rather than
/// silently sending a stray value the server doesn't understand.
fn lang_param(settings: &AppSettings) -> &'static str {
    if settings.printer_lang.trim().eq_ignore_ascii_case("tspl") {
        "tspl"
    } else {
        "escpos"
    }
}

/// Finished printer bytes for the chosen products.
pub async fn label_bytes(settings: &AppSettings, ids: &[i64], copies: u32) -> Result<Vec<u8>, String> {
    let list = ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    let lang = lang_param(settings);
    let bytes = get_bytes(
        settings,
        &format!("/api/labels/print?ids={list}&copies={copies}&lang={lang}"),
    )
    .await?;
    if bytes.is_empty() {
        return Err("The server returned an empty print job.".to_string());
    }
    Ok(bytes)
}

/// One diagnostic label: no product, no database row, just the printer.
pub async fn test_label_bytes(settings: &AppSettings) -> Result<Vec<u8>, String> {
    let lang = lang_param(settings);
    let bytes = get_bytes(settings, &format!("/api/labels/test-print?lang={lang}")).await?;
    if bytes.is_empty() {
        return Err("The server returned an empty print job.".to_string());
    }
    Ok(bytes)
}

/// Minimal query-string escaping — the only characters a product search
/// ever needs to carry safely are spaces and the odd punctuation mark.
/// Not a full percent-encoder; kept dependency-free on purpose.
fn urlencoding_light(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
