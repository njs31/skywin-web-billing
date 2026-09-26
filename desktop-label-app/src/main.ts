import { invoke } from "@tauri-apps/api/core";

type Product = {
  id: number;
  name: string;
  code: string;
  mrp: string;
  stock: string;
  expiry: string;
};

type AppSettings = {
  server_url: string;
  api_key: string;
  printer_share: string;
};

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const settingsToggle = el<HTMLButtonElement>("settings-toggle");
const settingsPanel = el<HTMLElement>("settings-panel");
const serverUrlInput = el<HTMLInputElement>("server-url");
const apiKeyInput = el<HTMLInputElement>("api-key");
const printerShareInput = el<HTMLInputElement>("printer-share");
const saveSettingsBtn = el<HTMLButtonElement>("save-settings");
const testPrintBtn = el<HTMLButtonElement>("test-print");
const settingsStatus = el<HTMLElement>("settings-status");
const searchInput = el<HTMLInputElement>("search");
const productsBody = el<HTMLElement>("products-body");
const emptyState = el<HTMLElement>("empty-state");
const toast = el<HTMLElement>("toast");

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string, kind: "ok" | "error" = "ok") {
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 5000);
}

function setStatus(el: HTMLElement, message: string, kind: "ok" | "error" | "" = "") {
  el.textContent = message;
  el.className = `status ${kind}`;
}

async function loadSettings(): Promise<AppSettings> {
  const settings = await invoke<AppSettings>("get_settings");
  serverUrlInput.value = settings.server_url;
  apiKeyInput.value = settings.api_key;
  printerShareInput.value = settings.printer_share;
  return settings;
}

async function saveSettings() {
  const settings: AppSettings = {
    server_url: serverUrlInput.value.trim(),
    api_key: apiKeyInput.value.trim(),
    printer_share: printerShareInput.value.trim(),
  };
  try {
    await invoke("save_settings", { settings });
    setStatus(settingsStatus, "Saved.", "ok");
  } catch (err) {
    setStatus(settingsStatus, String(err), "error");
  }
}

async function runTestPrint() {
  testPrintBtn.disabled = true;
  setStatus(settingsStatus, "Printing…");
  try {
    await invoke("print_test_label");
    setStatus(settingsStatus, "Sent. Check the printer.", "ok");
  } catch (err) {
    setStatus(settingsStatus, String(err), "error");
  } finally {
    testPrintBtn.disabled = false;
  }
}

let searchSeq = 0;

function renderProducts(products: Product[]) {
  productsBody.innerHTML = "";
  emptyState.classList.toggle("hidden", products.length > 0);

  for (const product of products) {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = product.name;
    row.appendChild(nameCell);

    const codeCell = document.createElement("td");
    codeCell.textContent = product.code;
    row.appendChild(codeCell);

    const mrpCell = document.createElement("td");
    mrpCell.className = "num";
    mrpCell.textContent = product.mrp;
    row.appendChild(mrpCell);

    const stockCell = document.createElement("td");
    stockCell.className = "num";
    stockCell.textContent = product.stock;
    row.appendChild(stockCell);

    const expiryCell = document.createElement("td");
    expiryCell.textContent = product.expiry || "—";
    row.appendChild(expiryCell);

    const qtyCell = document.createElement("td");
    qtyCell.className = "num";
    const qtyInput = document.createElement("input");
    qtyInput.type = "text";
    qtyInput.inputMode = "numeric";
    qtyInput.className = "qty-input";
    qtyInput.value = "1";
    qtyCell.appendChild(qtyInput);
    row.appendChild(qtyCell);

    const actionCell = document.createElement("td");
    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "small";
    printBtn.textContent = "Print";
    printBtn.addEventListener("click", () => printProduct(product, qtyInput, printBtn));
    actionCell.appendChild(printBtn);
    row.appendChild(actionCell);

    productsBody.appendChild(row);
  }
}

async function printProduct(product: Product, qtyInput: HTMLInputElement, button: HTMLButtonElement) {
  const copies = Math.max(1, Math.min(99, Math.round(Number(qtyInput.value)) || 1));
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "…";
  try {
    await invoke("print_labels", { ids: [product.id], copies });
    showToast(`Printed ${copies} × ${product.name}`, "ok");
  } catch (err) {
    showToast(String(err), "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function search(query: string) {
  const seq = ++searchSeq;
  try {
    const products = await invoke<Product[]>("search_products", { query });
    if (seq === searchSeq) renderProducts(products);
  } catch (err) {
    if (seq === searchSeq) {
      showToast(String(err), "error");
      renderProducts([]);
    }
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | undefined;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => search(searchInput.value.trim()), 250);
});

settingsToggle.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));
saveSettingsBtn.addEventListener("click", saveSettings);
testPrintBtn.addEventListener("click", runTestPrint);

async function init() {
  const settings = await loadSettings();
  if (!settings.api_key || !settings.printer_share) {
    settingsPanel.classList.remove("hidden");
  }
  // An empty query lists the first page of active products, so the list
  // isn't blank on first launch — matches the web app's own label search.
  await search("");
}

init();
