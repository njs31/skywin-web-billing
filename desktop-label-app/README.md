# Skywin Labels (Windows)

A native product list + label printing app for Windows, built with
[Tauri](https://tauri.app). It renders nothing itself: it asks the Skywin
server for a finished, ready-to-print job and hands the bytes straight to
the local printer — the same contract the Mac app (`../mac`) and the
Android app already use, so the label design lives in one place
(`lib/label-layout.ts` in the main repo) and changing it needs no rebuild
here.

## Why this exists, not just the web app in a browser

On Windows, once *any* driver is installed for a USB printer, the OS
(`usbprint.sys`) claims its interface exclusively — Chrome's WebUSB and a
native app trying raw USB access both get refused with "Access denied,"
confirmed against a real TSC TE244 with its official driver installed.

Rather than fight Windows for that raw access, this app uses the printer's
*own* driver, the way real POS software actually does it: through the
Win32 print spooler's `RAW` datatype (`OpenPrinter` / `StartDocPrinter` /
`WritePrinter`) — the same sequence `python-escpos`'s `Win32Raw` connector
and most C#/.NET POS software's `RawPrinterHelper` use. Bytes go straight
to the device with no GDI re-rendering, no reinterpretation, and no setup
needed on the printer itself — just its name, exactly as Windows shows it.

## One-time setup, before first run

Get the **label printer API key** from the web app's own Settings page
(same key the Android/Mac apps use). That's it — no printer sharing, no
other setup on the printer side.

## First run

Open the app, click **Settings**, and set:

- **Server address** — e.g. `https://skywin.qwicksapp.com`, or
  `http://localhost:3000` for local development.
- **Label printer API key** — from above.
- **Printer language** — TSPL for a TSC TE244 (or similar), ESC/POS for
  the older POSiFLOW P58D. Must match what the printer actually speaks,
  or the label prints as garbage.
- **Printer name** — exactly as it appears in Windows' Settings →
  Bluetooth & devices → Printers & scanners.

Click **Save**, then **Test print** — the diagnostic label should come out
on the printer. If it doesn't, see Troubleshooting below.

## Building it

This machine (the one this app was written on) can't cross-compile a
Windows `.exe` — Rust needs the actual Windows linker/SDK, which only a
real Windows box (or a Windows CI runner) has. Build it there:

```bash
# On a Windows machine, with Rust (rustup) and Node installed:
cd desktop-label-app
npm install
npm run tauri build
```

The installer lands in `src-tauri/target/release/bundle/msi/` (or `nsis/`,
depending on the bundler available). `npm run tauri dev` runs it
unpackaged for quick iteration. This repo's own CI
(`.github/workflows/build-desktop-label-app.yml`) does exactly this on
GitHub's `windows-latest` runner, so a working installer never actually
requires setting any of this up by hand.

## Troubleshooting

**"Windows could not find a printer named ..."** — the name in Settings
doesn't exactly match Windows' own printer list. Copy it character for
character from *Settings → Bluetooth & devices → Printers & scanners*.

**"Windows refused to start the print job"** — the printer is offline,
paused in its queue, or out of paper/ribbon. Check the printer itself and
its queue (right-click it → "See what's printing").

**Label prints as garbage / random characters** — the **Printer
language** setting doesn't match what the printer actually speaks (TSPL
vs ESC/POS). This is the single most common cause of unreadable output —
check that setting before anything else.

**Test print sends nothing / server errors** — check the server address
and API key match exactly what the web app's Settings page shows. A 401
here means the key is wrong; other errors show the server's own message.

## What's verified vs. not

Verified against the real, live production server (no mock): searching
products, the auth-rejection path with a bad key, and fetching real
ESC/POS and TSPL test-print jobs — all pass against
`https://skywin.qwicksapp.com` (`src-tauri/tests/live_api.rs`, run with
`SKYWIN_LABEL_API_KEY=... cargo test --test live_api -- --ignored
--nocapture`). The Win32 printing code compiles cleanly on a real Windows
target via this repo's own CI — not just "should work" from reading the
API docs.

**Not verified — no Windows machine with a printer attached was available
while building this:** whether a real printer actually accepts and prints
the bytes `WritePrinter` sends. If a test print fails, the error message
now comes from the real Win32 API (e.g. "the printer may be offline,
paused, or out of paper") rather than a guess, so start there.
