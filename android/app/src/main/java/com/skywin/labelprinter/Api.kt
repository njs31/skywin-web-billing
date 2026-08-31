package com.skywin.labelprinter

import android.content.Context
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** One row in the picker. The phone never computes a price or a label itself. */
data class Product(
    val id: Int,
    val name: String,
    val code: String,
    val mrp: String,
    val stock: String,
)

class ApiError(message: String) : Exception(message)

/**
 * Client for the Skywin server.
 *
 * Deliberately thin: the server renders the label and returns finished ESC/POS
 * bytes, so the label design lives in one place and changing it does not need
 * a new APK.
 */
class Api(private val context: Context) {

    private fun settings() = Settings(context)

    private fun open(path: String): HttpURLConnection {
        val base = settings().serverUrl.trimEnd('/')
        if (base.isEmpty()) throw ApiError("Set the server address in Settings first.")
        val connection = URL("$base$path").openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.setRequestProperty("x-api-key", settings().apiKey)
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        return connection
    }

    private fun failure(connection: HttpURLConnection): ApiError {
        val code = connection.responseCode
        val detail = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
        return when (code) {
            401 -> ApiError("Server rejected the API key. Check it in Settings.")
            404 -> ApiError("Nothing found for that request.")
            else -> ApiError("Server error $code. ${detail.take(200)}")
        }
    }

    fun searchProducts(query: String): List<Product> {
        val encoded = URLEncoder.encode(query, "UTF-8")
        val connection = open("/api/labels/products?limit=100&q=$encoded")
        try {
            if (connection.responseCode != 200) throw failure(connection)
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val array = JSONObject(body).getJSONArray("products")
            return (0 until array.length()).map { index ->
                val item = array.getJSONObject(index)
                Product(
                    id = item.getInt("id"),
                    name = item.getString("name"),
                    code = item.optString("code"),
                    mrp = item.optString("mrp"),
                    stock = item.optString("stock"),
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    /** Finished printer bytes for the chosen products. */
    fun fetchLabelBytes(ids: List<Int>, copies: Int): ByteArray {
        if (ids.isEmpty()) throw ApiError("Select at least one product.")
        val connection = open("/api/labels/print?ids=${ids.joinToString(",")}&copies=$copies")
        try {
            if (connection.responseCode != 200) throw failure(connection)
            val buffer = ByteArrayOutputStream()
            connection.inputStream.use { it.copyTo(buffer) }
            val bytes = buffer.toByteArray()
            if (bytes.isEmpty()) throw ApiError("Server returned an empty print job.")
            return bytes
        } finally {
            connection.disconnect()
        }
    }
}
