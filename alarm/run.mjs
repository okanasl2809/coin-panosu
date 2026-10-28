// v7 bulut alarmı. GitHub Actions'ta SÜREKLİ modda ~5,5 saat açık kalır: her saat başı mum kapanışından ~20 sn sonra
// v7 kurallarını hesaplar, arada yüklü alımları ve büyük alış emirlerini izler, Telegram'a yollar.
// Süre dolunca kapanır; sıradaki çalışma hemen devralır. Gizli anahtarlar: TELEGRAM_TOKEN, TELEGRAM_CHAT.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createWhale, fmtUsd } from "./balina.mjs";
const require = createRequire(import.meta.url);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const V7 = require(path.join(DIR, "..", "v7.js"));
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, "config.json"), "utf8"));
const STATE_F = path.join(DIR, "state", "state.json");
const PUB_F = path.join(DIR, "..", "veri", "bulut.json");
const HOSTS = (process.env.BINANCE_HOSTS || "https://data-api.binance.vision,https://api.binance.com,https://api1.binance.com").split(",");
const TF = { "60": { iv: "1h", ms: 36e5, lbl: "1 Saat" }, "240": { iv: "4h", ms: 144e5, lbl: "4 Saat" }, "D": { iv: "1d", ms: 864e5, lbl: "Günlük" } };
const STABLE = /^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|AEUR|EURI|PAX|USTC|USD1|XUSD|BFUSD|RLUSD|USDE)USDT$|(UP|DOWN|BULL|BEAR)USDT$/;
const fetchImpl = globalThis.__fetch || fetch;
const LOOP = process.argv.includes("--surekli") || process.env.SUREKLI === "1";
const DEADLINE = Date.now() + (+process.env.SURE_DK || 330) * 60000;
const PUSH = process.env.GITHUB_ACTIONS === "true";
const tok = process.env.TELEGRAM_TOKEN, chat = process.env.TELEGRAM_CHAT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let now = Date.now();
let state = { seen: {}, last: {}, btcUp: null, brief: "", feed: [], openByTf: {}, whale: [] };
try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_F, "utf8"))); } catch (e) {}
let hostI = 0;
async function api(p) {
  let err;
  for (let k = 0; k < HOSTS.length; k++) {
    const h = HOSTS[(hostI + k) % HOSTS.length];
    try {
      const r = await fetchImpl(h + "/api/v3" + p);
      if (r.status === 429 || r.status === 418) { await sleep(5000); throw new Error("hız sınırı " + r.status); }
      if (!r.ok) throw new Error("http " + r.status);
      hostI = (hostI + k) % HOSTS.length; return await r.json();
    } catch (e) { err = e; }
  }
  throw err;
}
const kl = async (sym, iv, n) => V7.fromBinance(await api(`/klines?symbol=${sym}&interval=${iv}&limit=${n}`), Date.now());
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { console.log("hata", it, e.message); } } })); }
const fmt = p => p >= 1000 ? p.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : p >= 1 ? p.toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : p.toLocaleString("tr-TR", { maximumSignificantDigits: 4 });
const pct = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",") + "%";
const tv = s => `https://www.tradingview.com/chart/?symbol=BINANCE:${s}`;
const ICON = { 1: "🟢", 2: "💚", 3: "💚", 4: "🔁", 5: "🟠", 6: "🔴", 7: "🔵", 8: "🟣", 9: "🧱", 10: "📦", 11: "🔥", 12: "🔥", 13: "👀", 14: "⚠️", 15: "🛑", 19: "🔒", 20: "🔒" };
const timeTR = t => new Date(t + 3 * 36e5).toISOString().slice(11, 16);

/* ---------- Telegram (sıralı, hız sınırına uygun) ---------- */
const q = []; let sending = false;
function tg(text) { q.push(text); pump(); }
async function pump() {
  if (sending) return; sending = true;
  while (q.length) {
    const m = q.shift();
    if (!tok || !chat) { console.log("--- (Telegram anahtarı yok, sadece kayıt)\n" + m); continue; }
    try {
      const r = await fetchImpl(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: m, disable_web_page_preview: true }) });
      if (r.status === 429) { const j = await r.json().catch(() => ({})); q.unshift(m); await sleep(((j.parameters && j.parameters.retry_after) || 5) * 1000); continue; }
      if (!r.ok) console.log("Telegram hatası", r.status, await r.text());
    } catch (e) { console.log("Telegram ulaşılamadı", e.message); }
    await sleep(1100);
  }
  sending = false;
}
const drain = async () => { for (let i = 0; i < 120 && (q.length || sending); i++) await sleep(500); };
function add(key, text, rec) {
  if (state.seen[key]) return; state.seen[key] = now;
  tg(text);
  if (rec) { state.feed.unshift({ k: key, ...rec }); if (state.feed.length > 150) state.feed.length = 150; }
}

/* ---------- izleme listesi ---------- */
let syms = [], vol24 = {}, listT = 0;
async function loadList() {
  if (syms.length && Date.now() - listT < 6 * 36e5) return;
  const t = await api("/ticker/24hr");
  const usdt = t.filter(x => /USDT$/.test(x.symbol) && !STABLE.test(x.symbol) && +x.quoteVolume > 0 && +x.count > 0).sort((a, b) => b.quoteVolume - a.quoteVolume);
  vol24 = Object.fromEntries(usdt.map(x => [x.symbol, +x.quoteVolume]));
  const auto = usdt.slice(0, CFG.otomatik_ilk || 80).map(x => x.symbol);
  const extra = (CFG.ekstra || []).map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, "")).map(s => /USDT$/.test(s) ? s : s + "USDT");
  syms = [...new Set([...auto, ...extra])].filter(s => !(CFG.haric || []).includes(s));
  listT = Date.now();
}

/* ---------- v7 hesabı (bir tur) ---------- */
async function tick() {
  now = Date.now();
  await loadList();
  const btc = { d: await kl("BTCUSDT", "1d", 400), w: await kl("BTCUSDT", "1w", 200) };
  const R = V7.regimeSeries(btc.d, 50), up = V7.regimeAt(R, Infinity);
  if (state.btcUp != null && up != null && up !== state.btcUp) tg(up ? "🟩 BTC REJİMİ YUKARI: BTC günlük kapanışı EMA50'nin üstüne çıktı. Trend AL sinyalleri serbest." : "🟥 BTC REJİMİ AŞAĞI: BTC günlük kapanışı EMA50'nin altına indi. Yeni trend AL sinyali verilmez, açık işlemlerde dikkat.");
  if (up != null) state.btcUp = up;
  const due = [];
  for (const tf of CFG.zaman_dilimleri || []) { const b = Math.floor(now / TF[tf].ms) * TF[tf].ms - 1; if ((state.last[tf] || 0) < b) due.push(tf); }
  const pumpDue = CFG.pump_radari && (state.last.P || 0) < Math.floor(now / 36e5) * 36e5 - 1;
  const briefDue = CFG.sabah_ozeti && (() => { const tr = new Date(now + 3 * 36e5); const day = tr.toISOString().slice(0, 10); return tr.getUTCHours() >= (CFG.sabah_ozeti_saati_tr ?? 9) && state.brief !== day ? day : null; })();
  const needOpen = (CFG.zaman_dilimleri || []).filter(tf => !state.openByTf || !state.openByTf[tf]);
  const trendTfs = briefDue ? [...new Set([...due, ...(CFG.zaman_dilimleri || [])])] : [...new Set([...due, ...needOpen])];
  if (!trendTfs.length && !pumpDue && !briefDue) return false;
  const t0 = Date.now(), open = [], openByTf = {}; for (const tf of trendTfs) openByTf[tf] = [];
  await pool(syms, 6, async sym => {
    for (const tf of trendTfs) {
      const bars = await kl(sym, TF[tf].iv, 499); if (bars.length < 230) continue;
      const r = V7.trend(bars, TF[tf].ms / 1000, btc, {});
      if (r.last && r.last.inT) { const o = { sym, tf, entry: r.last.entry, close: r.last.close, stop: r.last.curStop, stop0: r.last.stop0, lvl: r.last.ladLvl, code: r.last.entryCode, entryT: r.last.entryT, st: r.last.st }; open.push(o); openByTf[tf].push(o); }
      if (!due.includes(tf)) continue;
      const from = state.last[tf] ? Math.max(state.last[tf], bars[bars.length - 1].ct - 3 * TF[tf].ms) : bars[bars.length - 1].ct - 1;
      for (const e of r.events) {
        if (e.t <= from) continue;
        const name = s => `${ICON[s] || ""} ${V7.NAMES[s]} [${TF[tf].lbl}]: ${sym} @ ${fmt(e.px)}`;
        if (e.code >= 1 && e.code <= 4) add(`${sym}|${tf}|${e.code}|${e.t}`, `${name(e.code)} | Pozisyon: %${e.sz.toFixed(1)} | Stop: ${fmt(e.stop0)} | Satış: kapanış SuperTrend altına inerse (şu an ${fmt(e.st)})\n${tv(sym)}`, { t: e.t, sym, tf, code: e.code, px: e.px, stop: e.stop0, pos: +e.sz.toFixed(1) });
        if ((e.code === 5 || e.code === 6 || e.code === 20) && CFG.cikis_ve_kilit_mesajlari) add(`${sym}|${tf}|${e.code}|${e.t}`, `${name(e.code)} | Sonuç: ${pct(e.pnl)}\n${tv(sym)}`, { t: e.t, sym, tf, code: e.code, px: e.px, pnl: +e.pnl.toFixed(2) });
        if ((e.code === 7 || e.code === 8) && CFG.sikisma_sinyalleri) add(`${sym}|${tf}|${e.code}|${e.t}`, `${name(e.code)} | Yön skoru: ${e.dir > 0 ? "+" : ""}${e.dir}\n${tv(sym)}`, { t: e.t, sym, tf, code: e.code, px: e.px });
        if (e.lk && CFG.cikis_ve_kilit_mesajlari) add(`${sym}|${tf}|lk${e.lk}|${e.t}`, `🔒 KÂR KİLİTLENDİ [${TF[tf].lbl}]: ${sym} @ ${fmt(e.px)} | Yeni stop ${fmt(e.stop)} | Borsadaki stop emrini bu seviyeye taşı\n${tv(sym)}`, { t: e.t, sym, tf, code: 19, px: e.px, stop: e.stop, lk: e.lk });
        if (e.info === 9) add(`${sym}|${tf}|9|${e.t}`, `${name(9)} | Stop: ${fmt(e.iStop)}\n${tv(sym)}`, { t: e.t, sym, tf, code: 9, px: e.px, stop: e.iStop });
        if (e.info === 10) add(`${sym}|${tf}|10|${e.t}`, `${name(10)} | Stop: ${fmt(e.iStop)} | Hedef (3R): ${fmt(e.target)}\n${tv(sym)}`, { t: e.t, sym, tf, code: 10, px: e.px, stop: e.iStop, target: e.target });
      }
    }
    if (pumpDue) {
      const h = await kl(sym, "1h", 400), d = await kl(sym, "1d", 260);
      if (h.length < 200 || d.length < 40) return;
      const p = V7.pump(h, d, btc.d, {});
      const fromH = state.last.P ? Math.max(state.last.P, h[h.length - 1].ct - 3 * 36e5) : h[h.length - 1].ct - 1, fromD = state.last.PD ? Math.max(state.last.PD, d[d.length - 1].ct - 864e5) : d[d.length - 1].ct - 1;
      for (const e of p.events) {
        const k = `${sym}|P|${e.code}|${e.t}`;
        if (e.code === 11 && e.t > fromH) add(k, `🔥 4S ATEŞLEME: ${sym} @ ${fmt(e.px)} | 4s: ${pct(e.r4)} hacim ${e.v4x.toFixed(1)}x | 7g: ${pct(e.r7)} | Puan ${e.pts}/4 | Stop: ${fmt(e.stop)} sonra en yüksekten 15 ATR(1s) iz süren\n${tv(sym)}`, { t: e.t, sym, tf: "60", code: 11, px: e.px, stop: e.stop, pts: e.pts });
        if (e.code === 14 && e.t > fromH) add(k, `⚠️ GEÇ / KOVALAMA: ${sym} @ ${fmt(e.px)} | 7g: ${pct(e.r7)} | hacim ${e.v4x.toFixed(1)}x — yeni giriş için riskli`, { t: e.t, sym, tf: "60", code: 14, px: e.px });
        if (e.code === 15 && e.t > fromH && CFG.cikis_ve_kilit_mesajlari) add(k, `🛑 PUMP STOP (4s ateşleme takibi): ${sym} iz süren stop ${fmt(e.px)} vuruldu | Sonuç: ${pct((e.px / e.entry - 1) * 100)}`, { t: e.t, sym, tf: "60", code: 15, px: e.px, pnl: +((e.px / e.entry - 1) * 100).toFixed(2) });
        if (e.code === 12 && e.t > fromD) add(k, `🔥 GÜNLÜK ATEŞLEME: ${sym} @ ${fmt(e.px)} | Puan ${e.pts}/4 | Stop: ${fmt(e.stop)} sonra 3 ATR(1g) iz süren\n${tv(sym)}`, { t: e.t, sym, tf: "D", code: 12, px: e.px, stop: e.stop, pts: e.pts });
        if (e.code === 13 && e.t > fromD) add(k, `👀 HAZIRLIK: ${sym} dar tabanda, 20 gün zirvesine yakın | Puan ${e.pts}/4 — giriş değil, izlemeye al`, { t: e.t, sym, tf: "D", code: 13, px: e.px, pts: e.pts });
      }
    }
  });
  for (const tf of due) state.last[tf] = Math.floor(now / TF[tf].ms) * TF[tf].ms - 1;
  if (pumpDue) { state.last.P = Math.floor(now / 36e5) * 36e5 - 1; state.last.PD = Math.floor(now / 864e5) * 864e5 - 1; }
  for (const tf of Object.keys(openByTf)) state.openByTf[tf] = openByTf[tf];
  for (const tf of Object.keys(state.openByTf)) if (!(CFG.zaman_dilimleri || []).includes(tf)) delete state.openByTf[tf];
  if (briefDue) {
    state.brief = briefDue;
    const lines = [`☀️ SABAH ÖZETİ · ${briefDue.split("-").reverse().join(".")}`, `BTC rejimi: ${up ? "YUKARI (günlük EMA50 üstü)" : "AŞAĞI (yeni long önerilmiyor)"}`, `İzlenen coin: ${syms.length}`];
    const o = open.map(x => ({ ...x, r: (x.close / x.entry - 1) * 100 })).sort((a, b) => b.r - a.r);
    lines.push(`v7'ye göre pozisyonda olan: ${o.length}`);
    for (const x of o.slice(0, 20)) lines.push(`• ${x.sym.replace(/USDT$/, "")} ${TF[x.tf].lbl}: ${pct(x.r)} · stop ${fmt(x.stop)}${x.lvl ? ` · kilit ${x.lvl}` : ""}`);
    if (whale) { const w = whale.summary(864e5).filter(x => x.n > 0).slice(0, 5); if (w.length) lines.push(`Balinaların en çok aldığı (24 sa, net): ${w.map(x => x.s.replace(/USDT$/, "") + " " + fmtUsd(x.n)).join(", ")}`); }
    lines.push(`Son 24 saatte gönderilen alarm: ${Object.values(state.seen).filter(t => now - t < 864e5).length}`);
    tg(lines.join("\n"));
  }
  console.log(`${timeTR(now)} TR · ${syms.length} coin · ${trendTfs.join(",") || "-"}${pumpDue ? " + pump" : ""} · ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
  return true;
}

/* ---------- kayıt ve yayın ---------- */
function weekId(t) { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + "-H" + Math.ceil(((d - y) / 864e5 + 1) / 7); }
function save() {
  for (const k in state.seen) if (Date.now() - state.seen[k] > 10 * 864e5) delete state.seen[k];
  state.whale = (state.whale || []).filter(x => Date.now() - x.t < 3 * 864e5).slice(0, 200);
  fs.mkdirSync(path.dirname(STATE_F), { recursive: true }); fs.writeFileSync(STATE_F, JSON.stringify(state));
}
function publish() {
  const pub = { v: 1, hafta: weekId(Date.now()), surekli: LOOP, btcUp: state.btcUp, tg: !!(tok && chat), coins: syms.length, tfs: CFG.zaman_dilimleri || [], pump: !!CFG.pump_radari,
    canli: whale ? whale.stats().msgs > 0 : null, feed: state.feed.slice(0, 100), open: Object.values(state.openByTf).flat().map(({ close, ...o }) => o), balina: (state.whale || []).slice(0, 60) };
  let old = null; try { old = JSON.parse(fs.readFileSync(PUB_F, "utf8")); delete old.upd; } catch (e) {}
  if (JSON.stringify(old) === JSON.stringify(JSON.parse(JSON.stringify(pub)))) return;
  fs.mkdirSync(path.dirname(PUB_F), { recursive: true }); fs.writeFileSync(PUB_F, JSON.stringify({ upd: Date.now(), ...pub }));
  if (!PUSH) { console.log("bulut verisi yazıldı"); return; }
  try {
    execSync(`git add veri && git -c user.name=v7-bulut -c user.email=41898282+github-actions[bot]@users.noreply.github.com commit -q -m "Bulut verisi güncellendi"`, { cwd: path.join(DIR, ".."), stdio: "pipe" });
    for (let i = 0; i < 3; i++) { try { execSync("git pull -q --rebase origin main && git push -q origin HEAD:main", { cwd: path.join(DIR, ".."), stdio: "pipe" }); break; } catch (e) { execSync("sleep 5"); } }
  } catch (e) { console.log("yayın hatası", String(e.stderr || e.message).slice(0, 200)); }
}

/* ---------- çalıştır ---------- */
function tickDue() {
  const n = Date.now(), b = Math.floor(n / 36e5) * 36e5;
  if (n - b < 20000) return false; // mum kapanışından 20 sn sonra (Binance verisi kesinleşsin)
  if (CFG.pump_radari && (state.last.P || 0) < b - 1) return true;
  for (const tf of CFG.zaman_dilimleri || []) if ((state.last[tf] || 0) < Math.floor(n / TF[tf].ms) * TF[tf].ms - 1) return true;
  if (CFG.sabah_ozeti) { const tr = new Date(n + 3 * 36e5); if (tr.getUTCHours() >= (CFG.sabah_ozeti_saati_tr ?? 9) && state.brief !== tr.toISOString().slice(0, 10)) return true; }
  return false;
}
let whale = null;
async function main() {
  console.log(`Mod: ${LOOP ? "sürekli" : "tek tur"} · Telegram ${tok && chat ? "bağlı" : "anahtar yok"}`);
  await loadList();
  const W = CFG.balina || {};
  if (LOOP && W.acik !== false && globalThis.WebSocket) {
    const wsyms = syms.slice(0, W.coin_sayisi || 40);
    whale = createWhale({ cfg: W, syms: wsyms, vol24, api, fmt, tv, notify: (text, rec) => { tg(text); state.whale = [rec, ...(state.whale || [])].slice(0, 200); } });
    whale.start();
    console.log(`Balina takibi: ${wsyms.length} coin canlı işlemler, ilk ${W.duvar_coin || 15} coinde emir defteri`);
  }
  try { await tick(); } catch (e) { console.log("tur hatası", e.message); }
  save(); publish();
  if (!LOOP) { await drain(); return; }
  let nextWall = Date.now() + 20000, nextPub = Date.now() + 90000, lastTry = 0;
  while (Date.now() < DEADLINE) {
    if (whale && Date.now() >= nextWall) { await whale.wallScan(); nextWall = Date.now() + (W.duvar_sn || 60) * 1000; }
    if (tickDue() && Date.now() - lastTry > 60000) {
      lastTry = Date.now();
      try { await tick(); } catch (e) { console.log("tur hatası", e.message); }
      save(); publish();
    }
    if (Date.now() >= nextPub) { save(); publish(); nextPub = Date.now() + 10 * 60000; if (whale) { const st = whale.stats(); console.log(`${timeTR(Date.now())} TR · balina: ${st.msgs} canlı işlem mesajı, ${st.events} olay`); } }
    await sleep(3000);
  }
  if (whale) whale.stop();
  save(); publish(); await drain();
  console.log("Süre doldu, sıradaki çalışma devralacak.");
}
main().then(() => process.exit(0)).catch(e => { console.error("Çalışma hatası:", e.message); try { save(); } catch (x) {} process.exit(1); });
