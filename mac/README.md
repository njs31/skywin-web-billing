# Skywin Labels (macOS)

A native label printer client for the POSiFLOW P58D. It renders nothing itself:
it asks the Skywin server for finished ESC/POS bytes and writes them to the
printer over USB or Bluetooth. That is the same contract the Android app uses,
so the label design lives in one place — change `lib/label-layout.ts` and every
client follows without a rebuild.

## Why not CUPS

Printing through a macOS print queue means printing through a PPD, and the
PPDs available for this printer do not work: the vendor's POS58 driver emits a
raster dialect at the wrong size, POS80 sends PostScript that the printer types
out as characters, and the Caysn raster opcode completes cleanly while printing
nothing. Worse, a queue claims the USB device exclusively, which is why direct
USB access fails while one exists. This app talks to the hardware directly.

## Build and install

    brew install libusb        # once
    ./build.sh --install       # builds, ad-hoc signs, copies to ~/Applications

`build.sh` needs only the Command Line Tools — there is no Xcode project. It
pins the macOS 26.5 SDK on purpose: in the 27 SDK, SwiftUI's `@State` became a
macro whose plugin ships only with Xcode. The binary still runs on macOS 27.

## First run

Open **Skywin Labels**, click the gear, and set:

- **Server address** — `http://localhost:3000` in development, or the LAN
  address of the machine running the app (e.g. `http://192.168.1.5:3000`).
- **API key** — the label printer API key from the web app's Settings page.
- **Bluetooth port** — leave on Automatic unless you have several printers.

Then click **Test print**. One sticker comes out with a border drawn on the
edge of the printable area: if the border sits inside the die cut, the label is
registered correctly.

## Checking the transports without opening the window

    "$HOME/Applications/Skywin Labels.app/Contents/MacOS/SkywinLabels" --selftest

Reports the configured server, whether a USB printer-class device is on the bus,
and which `cu.` port Bluetooth would use.

## Troubleshooting

**"No USB printer found"** — the printer charges over USB without powering on.
Hold the power button until the LED lights. If it is on and still not found,
check Printers & Scanners: a queue for this printer claims the USB device
exclusively, and removing it frees the port.

**"… did not answer within 8 seconds"** — the printer is off or asleep. macOS
establishes the Bluetooth link inside `open()` and ignores `O_NONBLOCK`, so a
sleeping printer blocks rather than failing. The app gives up waiting so the
window never freezes, but the underlying thread stays stuck until the printer
returns. Never open the `tty.` port: it waits for a carrier signal the printer
never asserts, which is why only `cu.` ports are listed.

**Labels drift down the roll** — the job ends with `GS FF`, which asks the
printer to find the die cut with its gap sensor. If a roll has no gap the
sensor can read, print via the web app with `?gap=` to fall back to a counted
feed.
