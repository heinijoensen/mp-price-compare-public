/* MP Price Comparison – matching engine (runs in the browser, no AI, no server).
   Ladder: confirmed > EAN > VVS > vendor/manufacturer no > name suggestion (fuzzy). */
(function (root) {
  "use strict";
  const LEVELS = ["confirmed", "ean", "vvs", "mfr", "suggestion", "none"];
  const LEVEL_LABEL = { confirmed: "Confirmed", ean: "EAN exact", vvs: "VVS exact", mfr: "Item no. exact", suggestion: "Suggestion", none: "No match" };
  const EXACT = new Set(["confirmed", "ean", "vvs", "mfr"]);

  function num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[^\d,.\-]/g, "");
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else s = s.replace(",", ".");
    const n = parseFloat(s); return isNaN(n) ? null : n;
  }
  function eanCheck(s) {
    const d = s.split("").map(Number), chk = d.pop(); d.reverse();
    return (10 - d.reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0) % 10) % 10 === chk;
  }
  function cleanEAN(v) {
    if (v == null) return null;
    let s = String(v).replace(/\.0+$/, "").replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(s.length)) return null;
    if (s.length === 12) s = "0" + s;
    if (s.length === 14 && s[0] === "0") s = s.slice(1);
    return eanCheck(s) ? s : null;
  }
  function cleanVVS(v) {
    if (v == null) return null;
    const s = String(v).replace(/\.0+$/, "").replace(/[\s.\-]/g, "");
    return /^\d{6,10}$/.test(s) ? s.padStart(9, "0").slice(-9) : null;
  }
  function cleanMfr(v) {
    if (v == null) return null;
    let s = String(v).toUpperCase().replace(/\.0+$/, "").replace(/[^0-9A-ZÆØÅ]/g, "");
    if (/^\d+$/.test(s)) s = s.replace(/^0+/, "");
    return s.length >= 4 ? s : null;
  }
  function splitMulti(v) { return v == null ? [] : String(v).split(/[|;]/).map(x => x.trim()).filter(Boolean); }
  function pick(r, names) {
    for (const n of names) { if (r[n] != null && r[n] !== "") return r[n]; }
    const keys = Object.keys(r);
    for (const n of names) { const k = keys.find(k => k.toLowerCase() === n.toLowerCase()); if (k && r[k] != null && r[k] !== "") return r[k]; }
    return null;
  }

  /* ---------- name normalisation (Faroese/Danish trade abbreviations) ---------- */
  const MAP = [
    [/\bkop\.? ?pr\b/g, "kobber press"], [/\bkop\b/g, "kobber"], [/\bsp\b/g, "stål press"], [/\balu ?pr\b/g, "alupex press"],
    [/\brf ?pr\b/g, "rustfri press"], [/\brf\b/g, "rustfri"], [/\bmess\b/g, "messing"], [/\bfork\b/g, "forkromet"],
    [/vinkulventil\w*|vinkelventil\w*/g, "vinkelventil"], [/(stål|kobber|rustfri|alupex)press/g, "$1 press"],
    [/vinkul\w*|vinklar|vinkil/g, "vinkel"], [/\bt-rør\b/g, "tstykke"], [/t-stykke/g, "tstykke"], [/muffur|muffa\b|muffe\b/g, "muffe"],
    [/reduktión\w*|\bredukt\b|reduktion\w*/g, "reduktion"], [/bróstnipp\w*|nippil|nipplar|nipler|nippel/g, "nippel"],
    [/kúluvent\w*|kugleventil\w*/g, "kugleventil"], [/\binnv?\b|indv\.?\b|\bind\b/g, "indv"], [/yvirg\.?|útv\b|udv\.?\b/g, "udv"],
    [/stoypij\.?/g, "støbejern"], [/\bbend\b|bøjning|bøjn\.?\b/g, "bøjning"], [/vatnlás/g, "vandlås"], [/svart/g, "sort"],
    [/ramma/g, "ramme"], [/útluftar\w*/g, "udlufter"], [/handklæðsstong/g, "håndklædestang"], [/brúsusett/g, "brusesæt"],
    [/slangu/g, "slange"], [/koparrør/g, "kobberrør"], [/\bglv\b|galv\w*|galvaniser\w*/g, "galv"], [/pumpa\b/g, "pumpe"],
    [/termostatur/g, "termostat"], [/\bdeksil\b/g, "dæksel"], [/kloakkrør/g, "kloakrør"], [/vatntrýstminkari/g, "reduktionsventil"],
    [/renna\b/g, "rende"], [/tangi\b/g, "tank"], [/lúkur|setur\b/g, "sæde"], [/rør\b/g, "rør"], [/endamuffa/g, "endemuffe"], [/\bt\b(?=\s+\d)/g, "tstykke"]
  ];
  const STOP = new Set(["og", "med", "til", "for", "af", "i", "á", "við", "v", "t", "mm", "stk", "pr", "the", "and", "x", "til", "fra", "uden", "u", "m", "inkl", "excl"]);
  const UNIT_RE = /^(\d+(?:\.\d+)?)(mm|cm|m|l|kw|w|bar|in|°|m2|m3|kg|dn|ltr)$/;

  function normName(name) {
    let s = " " + String(name || "").toLowerCase() + " ";
    s = s.replace(/\*útgingið -/g, " ").replace(/[’´`]/g, "'").replace(/''|"|”|“|″|tommer|tomme|\btm\b/g, " in ");
    s = s.replace(/(\d),(\d)/g, "$1.$2").replace(/([a-zæøåð])\/([a-zæøåð])/g, "$1 $2");
    s = s.replace(/(\d|in|mm|")\s*x\s*(?=\d)/g, "$1 x ");
    MAP.forEach(([a, b]) => { s = s.replace(a, b); });
    s = s.replace(/\bø\s*(\d)/g, "$1").replace(/\bdn\s*(\d+)/g, " dn$1 ");
    s = s.replace(/(\d)\s*-\s*(\d\/\d)/g, "$1 $2");               // 1-1/4 -> 1 1/4
    s = s.replace(/\b(\d) 1\/(2|4)\b/g, "$1_1/$2");               // 1 1/4 -> 1_1/4 (single token)
    s = s.replace(/\b11\/(2|4)\b/g, "1_1/$1");                    // Faroese "11/4" == 1 1/4
    s = s.replace(/(\d)\s*(mm|cm|kw|bar|ltr|l|m2|m3|m|kg|w)\b/g, "$1$2").replace(/(\d)\s*°/g, "$1°");
    s = s.replace(/(\d(?:_1\/\d|\/\d)?)\s*in\b/g, "$1in");
    for (let k = 0; k < 2; k++) s = s.replace(/\b(\d+(?:\.\d+)?) x (\d+(?:\.\d+)?)(mm|cm)\b/g, "$1$3 x $2$3");
    return s.replace(/[(),;:+*!?]/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(name) {
    const s = normName(name);
    const words = [], dims = [];
    s.split(" ").forEach(t => {
      t = t.replace(/^[.\-\/]+|[.\-\/]+$/g, "");
      if (!t) return;
      if (/^\d/.test(t)) {
        let m = t.match(UNIT_RE);
        if (m) { dims.push(String(parseFloat(m[1])) + (m[2] === "ltr" ? "l" : m[2])); return; }
        if (/^\d+(_1\/\d)?(\/\d+)?$/.test(t)) { dims.push(t.replace(/^0+(?=\d)/, "")); return; }
        dims.push(t); return;
      }
      if (t.length < 2 || STOP.has(t)) return;
      words.push(t);
    });
    return { words: [...new Set(words)], dims: [...new Set(dims)] };
  }
  function unitOf(d) { const m = d.match(UNIT_RE); return m ? m[2] : (/\//.test(d) || /_/.test(d) ? "frac" : "n"); }
  function bare(d) { return d.replace(/(mm|cm|m|l|kw|w|bar|in|°|m2|m3|kg)$/, ""); }
  /* Size rule: if both have sizes, MP sizes must all be found in the candidate (unit-less numbers may match a unit form),
     and same-unit sizes on the candidate that we don't have mean a different size (15mm vs 22mm, 1/2in vs 3/4in). */
  function dimsCompatible(a, b) {
    if (!a.length || !b.length) return true;
    const bset = new Set(b), bBare = new Set(b.map(bare)), aset = new Set(a), aBare = new Set(a.map(bare));
    for (const d of a) { if (!bset.has(d) && !bBare.has(bare(d))) return false; }
    for (const d of b) {
      const u = unitOf(d);
      if (u === "n") continue;
      if (a.some(x => unitOf(x) === u) && !aset.has(d) && !aBare.has(bare(d))) return false;
    }
    return true;
  }

  /* ---------- unit / pack / VAT hints ---------- */
  function unitHint(text, unit) {
    const s = (String(text || "") + " " + String(unit || "")).toLowerCase();
    if (/\b(pr\.?\s*m(eter)?|\/m\b|meter|metervare|lbm|\bm\b(?!m))/.test(s) && !/\bstk\b/.test(s)) return "m";
    if (/\b(pakke|pk|pak|pakn|sæt|sett|kasse|ks|rulle|rl|ps|pose|\d+\s*stk\b|\d+\s*pcs)\b/.test(s)) return "pack";
    return "stk";
  }

  /* ---------- competitor index ---------- */
  function normCompRow(r, store) {
    let price = num(pick(r, ["price", "pris", "salgspris", "price_with_vat", "Price"]));
    const raw = price;
    if (price && store.freight) price = price * (1 + store.freight / 100);
    const sku = pick(r, ["sku", "SKU", "varenr", "item_no"]);
    const vvsRaw = pick(r, ["vvs_nr", "vvs", "vvsnr", "VVS"]);
    const mfrRaw = pick(r, ["productnumber", "manufacturer_number", "manufacturer_item_no", "mpn", "varenummer", "model", "productid"]);
    const img = pick(r, ["image", "image_url", "img", "imageUrl", "images", "picture"]);
    return {
      id: String(sku || pick(r, ["id", "productid", "url"]) || vvsRaw || pick(r, ["ean"]) || "").trim(),
      name: String(pick(r, ["name", "title", "navn", "product_name"]) || ""),
      price, raw_price: raw,
      ean: cleanEAN(pick(r, ["ean", "gtin", "barcode", "EAN"])),
      vvs: cleanVVS(vvsRaw) || (sku && /^\d{9}$/.test(String(sku).trim()) ? String(sku).trim() : null),
      mfr: [cleanMfr(mfrRaw), cleanMfr(sku)].filter(Boolean),
      unit: String(pick(r, ["unit", "enhed", "eining"]) || ""),
      url: String(pick(r, ["url", "link"]) || ""),
      image: img ? String(img).split(/[|, ]/)[0] : "",
      brand: String(pick(r, ["manufacturer.name", "brand", "manufacturer", "maerke"]) || "")
    };
  }
  function buildIndex(rows, store) {
    const idx = { store, rows: [], byEAN: new Map(), byVVS: new Map(), byMfr: new Map(), byId: new Map(), tok: new Map(), df: new Map(), N: 0 };
    rows.forEach(r => {
      const c = normCompRow(r, store);
      if (!c.price || !c.name) return;
      const i = idx.rows.length; idx.rows.push(c);
      c.t = tokens(c.name + " " + (c.brand || ""));
      if (c.ean && !idx.byEAN.has(c.ean)) idx.byEAN.set(c.ean, i);
      if (c.vvs && !idx.byVVS.has(c.vvs)) idx.byVVS.set(c.vvs, i);
      c.mfr.forEach(m => { if (!idx.byMfr.has(m)) idx.byMfr.set(m, i); });
      if (c.id && !idx.byId.has(c.id.toUpperCase())) idx.byId.set(c.id.toUpperCase(), i);
      c.t.words.forEach(w => { if (!idx.tok.has(w)) idx.tok.set(w, []); idx.tok.get(w).push(i); idx.df.set(w, (idx.df.get(w) || 0) + 1); });
    });
    idx.N = idx.rows.length;
    return idx;
  }
  function idf(idx, w) { return Math.log(1 + idx.N / (1 + (idx.df.get(w) || 0))); }

  function suggest(idx, mpName, opts) {
    const mt = tokens(mpName); if (!mt.words.length) return [];
    const maxDf = Math.max(50, idx.N * 0.08), hits = new Map();
    mt.words.forEach(w => {
      const list = idx.tok.get(w); if (!list || list.length > maxDf * 4) return;
      const wi = idf(idx, w);
      list.forEach(i => hits.set(i, (hits.get(i) || 0) + wi));
    });
    const mpW = Math.sqrt(mt.words.reduce((a, w) => a + idf(idx, w) ** 2, 0)) || 1;
    const out = [];
    [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80).forEach(([i]) => {
      const c = idx.rows[i];
      if (opts.rejected && opts.rejected.has(c.id)) return;
      if (!dimsCompatible(mt.dims, c.t.dims)) return;
      let dot = 0; mt.words.forEach(w => { if (c.t.words.includes(w)) dot += idf(idx, w) ** 2; });
      const cW = Math.sqrt(c.t.words.reduce((a, w) => a + idf(idx, w) ** 2, 0)) || 1;
      let score = dot / (mpW * cW);
      if (mt.dims.length && c.t.dims.length) score += 0.1 * mt.dims.filter(d => c.t.dims.includes(d) || c.t.dims.map(bare).includes(bare(d))).length / mt.dims.length;
      else if (mt.dims.length && !c.t.dims.length) score -= 0.1;
      if (score >= opts.minScore) out.push({ i, score: Math.min(1, score) });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, opts.top || 3);
  }

  /* ---------- sanity checks ---------- */
  function sanity(mp, c, cfg) {
    const flags = [];
    if (!mp.price || !c.price) return flags;
    const r = mp.price / c.price;
    if (r > cfg.ratioHigh || r < cfg.ratioLow) flags.push(`Price ratio ${r.toFixed(2)}×`);
    else if ((r > 1.235 && r < 1.265) || (r > 0.79 && r < 0.81)) flags.push("Possible VAT mismatch (~25%)");
    const a = unitHint(mp.name, mp.unit), b = unitHint(c.name, c.unit);
    if (a !== b) flags.push(`Unit/pack differs (${a} vs ${b})`);
    if (mp.cost && c.price < mp.cost * cfg.vatFactor) flags.push("Competitor below our cost");
    return flags;
  }

  /* ---------- main ---------- */
  function matchItem(mp, indexes, ctx) {
    const res = [];
    indexes.forEach(idx => {
      const sid = idx.store.id, conf = (ctx.confirmed[mp.nr] || {})[sid];
      let hit = null, level = "none", cands = [];
      if (conf && conf.status === "confirmed") {
        let i;
        if (conf.comp_id) i = idx.byId.get(String(conf.comp_id).toUpperCase());
        if (i == null && conf.comp_ean) i = idx.byEAN.get(conf.comp_ean);
        if (i == null && conf.comp_vvs) i = idx.byVVS.get(conf.comp_vvs);
        if (i != null) { hit = i; level = "confirmed"; }
      }
      if (hit == null && !(conf && conf.status === "none_final")) {
        for (const e of mp.eans) { if (idx.byEAN.has(e)) { hit = idx.byEAN.get(e); level = "ean"; break; } }
        if (hit == null) for (const v of mp.vvs) { if (idx.byVVS.has(v)) { hit = idx.byVVS.get(v); level = "vvs"; break; } }
        if (hit == null) for (const m of mp.mfr) { if (idx.byMfr.has(m)) { hit = idx.byMfr.get(m); level = "mfr"; break; } }
      }
      if (hit == null && ctx.cfg.suggest) {
        const rejected = new Set((conf && conf.rejected) || []);
        cands = suggest(idx, mp.name, { minScore: ctx.cfg.minScore, top: 3, rejected });
        if (cands.length) level = "suggestion";
      }
      const c = hit != null ? idx.rows[hit] : null;
      const flags = c ? sanity(mp, c, ctx.cfg) : [];
      res.push({
        store: idx.store.name, store_id: sid, level, comp: c, flags,
        cands: cands.map(x => ({ ...idx.rows[x.i], score: x.score })),
        gap_kr: c && mp.price ? mp.price - c.price : null,
        gap_pct: c && mp.price ? (mp.price / c.price - 1) * 100 : null
      });
    });
    return res;
  }
  function prepMP(row, keys, learned, priceCol) {
    const nr = String(pick(row, ["nr", "item_no", "sku", "id", "number"]) || "").trim();
    const k = keys.get(nr) || {}, l = learned[nr] || {};
    const eans = new Set([cleanEAN(pick(row, ["ean", "gtin"]))]), vvs = new Set([cleanVVS(pick(row, ["vvs", "vvs_nr"]))]), mfr = new Set();
    splitMulti(k.ean).concat(splitMulti(l.ean)).forEach(e => eans.add(cleanEAN(e)));
    splitMulti(k.vvs).concat(splitMulti(l.vvs)).forEach(v => vvs.add(cleanVVS(v)));
    splitMulti(k.vendor_item_no).concat(splitMulti(l.mfr)).forEach(m => mfr.add(cleanMfr(m)));
    [eans, vvs, mfr].forEach(s => s.delete(null));
    return {
      nr, name: String(pick(row, ["name", "title"]) || k.name || ""),
      price: num(row[priceCol]) ?? num(pick(row, ["price", "price_with_vat", "page.price"])),
      unit: k.unit || String(pick(row, ["unit"]) || ""), cost: num(k.cost), sales: num(k.sales_12m) || 0,
      image: String(pick(row, ["image", "image_url", "images", "img"]) || l.image_url || "").split(/[|, ]/)[0],
      eans: [...eans], vvs: [...vvs], mfr: [...mfr], vendor_item_no: k.vendor_item_no || "", vendor: k.vendor || ""
    };
  }

  const api = { LEVELS, LEVEL_LABEL, EXACT, num, cleanEAN, cleanVVS, cleanMfr, normName, tokens, dimsCompatible, unitHint, buildIndex, suggest, sanity, matchItem, prepMP, splitMulti, pick };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MPMatch = api;
})(typeof window !== "undefined" ? window : globalThis);
