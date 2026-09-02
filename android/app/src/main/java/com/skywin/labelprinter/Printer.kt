package com.skywin.labelprinter

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import java.io.IOException
import java.util.UUID

/**
 * Bluetooth Classic (SPP/RFCOMM) link to the POSiFLOW P58D.
 *
 * Classic, not BLE: the printer advertises an RFCOMM serial port, which is why
 * no browser can reach it — Web Bluetooth only speaks BLE — and why this app
 * exists at all.
 */
object Printer {

    /** The well-known Serial Port Profile UUID. */
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /**
     * Flow control. The P58D has roughly an 8 KB input buffer and applies no
     * backpressure: pushed a whole label at once it stops accepting data and
     * silently drops the rest, so the sticker prints about three quarters down
     * and never feeds out. These figures mirror the web app's USB path: the
     * pause must keep the sender under the ~10 KB/s the head consumes, or a
     * run of labels overruns the buffer even though a single label is fine.
     */
    private const val PACE_BYTES = 2048
    private const val PACE_MS = 300L
    private const val CHUNK = 256

    class PrinterError(message: String) : Exception(message)

    @SuppressLint("MissingPermission")
    fun pairedPrinters(): List<BluetoothDevice> {
        val adapter = BluetoothAdapter.getDefaultAdapter()
            ?: throw PrinterError("This phone has no Bluetooth.")
        if (!adapter.isEnabled) throw PrinterError("Turn Bluetooth on first.")
        return try {
            adapter.bondedDevices.orEmpty().toList()
        } catch (e: SecurityException) {
            throw PrinterError("Bluetooth permission was denied. Allow it and try again.")
        }
    }

    @SuppressLint("MissingPermission")
    fun deviceLabel(device: BluetoothDevice): String = try {
        device.name ?: device.address
    } catch (e: SecurityException) {
        device.address
    }

    /**
     * Write a finished job to the printer, pacing it so the buffer never
     * overruns. `onProgress` reports bytes sent so the UI can show a bar.
     */
    @SuppressLint("MissingPermission")
    fun print(device: BluetoothDevice, payload: ByteArray, onProgress: (Int, Int) -> Unit) {
        var socket: BluetoothSocket? = null
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            // Discovery keeps the radio busy and makes connect() flaky.
            try {
                BluetoothAdapter.getDefaultAdapter()?.cancelDiscovery()
            } catch (_: SecurityException) {
            }

            socket.connect()
            val stream = socket.outputStream

            var sent = 0
            var sincePause = 0
            while (sent < payload.size) {
                val end = minOf(sent + CHUNK, payload.size)
                stream.write(payload, sent, end - sent)
                stream.flush()
                sincePause += end - sent
                sent = end
                onProgress(sent, payload.size)
                if (sincePause >= PACE_BYTES) {
                    sincePause = 0
                    Thread.sleep(PACE_MS)
                }
            }

            // Let the last bytes drain before the socket closes, or the tail of
            // the label — including the feed command — is discarded.
            stream.flush()
            Thread.sleep(400)
        } catch (e: SecurityException) {
            throw PrinterError("Bluetooth permission was denied. Allow it and try again.")
        } catch (e: IOException) {
            throw PrinterError(
                "Could not talk to the printer.\n\n" +
                    "Check it is switched on, paired in Android Bluetooth settings, " +
                    "and not connected to another device.\n\n(${e.message})"
            )
        } finally {
            try {
                socket?.close()
            } catch (_: IOException) {
            }
        }
    }
}
