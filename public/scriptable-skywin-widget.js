// Variables used by Scriptable.
// icon-color: green; icon-glyph: chart-bar;
// Skywin Bill — Large home-screen widget
// Paste into Scriptable → Save → Home Screen → Scriptable → Large

const API_URL = "https://skywin.qwicksapp.com/api/widget";
const API_KEY = "skywin_widget_8f3c2a91e6b04d7a";
const APP_URL = "https://skywin.qwicksapp.com";
const CACHE_FILE = "skywin-widget-cache.json";

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

function formatINR(n) {
  const num = Math.round(Number(n) || 0);
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
    return "Rs " + lakhs.toFixed(lakhs >= 10 ? 1 : 2) + "L";
  }
  if (num >= 1000) {
    return "Rs " + (num / 1000).toFixed(num >= 10000 ? 0 : 1) + "k";
  }
  return formatINR(num);
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
  const h = hex && hex.charAt(0) === "#" ? hex : "#" + hex;
  return new Color(h);
}

function drawTrendChart(trend, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const values = (trend || []).map((d) => Number(d.total) || 0);
  const count = Math.max(values.length, 1);
  const max = Math.max.apply(null, values.concat([1]));
  const labelH = 22;
  const topPad = 4;
  const chartH = Math.max(8, height - labelH - topPad);
  const gap = Math.max(6, width * 0.02);
  const barWidth = (width - gap * (count + 1)) / count;

  ctx.setFillColor(new Color("#e2e8f0", 0.7));
  ctx.fill(new Rect(0, topPad + chartH - 1, width, 1));

  for (let i = 0; i < count; i++) {
    const v = values[i] || 0;
    const h = Math.max(v > 0 ? 6 : 2, (v / max) * chartH);
    const x = gap + i * (barWidth + gap);
    const y = topPad + chartH - h;
    const isToday = i === count - 1;
    ctx.setFillColor(isToday ? tint("#059669") : tint("#6ee7b7"));
    ctx.fill(new Rect(x, y, barWidth, h));

    const label = ((trend[i] && (trend[i].short || trend[i].label)) || "").slice(0, 3);
    ctx.setTextColor(isToday ? tint("#047857") : tint("#64748b"));
    ctx.setFont(Font.mediumSystemFont(9));
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(label, new Rect(x - 4, topPad + chartH + 2, barWidth + 8, labelH));
  }

  return ctx.getImage();
}

function addTrendChart(widget, trend, width, height) {
  try {
    const chart = widget.addImage(drawTrendChart(trend || [], width, height));
    chart.applyFillingContentMode();
  } catch (e) {}
}

function addMetaChip(stack, text, color) {
  const t = stack.addText(text);
  t.font = Font.mediumSystemFont(11);
  t.textColor = tint(color);
  t.lineLimit = 1;
}

function addLowStockRows(widget, items, limit) {
  const rows = (items || []).slice(0, limit);
  if (rows.length === 0) {
    const ok = widget.addText("All products well stocked");
    ok.font = Font.systemFont(12);
    ok.textColor = tint("#64748b");
    return;
  }
  for (const item of rows) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const name = row.addText(item.name || "Item");
    name.font = Font.systemFont(12);
    name.textColor = tint("#334155");
    name.lineLimit = 1;
    name.minimumScaleFactor = 0.8;
    row.addSpacer();
    const qty = row.addText(String(item.qty));
    qty.font = Font.semiboldSystemFont(12);
    qty.textColor = Number(item.qty) <= 0 ? tint("#e11d48") : tint("#d97706");
    widget.addSpacer(3);
  }
}

function applyRefresh(widget) {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 15);
  widget.refreshAfterDate = next;
  widget.url = APP_URL;
}

function createLargeWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = tint("#f8fafc");
  w.setPadding(14, 16, 12, 16);
  applyRefresh(w);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const todayLbl = header.addText("TODAY'S SALES");
  todayLbl.font = Font.semiboldSystemFont(11);
  todayLbl.textColor = tint("#64748b");
  header.addSpacer();
  const dateLbl = header.addText(formatDateLabel(data.updatedAt));
  dateLbl.font = Font.mediumSystemFont(11);
  dateLbl.textColor = tint("#94a3b8");

  w.addSpacer(4);

  const total = w.addText(formatINR(data.today.total));
  total.font = Font.boldSystemFont(30);
  total.textColor = tint("#0f172a");
  total.minimumScaleFactor = 0.55;
  total.lineLimit = 1;

  const meta = w.addStack();
  meta.layoutHorizontally();
  meta.centerAlignContent();
  addMetaChip(meta, (data.today.count || 0) + " bills", "#475569");
  meta.addSpacer(8);
  const pct = Number(data.today.changePct) || 0;
  const up = pct >= 0;
  addMetaChip(
    meta,
    (up ? "+ " : "- ") + Math.abs(pct).toFixed(1) + "% vs yday",
    up ? "#059669" : "#e11d48"
  );
  w.addSpacer(3);
  const pay = w.addStack();
  pay.layoutHorizontally();
  addMetaChip(pay, "Cash " + formatCompact(data.today.cash), "#059669");
  pay.addSpacer(10);
  addMetaChip(pay, "UPI " + formatCompact(data.today.upi), "#0284c8");

  w.addSpacer(8);
  const family = config.widgetFamily;
  const chartW = family === "extraLarge" ? 720 : 620;
  const chartH = family === "extraLarge" ? 160 : 130;
  addTrendChart(w, data.trend, chartW, chartH);

  w.addSpacer(8);
  const ls = w.addText("LOW STOCK");
  ls.font = Font.semiboldSystemFont(10);
  ls.textColor = tint("#94a3b8");
  w.addSpacer(4);
  addLowStockRows(w, data.lowStock, family === "extraLarge" ? 8 : 5);

  w.addSpacer();
  const footer = w.addStack();
  footer.layoutHorizontally();
  const biz = footer.addText(data.business || "SKYWIN BIOTECH");
  biz.font = Font.mediumSystemFont(10);
  biz.textColor = tint("#94a3b8");
  biz.lineLimit = 1;
  footer.addSpacer();
  const upd = footer.addText(formatTimeLabel(data.updatedAt));
  upd.font = Font.systemFont(10);
  upd.textColor = tint("#94a3b8");

  return w;
}

function createMediumWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = tint("#f8fafc");
  w.setPadding(12, 16, 12, 16);
  applyRefresh(w);

  const header = w.addStack();
  header.layoutHorizontally();
  const todayLbl = header.addText("TODAY");
  todayLbl.font = Font.semiboldSystemFont(11);
  todayLbl.textColor = tint("#64748b");
  header.addSpacer();
  const dateLbl = header.addText(formatDateLabel(data.updatedAt));
  dateLbl.font = Font.mediumSystemFont(11);
  dateLbl.textColor = tint("#94a3b8");

  const body = w.addStack();
  body.layoutHorizontally();
  body.centerAlignContent();

  const left = body.addStack();
  left.layoutVertically();
  left.size = new Size(150, 0);
  const total = left.addText(formatINR(data.today.total));
  total.font = Font.boldSystemFont(22);
  total.textColor = tint("#0f172a");
  total.minimumScaleFactor = 0.5;
  total.lineLimit = 1;
  const meta = left.addText((data.today.count || 0) + " bills");
  meta.font = Font.mediumSystemFont(11);
  meta.textColor = tint("#64748b");

  body.addSpacer(8);
  addTrendChart(body, data.trend, 360, 120);

  return w;
}

function createSmallWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = tint("#f8fafc");
  w.setPadding(12, 12, 12, 12);
  applyRefresh(w);

  const todayLbl = w.addText("TODAY");
  todayLbl.font = Font.semiboldSystemFont(11);
  todayLbl.textColor = tint("#64748b");
  w.addSpacer(4);
  const total = w.addText(formatINR(data.today.total));
  total.font = Font.boldSystemFont(22);
  total.textColor = tint("#0f172a");
  total.minimumScaleFactor = 0.45;
  total.lineLimit = 1;
  w.addSpacer(4);
  const bills = w.addText((data.today.count || 0) + " bills");
  bills.font = Font.mediumSystemFont(12);
  bills.textColor = tint("#475569");
  const pct = Number(data.today.changePct) || 0;
  const ch = w.addText((pct >= 0 ? "+ " : "- ") + Math.abs(pct).toFixed(1) + "%");
  ch.font = Font.mediumSystemFont(12);
  ch.textColor = tint(pct >= 0 ? "#059669" : "#e11d48");
  w.addSpacer();
  const biz = w.addText(data.business || "SKYWIN");
  biz.font = Font.systemFont(10);
  biz.textColor = tint("#94a3b8");
  biz.lineLimit = 1;
  return w;
}

function createErrorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = tint("#f8fafc");
  w.setPadding(16, 16, 16, 16);
  applyRefresh(w);
  const t = w.addText("Can't load sales");
  t.font = Font.boldSystemFont(16);
  t.textColor = tint("#0f172a");
  w.addSpacer(6);
  const d = w.addText(message || "Check network.");
  d.font = Font.systemFont(12);
  d.textColor = tint("#64748b");
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
