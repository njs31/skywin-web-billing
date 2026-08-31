package com.skywin.labelprinter

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private val permissionRequest =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestBluetoothPermission()
        setContent { MaterialTheme { AppScreen(Settings(this), Api(this)) } }
    }

    /** Android 12+ gates classic Bluetooth behind a runtime permission. */
    private fun requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissionRequest.launch(arrayOf(Manifest.permission.BLUETOOTH_CONNECT))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScreen(settings: Settings, api: Api) {
    val scope = rememberCoroutineScope()

    var showSettings by remember { mutableStateOf(!settings.isConfigured) }
    var serverUrl by remember { mutableStateOf(settings.serverUrl) }
    var apiKey by remember { mutableStateOf(settings.apiKey) }

    var query by remember { mutableStateOf("") }
    var products by remember { mutableStateOf<List<Product>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var copies by remember { mutableStateOf("1") }

    var status by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0f) }

    var printers by remember { mutableStateOf<List<BluetoothDevice>>(emptyList()) }
    var printer by remember { mutableStateOf<BluetoothDevice?>(null) }

    fun refreshPrinters() {
        try {
            printers = Printer.pairedPrinters()
            printer = printers.firstOrNull { it.address == settings.printerAddress }
                ?: printers.firstOrNull()
        } catch (e: Exception) {
            status = e.message ?: "Could not list Bluetooth devices."
        }
    }

    LaunchedEffect(Unit) { refreshPrinters() }

    fun search() {
        busy = true
        status = ""
        scope.launch {
            try {
                products = withContext(Dispatchers.IO) { api.searchProducts(query) }
                if (products.isEmpty()) status = "No products matched."
            } catch (e: Exception) {
                status = e.message ?: "Search failed."
            } finally {
                busy = false
            }
        }
    }

    fun print() {
        val device = printer
        if (device == null) {
            status = "Pick a printer first."
            return
        }
        val count = copies.toIntOrNull()?.coerceIn(1, 20) ?: 1
        val ids = products.filter { selected.contains(it.id) }.map { it.id }
        busy = true
        progress = 0f
        status = "Fetching labels…"
        scope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { api.fetchLabelBytes(ids, count) }
                status = "Sending ${bytes.size} bytes…"
                withContext(Dispatchers.IO) {
                    Printer.print(device, bytes) { sent, total ->
                        progress = sent.toFloat() / total
                    }
                }
                settings.printerAddress = device.address
                status = "Printed ${ids.size * count} label(s)."
            } catch (e: Exception) {
                status = e.message ?: "Printing failed."
            } finally {
                busy = false
                progress = 0f
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Skywin Labels") },
                actions = {
                    TextButton(onClick = { showSettings = !showSettings }) {
                        Text(if (showSettings) "Done" else "Settings")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            Modifier.padding(padding).padding(16.dp).fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (showSettings) {
                Text("Server", fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("Address, e.g. 192.168.1.5:3000") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = { Text("API key") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(onClick = {
                    settings.serverUrl = serverUrl
                    settings.apiKey = apiKey
                    serverUrl = settings.serverUrl
                    showSettings = false
                    status = "Saved."
                }) { Text("Save") }

                Spacer(Modifier.height(8.dp))
                Text("Printer", fontWeight = FontWeight.Bold)
                Text(
                    "Pair the printer in Android Bluetooth settings first, then pick it here.",
                    style = MaterialTheme.typography.bodySmall
                )
                printers.forEach { device ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = printer?.address == device.address,
                            onClick = { printer = device; settings.printerAddress = device.address }
                        )
                        Text(Printer.deviceLabel(device))
                    }
                }
                TextButton(onClick = { refreshPrinters() }) { Text("Refresh device list") }
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        label = { Text("Search products") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    Button(onClick = { search() }, enabled = !busy) { Text("Find") }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = copies,
                        onValueChange = { copies = it.filter(Char::isDigit).take(2) },
                        label = { Text("Copies") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.width(110.dp)
                    )
                    Text(
                        printer?.let { "→ ${Printer.deviceLabel(it)}" } ?: "No printer picked",
                        style = MaterialTheme.typography.bodySmall
                    )
                }

                Button(
                    onClick = { print() },
                    enabled = !busy && selected.isNotEmpty() && printer != null,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val count = (copies.toIntOrNull() ?: 1) * selected.size
                    Text(if (busy) "Working…" else "Print $count label(s)")
                }

                if (busy && progress > 0f) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                if (status.isNotEmpty()) {
                    Text(status, style = MaterialTheme.typography.bodySmall)
                }

                HorizontalDivider()

                LazyColumn(Modifier.weight(1f)) {
                    items(products, key = { it.id }) { product ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = selected.contains(product.id),
                                onCheckedChange = { on ->
                                    selected = if (on) selected + product.id
                                    else selected - product.id
                                }
                            )
                            Column(Modifier.weight(1f)) {
                                Text(product.name, fontWeight = FontWeight.Medium)
                                Text(
                                    "${product.code}  ·  MRP ${product.mrp}",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
