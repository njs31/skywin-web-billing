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
*own* driver, the way any other Windows software prints to it: it copies
the finished job bytes, in binary mode, to the printer's **share** —
`copy /b <job> \\localhost\<ShareName>` — which the Windows print spooler
delivers to the device as a `RAW` datatype job (no GDI re-rendering, no
reinterpretation, bytes straight through). This needs the printer shared
once, in Windows' own UI, not fought over every time the app opens.

## One-time setup, before first run

1. **Share the printer**: right-click it in *Settings → Bluetooth &
   devices → Printers & scanners* → *Printer properties* → *Sharing* →
   check **Share this printer** → give it a short name (e.g. `TSC`).
2. Get the **label printer API key** from the web app's own Settings page
   (same key the Android/Mac apps use).

## First run

Open the app, click **Settings**, and set:

- **Server address** — e.g. `https://skywin.qwicksapp.com`, or
  `http://localhost:3000` for local development.
- **Label printer API key** — from step 2 above.
- **Printer share name** — exactly the name given in step 1 (not the
  printer's display name in the printer list).

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
unpackaged for quick iteration.

## Troubleshooting

**"Windows refused the print job"** — the share name in Settings doesn't
match what the printer was actually shared as, or the printer isn't
shared at all. Re-check *Printer properties → Sharing*.

**Printed once, then stopped working** — the printer's driver was
reinstalled (Windows sometimes does this automatically on replug), which
can rename or drop the share. Re-share it and re-check the name in
Settings.

**Test print sends nothing / server errors** — check the server address
and API key match exactly what the web app's Settings page shows. A 401
here means the key is wrong; other errors show the server's own message.

## What's verified vs. not

Verified against the real, live production server (no mock): searching
products, the auth-rejection path with a bad key, and fetching a real
~7.8 KB ESC/POS test-print job — all pass against
`https://skywin.qwicksapp.com` (`src-tauri/tests/live_api.rs`, run with
`SKYWIN_LABEL_API_KEY=... cargo test --test live_api -- --ignored
--nocapture`). A full release build of the whole app compiled and linked
successfully (on macOS, validating everything cross-platform).

**Not verified — no Windows machine was available while building this:**
the `copy /b` RAW-print mechanism itself. It's a standard, widely-documented
technique, not a guess, but it has not been run against a real printer
share. If it doesn't work as expected, that's the first thing to check —
try the exact command by hand from Command Prompt before assuming the app
is at fault:

```
copy /b somefile.bin \\localhost\YourShareName
```
