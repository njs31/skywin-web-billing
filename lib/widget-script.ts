export const DEFAULT_WIDGET_APP_URL = "https://skywin.qwicksapp.com";
export const DEFAULT_WIDGET_API_URL = `${DEFAULT_WIDGET_APP_URL}/api/widget`;
export const DEFAULT_WIDGET_API_KEY = "skywin_widget_8f3c2a91e6b04d7a";

/** Always emits the production API URL + key. Opts are ignored so the phone never gets a placeholder. */
export function buildScriptableWidgetScript(_opts?: {
  apiUrl?: string;
  apiKey?: string;
  appUrl?: string;
}) {
  const apiUrl = JSON.stringify(DEFAULT_WIDGET_API_URL);
  const apiKey = JSON.stringify(DEFAULT_WIDGET_API_KEY);
  const appUrl = JSON.stringify(DEFAULT_WIDGET_APP_URL);

  return `// Variables used by Scriptable.
// icon-color: green; icon-glyph: chart-bar;
// Skywin Bill — Large home-screen widget
// Paste into Scriptable → Save → Home Screen → Scriptable → Large

const API_URL = ${apiUrl};
const API_KEY = ${apiKey};
const APP_URL = ${appUrl};
const CACHE_FILE = "skywin-widget-cache.json";

// Light-on-emerald palette
const C = {
  gradTop: "#059669",
  gradBottom: "#064e3b",
  text: "#ffffff",
  faint: new Color("#ffffff", 0.55),
  soft: new Color("#ffffff", 0.75),
  mint: "#a7f3d0",
  sky: "#bae6fd",
  lime: "#bbf7d0",
  rose: "#fecaca",
  amber: "#fde68a",
};

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
}

function readCache() {
  try {
    const fm = FileManager.local();
    const path = cachePath();
    if (fm.fileExists(path)) {
      return JSON.parse(fm.readString(path));
    }
  } catch (e) {}
  return null;
}

function writeCache(data) {
  try {
    FileManager.local().writeString(cachePath(), JSON.stringify(data));
  } catch (e) {}
}

async function loadData() {
  const req = new Request(API_URL);
  req.method = "GET";
  req.headers = {
    "x-api-key": API_KEY,
    Accept: "application/json",
  };
  req.timeoutInterval = 20;
  const raw = await req.loadString();
  const status = req.response && req.response.statusCode;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error("API did not return JSON (HTTP " + (status || "?") + ")");
  }
  if (status && status >= 400) {
    throw new Error((data && data.error) || ("HTTP " + status));
  }
  if (!data || !data.today) {
    throw new Error((data && data.error) || "Invalid widget response");
  }
  writeCache(data);
  return data;
}

function trunc(s, n) {
  s = String(s || "");
  if (s.length <= n) return s;
  return s.slice(0, Math.max(1, n - 1)) + "…";
}

function formatINR(n) {
  const num = Math.round(Number(n) || 0);
  if (num >= 10000000) {
    return "Rs " + (num / 10000000).toFixed(2) + "Cr";
  }
  if (num >= 100000) {
    const lakhs = num / 100000;
    return "Rs " + lakhs.toFixed(lakhs >= 10 ? 1 : 2) + "L";
  }
  try {
    return "Rs " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(num);
  } catch (e) {
    return "Rs " + String(num);
  }
}

function formatCompact(n) {
  const num = Number(n) || 0;
  if (num >= 100000) {
    const lakhs = num / 100000;
    return lakhs.toFixed(lakhs >= 10 ? 1 : 2) + "L";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(num >= 10000 ? 0 : 1) + "k";
  }
  return String(Math.round(num));
}

function formatDateLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  try {
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    });
  } catch (e) {
    return d.toDateString();
  }
}

function formatTimeLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  try {
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch (e) {
    return "";
  }
}

function tint(hex) {
  if (hex instanceof Color) return hex;
  const h = hex && hex.charAt(0) === "#" ? hex : "#" + hex;
  return new Color(h);
}

function applyBackground(w) {
  const g = new LinearGradient();
  g.colors = [tint(C.gradTop), tint(C.gradBottom)];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(0.6, 1);
  w.backgroundGradient = g;
}

function drawTrendChart(trend, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const values = (trend || []).map((d) => Number(d.total) || 0);
  const count = Math.max(values.length, 1);
  const max = Math.max.apply(null, values.concat([1]));
  const labelH = 15;
  const topPad = 2;
  const chartH = Math.max(8, height - labelH - topPad);
  const gap = 6;
  const barWidth = (width - gap * (count + 1)) / count;

  ctx.setFillColor(new Color("#ffffff", 0.25));
  ctx.fill(new Rect(0, topPad + chartH - 1, width, 1));

  for (let i = 0; i < count; i++) {
    const v = values[i] || 0;
    const h = Math.max(v > 0 ? 5 : 2, (v / max) * chartH);
    const x = gap + i * (barWidth + gap);
    const y = topPad + chartH - h;
    const isToday = i === count - 1;
    ctx.setFillColor(isToday ? tint(C.mint) : new Color("#ffffff", 0.4));
    const path = new Path();
    path.addRoundedRect(new Rect(x, y, barWidth, h), 3, 3);
    ctx.addPath(path);
    ctx.fillPath();

    const label = ((trend[i] && (trend[i].short || trend[i].label)) || "").slice(0, 2);
    ctx.setTextColor(isToday ? tint(C.mint) : new Color("#ffffff", 0.55));
    ctx.setFont(Font.mediumSystemFont(9));
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(label, new Rect(x - 3, topPad + chartH + 2, barWidth + 6, labelH));
  }

  return ctx.getImage();
}

function addTrendChart(widget, trend, width, height) {
  try {
    const chart = widget.addImage(drawTrendChart(trend || [], width, height));
    chart.imageSize = new Size(width, height);
    chart.resizable = false;
    chart.centerAlignImage();
  } catch (e) {}
}

function addMetaChip(stack, text, color) {
  const t = stack.addText(text);
  t.font = Font.mediumSystemFont(11);
  t.textColor = tint(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
}

function addLowStockRows(widget, items, limit) {
  const rows = (items || []).slice(0, limit);
  if (rows.length === 0) {
    const ok = widget.addText("All products well stocked");
    ok.font = Font.systemFont(12);
    ok.textColor = C.soft;
    ok.lineLimit = 1;
    return;
  }
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) widget.addSpacer(4);
    const item = rows[i];
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const name = row.addText(trunc(item.name || "Item", 26));
    name.font = Font.systemFont(12);
    name.textColor = C.soft;
    name.lineLimit = 1;
    name.minimumScaleFactor = 0.75;
    row.addSpacer();
    const qty = row.addText(String(item.qty));
    qty.font = Font.semiboldSystemFont(12);
    qty.textColor = Number(item.qty) <= 0 ? tint(C.rose) : tint(C.amber);
    qty.lineLimit = 1;
  }
}

function applyRefresh(widget) {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 5);
  widget.refreshAfterDate = next;
  widget.url = APP_URL;
}

function createLargeWidget(data) {
  const w = new ListWidget();
  applyBackground(w);
  w.setPadding(14, 16, 12, 16);
  applyRefresh(w);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const todayLbl = header.addText("TODAY'S SALES");
  todayLbl.font = Font.semiboldSystemFont(11);
  todayLbl.textColor = C.faint;
  todayLbl.lineLimit = 1;
  header.addSpacer();
  const dateLbl = header.addText(formatDateLabel(data.updatedAt));
  dateLbl.font = Font.mediumSystemFont(11);
  dateLbl.textColor = C.faint;
  dateLbl.lineLimit = 1;
  dateLbl.minimumScaleFactor = 0.7;

  w.addSpacer(4);

  const total = w.addText(formatINR(data.today.total));
  total.font = Font.boldSystemFont(34);
  total.textColor = tint(C.text);
  total.minimumScaleFactor = 0.5;
  total.lineLimit = 1;

  w.addSpacer(3);

  const pct = Number(data.today.changePct) || 0;
  const up = pct >= 0;
  const meta = w.addStack();
  meta.layoutHorizontally();
  meta.centerAlignContent();
  addMetaChip(meta, (data.today.count || 0) + " bills", C.soft);
  meta.addSpacer(8);
  addMetaChip(meta, (up ? "▲ " : "▼ ") + Math.abs(pct).toFixed(0) + "%", up ? C.lime : C.rose);
  meta.addSpacer(8);
  addMetaChip(meta, "Cash " + formatCompact(data.today.cash), C.mint);
  meta.addSpacer(8);
  addMetaChip(meta, "UPI " + formatCompact(data.today.upi), C.sky);

  w.addSpacer();

  addTrendChart(w, data.trend, 300, 68);

  w.addSpacer();

  const ls = w.addText("LOW STOCK");
  ls.font = Font.semiboldSystemFont(10);
  ls.textColor = C.faint;
  ls.lineLimit = 1;
  w.addSpacer(5);
  addLowStockRows(w, data.lowStock, 4);

  w.addSpacer();

  const footer = w.addStack();
  footer.layoutHorizontally();
  footer.centerAlignContent();
  const biz = footer.addText(trunc(data.business || "SKYWIN BIOTECH", 20));
  biz.font = Font.mediumSystemFont(10);
  biz.textColor = C.faint;
  biz.lineLimit = 1;
  footer.addSpacer();
  const upd = footer.addText("Updated " + formatTimeLabel(data.updatedAt));
  upd.font = Font.systemFont(10);
  upd.textColor = C.faint;
  upd.lineLimit = 1;

  return w;
}

function createMediumWidget(data) {
  const w = new ListWidget();
  applyBackground(w);
  w.setPadding(12, 14, 12, 14);
  applyRefresh(w);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const todayLbl = header.addText("TODAY'S SALES");
  todayLbl.font = Font.semiboldSystemFont(10);
  todayLbl.textColor = C.faint;
  todayLbl.lineLimit = 1;
  header.addSpacer();
  const dateLbl = header.addText(formatDateLabel(data.updatedAt));
  dateLbl.font = Font.mediumSystemFont(10);
  dateLbl.textColor = C.faint;
  dateLbl.lineLimit = 1;
  dateLbl.minimumScaleFactor = 0.7;

  w.addSpacer();

  const body = w.addStack();
  body.layoutHorizontally();
  body.centerAlignContent();

  const left = body.addStack();
  left.layoutVertically();
  left.size = new Size(125, 0);
  const total = left.addText(formatINR(data.today.total));
  total.font = Font.boldSystemFont(22);
  total.textColor = tint(C.text);
  total.minimumScaleFactor = 0.5;
  total.lineLimit = 1;
  left.addSpacer(3);
  const meta = left.addText((data.today.count || 0) + " bills");
  meta.font = Font.mediumSystemFont(11);
  meta.textColor = C.soft;
  meta.lineLimit = 1;

  body.addSpacer(10);
  addTrendChart(body, data.trend, 175, 66);

  w.addSpacer();

  return w;
}

function createSmallWidget(data) {
  const w = new ListWidget();
  applyBackground(w);
  w.setPadding(12, 12, 12, 12);
  applyRefresh(w);

  const todayLbl = w.addText("TODAY");
  todayLbl.font = Font.semiboldSystemFont(10);
  todayLbl.textColor = C.faint;
  todayLbl.lineLimit = 1;
  w.addSpacer(4);
  const total = w.addText(formatINR(data.today.total));
  total.font = Font.boldSystemFont(22);
  total.textColor = tint(C.text);
  total.minimumScaleFactor = 0.45;
  total.lineLimit = 1;
  w.addSpacer(4);
  const bills = w.addText((data.today.count || 0) + " bills");
  bills.font = Font.mediumSystemFont(12);
  bills.textColor = C.soft;
  const pct = Number(data.today.changePct) || 0;
  const ch = w.addText((pct >= 0 ? "▲ " : "▼ ") + Math.abs(pct).toFixed(0) + "%");
  ch.font = Font.mediumSystemFont(12);
  ch.textColor = tint(pct >= 0 ? C.lime : C.rose);
  w.addSpacer();
  const biz = w.addText(data.business || "SKYWIN");
  biz.font = Font.systemFont(10);
  biz.textColor = C.faint;
  biz.lineLimit = 1;
  return w;
}

function createErrorWidget(message) {
  const w = new ListWidget();
  applyBackground(w);
  w.setPadding(16, 16, 16, 16);
  applyRefresh(w);
  const t = w.addText("Can't load sales");
  t.font = Font.boldSystemFont(16);
  t.textColor = tint(C.text);
  w.addSpacer(6);
  const d = w.addText(message || "Check network.");
  d.font = Font.systemFont(12);
  d.textColor = C.soft;
  d.lineLimit = 4;
  return w;
}

function widgetForFamily(data) {
  const family = config.widgetFamily;
  if (family === "small") return createSmallWidget(data);
  if (family === "medium") return createMediumWidget(data);
  return createLargeWidget(data);
}

let widget;
try {
  const data = await loadData();
  widget = widgetForFamily(data);
} catch (err) {
  const cached = readCache();
  if (cached && cached.today) {
    widget = widgetForFamily(cached);
  } else {
    widget = createErrorWidget(err && err.message);
  }
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
`;
}
