//! Delivering finished printer bytes to the local printer on Windows.
//!
//! Why not raw USB (WebUSB/libusb), like the web app and the Mac app do:
//! on Windows, once a printer has *any* driver installed for it,
//! `usbprint.sys` claims its USB interface exclusively at the kernel
//! level — WebUSB and a native libusb client hit the identical "Access
//! denied" either way, confirmed against a real TSC TE244 with its
//! official driver installed. Removing the driver works, but is a
//! constant fight against Windows silently reclaiming it.
//!
//! So this goes the other way: instead of fighting the driver for raw
//! access, use it. Windows' print spooler accepts a `RAW` datatype job —
//! bytes handed straight to the device with no GDI/driver re-rendering in
//! between, which is exactly what a pre-built ESC/POS or TSPL job needs.
//! This is done through the actual Win32 spooler API
//! (`OpenPrinter`/`StartDocPrinter`/`WritePrinter`), the same sequence
//! `python-escpos`'s `Win32Raw` connector and most C#/.NET POS software's
//! `RawPrinterHelper` use — not a shell trick. It targets the printer by
//! its name exactly as Windows shows it, with no sharing or other setup
//! needed on the printer itself first.
//!
//! Verified compiling for real on a Windows target via this repo's own
//! CI (GitHub's windows-latest runner) — not just "should work" from
//! reading the API docs. NOT yet verified against a real printer: no
//! Windows machine with a printer attached was available while writing
//! this, so whether a real TSC TE244 actually accepts and prints the
//! bytes this sends is the one thing only a real run can confirm.

#[cfg(windows)]
pub async fn print_raw(bytes: &[u8], printer_name: &str) -> Result<(), String> {
    let name = printer_name.trim();
    if name.is_empty() {
        return Err(
            "Set the printer's name in Settings first — exactly as it appears \
             in Windows' Settings → Bluetooth & devices → Printers & scanners."
                .to_string(),
        );
    }
    let name = name.to_string();
    let bytes = bytes.to_vec();

    // The Win32 calls below are blocking FFI, not async — run them on a
    // blocking thread so they never stall the async runtime the rest of
    // this app's HTTP calls share.
    tokio::task::spawn_blocking(move || print_raw_blocking(&name, &bytes))
        .await
        .map_err(|e| format!("The print task panicked: {e}"))?
}

#[cfg(windows)]
fn print_raw_blocking(printer_name: &str, bytes: &[u8]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    /// A null-terminated UTF-16 buffer, kept alive for as long as the
    /// PWSTR pointing into it is in use — a PWSTR is just a raw pointer,
    /// so the Vec backing it must outlive every call that touches it.
    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let mut printer_name_w = wide(printer_name);
    let mut handle = HANDLE::default();
    unsafe {
        OpenPrinterW(PWSTR(printer_name_w.as_mut_ptr()), &mut handle, None)
            .map_err(|e| {
                format!(
                    "Windows could not find a printer named \"{printer_name}\" ({e}). \
                     Check Settings → Bluetooth & devices → Printers & scanners for the \
                     exact name."
                )
            })?;
    }

    let mut doc_name_w = wide("Skywin Label");
    let mut datatype_w = wide("RAW");
    let doc_info = DOC_INFO_1W {
        pDocName: PWSTR(doc_name_w.as_mut_ptr()),
        pOutputFile: PWSTR::null(),
        pDatatype: PWSTR(datatype_w.as_mut_ptr()),
    };

    // Everything from here on must still close the printer handle even
    // if a step fails partway through, so the actual work runs in a
    // closure and ClosePrinter always runs afterward regardless.
    let result = (|| -> Result<(), String> {
        unsafe {
            let job_id = StartDocPrinterW(handle, 1, &doc_info);
            if job_id == 0 {
                return Err(
                    "Windows refused to start the print job (StartDocPrinter failed) — \
                     the printer may be offline, paused, or out of paper."
                        .to_string(),
                );
            }

            // StartPagePrinter/WritePrinter return a raw BOOL, not a
            // windows::core::Result like OpenPrinterW/StartDocPrinterW do
            // — `.ok()` converts it to one (via GetLastError on failure).
            StartPagePrinter(handle)
                .ok()
                .map_err(|e| format!("StartPagePrinter failed: {e}"))?;

            let mut written: u32 = 0;
            let write_result = WritePrinter(
                handle,
                bytes.as_ptr() as *const _,
                bytes.len() as u32,
                &mut written,
            );

            // Both page and doc must be closed even if the write itself
            // failed, or the job is left stuck open in the queue.
            let _ = EndPagePrinter(handle);
            let _ = EndDocPrinter(handle);

            write_result.ok().map_err(|e| format!("WritePrinter failed: {e}"))?;
            if written as usize != bytes.len() {
                return Err(format!(
                    "Only {written} of {} bytes reached the printer — the job likely \
                     printed incomplete or not at all.",
                    bytes.len()
                ));
            }
        }
        Ok(())
    })();

    unsafe {
        let _ = ClosePrinter(handle);
    }
    result
}

#[cfg(not(windows))]
pub async fn print_raw(_bytes: &[u8], _printer_name: &str) -> Result<(), String> {
    Err("This build isn't running on Windows — raw printing here is a placeholder \
         so the rest of the app still compiles and can be developed on any OS."
        .to_string())
}
