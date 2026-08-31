package com.skywin.labelprinter

import android.content.Context

/** Server address, API key and the last printer used. */
class Settings(context: Context) {

    private val prefs = context.getSharedPreferences("skywin-labels", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString(KEY_URL, "").orEmpty()
        set(value) = prefs.edit().putString(KEY_URL, normaliseUrl(value)).apply()

    var apiKey: String
        get() = prefs.getString(KEY_API, "").orEmpty()
        set(value) = prefs.edit().putString(KEY_API, value.trim()).apply()

    /** MAC address of the printer, so it is not re-picked every print. */
    var printerAddress: String
        get() = prefs.getString(KEY_PRINTER, "").orEmpty()
        set(value) = prefs.edit().putString(KEY_PRINTER, value).apply()

    val isConfigured: Boolean
        get() = serverUrl.isNotEmpty() && apiKey.isNotEmpty()

    private companion object {
        const val KEY_URL = "server_url"
        const val KEY_API = "api_key"
        const val KEY_PRINTER = "printer_address"

        /** Accept "192.168.1.5:3000" as well as a full URL. */
        fun normaliseUrl(raw: String): String {
            val trimmed = raw.trim().trimEnd('/')
            if (trimmed.isEmpty()) return ""
            return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                trimmed
            } else {
                "http://$trimmed"
            }
        }
    }
}
