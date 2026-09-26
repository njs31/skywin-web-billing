//! Smoke test against the real production server — not a mock. Run with:
//!   SKYWIN_LABEL_API_KEY=... cargo test --test live_api -- --ignored --nocapture
//! Ignored by default so a normal `cargo test` never depends on network
//! access or a live server being reachable.

#[path = "../src/api.rs"]
mod api;
#[path = "../src/settings.rs"]
mod settings;

use settings::AppSettings;

fn live_settings() -> AppSettings {
    AppSettings {
        server_url: "https://skywin.qwicksapp.com".to_string(),
        api_key: std::env::var("SKYWIN_LABEL_API_KEY").expect("set SKYWIN_LABEL_API_KEY"),
        printer_share: String::new(),
    }
}

#[tokio::test]
#[ignore]
async fn searches_real_products() {
    let settings = live_settings();
    let products = api::search_products(&settings, "").await.expect("search failed");
    assert!(!products.is_empty(), "expected at least one active product");
    println!("first product: {:?}", products[0]);
    for p in products.iter().take(5) {
        assert!(!p.name.is_empty());
        assert!(!p.code.is_empty());
    }
}

#[tokio::test]
#[ignore]
async fn rejects_a_bad_api_key() {
    let mut settings = live_settings();
    settings.api_key = "definitely-not-a-real-key".to_string();
    let result = api::search_products(&settings, "").await;
    assert!(result.is_err());
    let message = result.unwrap_err();
    assert!(
        message.contains("rejected the API key"),
        "expected a clear auth error, got: {message}"
    );
}

#[tokio::test]
#[ignore]
async fn fetches_a_real_test_label_job() {
    let settings = live_settings();
    let bytes = api::test_label_bytes(&settings).await.expect("test-print failed");
    assert!(!bytes.is_empty());
    // ESC/POS jobs from this server always start with the 64-byte lead-in
    // of zero bytes (see lib/escpos-print.ts LEAD_IN_BYTES) — a real sign
    // this is genuine printer bytes, not an HTML error page mis-parsed as
    // a 200.
    assert!(bytes.len() > 64, "job too short to be a real label: {} bytes", bytes.len());
    println!("test label job: {} bytes", bytes.len());
}
