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
//! between, which is exactly what a pre-built ESC/POS or TSPL job needs
//! and is the standard way POS software prints to a receipt/label printer
//! on Windows. The simplest reliable way to submit one without brittle
//! WinAPI FFI (which can't be compiled or checked from this dev machine,
//! only a real Windows box can) is the same one many POS tools use: copy
//! the bytes, in binary mode, to the printer's own *share*.
//!
//! One-time setup this requires, done once in Windows' own UI, not here:
//! Printer Properties → Sharing → "Share this printer" → give it a name
//! (that name is what `printer_share` in Settings must match).
//!
//! NOT verified against a real Windows machine — no Windows box was
//! available while writing this, only cross-checked as a standard,
//! widely-documented technique. If `copy /b` itself turns out unreliable
//! for binary ESC/POS/TSPL bytes on a real run, the next thing to try is
//! the Win32 spooler API's `RAW` datatype directly (`OpenPrinter` /
//! `StartDocPrinter` / `WritePrinter`) — a real Windows dev box is needed
//! to get that FFI right, which this one wasn't.

#[cfg(windows)]
pub async fn print_raw(bytes: &[u8], printer_share: &str) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let share = printer_share.trim();
    if share.is_empty() {
        return Err(
            "Set the printer's share name in Settings first — Printer Properties → \
             Sharing → \"Share this printer\" on the printer you want to use."
                .to_string(),
        );
    }

    let mut path = std::env::temp_dir();
    let unique = format!(
        "skywin-label-{}-{}.bin",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    path.push(unique);

    let mut file = tokio::fs::File::create(&path)
        .await
        .map_err(|e| format!("Could not create a temporary print file: {e}"))?;
    file.write_all(bytes)
        .await
        .map_err(|e| format!("Could not write the print job to disk: {e}"))?;
    file.flush().await.ok();
    drop(file);

    let target = format!("\\\\localhost\\{share}");
    let mut cmd = tokio::process::Command::new("cmd");
    cmd.args(["/C", "copy", "/b", &path.to_string_lossy(), &target]);
    // Without this, spawning cmd.exe from a GUI app briefly flashes a
    // black console window on screen for every single print — harmless,
    // but looks like an error to anyone watching. CREATE_NO_WINDOW
    // suppresses that entirely; the command still runs the same way.
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().await;

    // Best-effort cleanup either way — a leftover temp file is harmless,
    // but there is no reason to keep it around on success or failure.
    let _ = tokio::fs::remove_file(&path).await;

    let output = output.map_err(|e| format!("Could not run the Windows copy command: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Windows refused the print job (share \"{share}\" — check the name matches \
             exactly, and that the printer is shared).\n\n{}",
            if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
pub async fn print_raw(_bytes: &[u8], _printer_share: &str) -> Result<(), String> {
    Err("This build isn't running on Windows — raw printing here is a placeholder \
         so the rest of the app still compiles and can be developed on any OS."
        .to_string())
}
