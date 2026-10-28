// Balina takibi (bulut): yüklü piyasa alımları/satımları ve emir defterindeki büyük alış emirleri (duvarlar).
// Veri: Binance spot, data-stream.binance.vision (canlı işlemler) ve data-api.binance.vision (emir defteri).
const fmtUsd = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(2).replace(".", ",") + " Mn" : "$" + Math.round(v / 1e3) + " B";

export function createWhale({ cfg, syms, vol24, api, notify, fmt, tv, WS = globalThis.WebSocket, log = console.log }) {
  const C = Object.assign({ min_usd: 100000, oran: 0.0004, satislari_da_bildir: false, bekleme_dk: 15,
    duvar: true, duvar_coin: 15, duvar_min_usd: 250000, duvar_oran: 0.001, duvar_uzaklik: 3, duvar_bekleme_dk: 30 }, cfg || {});
  const thr = s => Math.max(C.min_usd, (vol24[s] || 0) * C.oran);
  const wallMin = s => Math.max(C.duvar_min_usd, (vol24[s] || 0) * C.duvar_oran);
  const cl = {}, flow = {}, last = {}, low = {}, cool = {}, walls = {}, events = [];
  let ws = null, alive = true, msgs = 0, lastMsg = Date.now();
  const net = (s, ms) => { const now = Date.now(); let b = 0, a = 0; for (const x of flow[s] || []) if (now - x.t < ms) { if (x.side === "buy") b += x.usd; else a += x.usd; } return { b, a, n: b - a }; };
  function flush(s) {
    const c = cl[s]; if (!c) return; cl[s] = null;
    const T = thr(s); if (c.usd < T) return;
    const px = c.num / c.qty, ev = { t: c.t0, sym: s, side: c.side, usd: c.usd, px, k: c.usd / T };
    (flow[s] = flow[s] || []).push({ t: c.t0, side: c.side, usd: c.usd });
    flow[s] = flow[s].filter(x => Date.now() - x.t < 864e5);
    events.unshift({ type: "trade", ...ev }); if (events.length > 300) events.length = 300;
    if (c.side === "sell" && !C.satislari_da_bildir) return;
    const ck = s + c.side, big = ev.k >= 3;
    if (!big && Date.now() - (cool[ck] || 0) < C.bekleme_dk * 60000) return;
    cool[ck] = Date.now();
    const f = net(s, 15 * 60000);
    notify(`${c.side === "buy" ? "🐋 YÜKLÜ ALIM" : "🔻 YÜKLÜ SATIM"}: ${s} ${fmtUsd(c.usd)} piyasa ${c.side === "buy" ? "alımı" : "satımı"} @ ${fmt(px)} (eşiğin ${ev.k.toFixed(1).replace(".", ",")} katı)\nSon 15 dk büyük işlemler: alım ${fmtUsd(f.b)} · satım ${fmtUsd(f.a)} · net ${f.n >= 0 ? "+" : "−"}${fmtUsd(Math.abs(f.n))}\n${tv(s)}`,
      { t: c.t0, sym: s, kind: c.side === "buy" ? "alim" : "satim", usd: Math.round(c.usd), px });
  }
  function onTrade(d) {
    const s = d.s, p = +d.p, q = +d.q, T = d.T, side = d.m ? "sell" : "buy", usd = p * q;
    last[s] = p; low[s] = low[s] == null ? p : Math.min(low[s], p);
    const c = cl[s];
    if (c && c.side === side && T - c.tl <= 1000 && T - c.t0 <= 5000) { c.usd += usd; c.qty += q; c.num += p * q; c.tl = T; return; }
    if (c) flush(s);
    cl[s] = { side, usd, qty: q, num: p * q, t0: T, tl: T };
  }
  function connect() {
    if (!WS || !alive) return;
    const url = "wss://data-stream.binance.vision/stream?streams=" + syms.map(s => s.toLowerCase() + "@aggTrade").join("/");
    try { ws = new WS(url); } catch (e) { log("balina bağlantı hatası", e.message); setTimeout(connect, 15000); return; }
    ws.onmessage = m => { msgs++; lastMsg = Date.now(); try { const j = JSON.parse(typeof m.data === "string" ? m.data : m.data.toString()); if (j.data && j.data.e === "aggTrade") onTrade(j.data); } catch (e) {} };
    ws.onclose = () => { if (alive) setTimeout(connect, 5000); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  const flushT = setInterval(() => { const now = Date.now(); for (const s in cl) if (cl[s] && now - cl[s].tl > 1500) flush(s); if (now - lastMsg > 120000 && ws) { lastMsg = now; try { ws.close(); } catch (e) {} } }, 1000);
  // emir defteri: alış duvarları
  async function wallScan() {
    if (!C.duvar) return;
    for (const s of syms.slice(0, C.duvar_coin)) {
      try {
        const d = await api(`/depth?symbol=${s}&limit=1000`); if (!d || !d.bids || !d.bids.length) continue;
        const bid = +d.bids[0][0], ask = +d.asks[0][0], mid = (bid + ask) / 2, W = wallMin(s), lim = mid * (1 - C.duvar_uzaklik / 100);
        const groups = []; let g = null;
        for (const [ps, qs] of d.bids) { const p = +ps, q = +qs; if (p < lim) break; if (g && p >= g.top * 0.999) { g.usd += p * q; g.low = p; if (p * q > g.maxUsd) { g.maxUsd = p * q; g.px = p; } } else { g = { top: p, low: p, px: p, usd: p * q, maxUsd: p * q }; groups.push(g); } }
        const now = Date.now(), map = walls[s] = walls[s] || {}, seenNow = new Set();
        for (const w of groups) {
          if (w.usd < W) continue;
          const key = String(Math.round(Math.log(w.px) / Math.log(1.002)));
          seenNow.add(key);
          const o = map[key] || (map[key] = { first: now, n: 0, px: w.px, usd: w.usd, sent: false });
          o.n++; o.usd = w.usd; o.px = w.px; o.seen = now;
          if (o.n >= 2 && !o.sent) {
            o.sent = true;
            const ck = s + "wall", big = w.usd >= 3 * W;
            if (big || now - (cool[ck] || 0) >= C.duvar_bekleme_dk * 60000) {
              cool[ck] = now;
              notify(`🧱 BÜYÜK ALIM EMRİ: ${s} ${fmt(w.px)} seviyesinde ${fmtUsd(w.usd)} alış duvarı (fiyatın %${((1 - w.px / mid) * 100).toFixed(2).replace(".", ",")} altında)\nFiyat buraya inerse güçlü alıcı var demektir. Emir çekilebilir, tek başına AL sinyali değildir.\n${tv(s)}`,
                { t: now, sym: s, kind: "duvar", usd: Math.round(w.usd), px: w.px });
            }
            events.unshift({ type: "wall", t: now, sym: s, px: w.px, usd: w.usd, dist: (1 - w.px / mid) * 100 });
          }
        }
        for (const key of Object.keys(map)) {
          if (seenNow.has(key)) continue;
          const o = map[key]; delete map[key];
          if (!o.sent) continue;
          const filled = low[s] != null && low[s] <= o.px * 1.0008;
          events.unshift({ type: filled ? "filled" : "pulled", t: now, sym: s, px: o.px, usd: o.usd });
          if (filled) notify(`✅ ALIM EMRİ GERÇEKLEŞTİ: ${s} ${fmt(o.px)} seviyesindeki ${fmtUsd(o.usd)} alış duvarına satış geldi ve emir doldu. Fiyat şu an ${fmt(last[s] || o.px)}.\n${tv(s)}`, { t: now, sym: s, kind: "doldu", usd: Math.round(o.usd), px: o.px });
        }
        low[s] = last[s] ?? null;
      } catch (e) { log("duvar hatası", s, e.message); }
    }
  }
  return {
    start() { connect(); },
    wallScan,
    stats() { return { msgs, events: events.length }; },
    summary(ms = 864e5) { return syms.map(s => ({ s, ...net(s, ms) })).filter(x => x.b || x.a).sort((a, b) => b.n - a.n); },
    stop() { alive = false; clearInterval(flushT); try { ws && ws.close(); } catch (e) {} },
    _onTrade: onTrade, _flushAll() { for (const s in cl) flush(s); }
  };
}
export { fmtUsd };
