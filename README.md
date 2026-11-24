# MP Price Comparison

Static, browser-only price comparison for handil.mp.fo vs competitor price lists (no server, no AI calls).
Live: https://heinijoensen.github.io/mp-price-compare-public/

## Matching ladder
1. **Confirmed** – a match a person confirmed on the Review tab (saved in the browser; share via `confirmed_matches.json`).
2. **EAN exact** – EAN/GTIN from Business Central barcodes (item references) or lookup results.
3. **VVS exact** – VVS no. from BC vendor item numbers (9-digit) and earlier confirmed VVS work.
4. **Item no. exact** – supplier/manufacturer item no. (normalised) vs the shop's product number / SKU.
5. **Suggestion** – token-based name match (Faroese→Danish trade words), sizes must agree (15 mm ≠ 22 mm, 1/2" ≠ 3/4"). Never counted in the report until confirmed.

Only 1–4 reach the **Adjust** list. Pairs with a suspicious price (ratio > 2.5× / < 0.4×, ~25% VAT gap, unit/pack mismatch, competitor below our cost) go to **Check**.

## Files
- `match.js` – matching engine (also runs in Node for tests).
- `mp_keys_public.json` – non-sensitive keys for handil items: item no, EAN, VVS, supplier item no, unit. No prices/costs.
- `confirmed_matches.json` – shared confirmations. Export from the app (Review or Settings) and replace this file to share with others.
- The full BC keys file (with cost) is **not** in this public repo; upload it in Settings → it stays in the browser.
- Lookup results CSV (`item_no, ean, vvs, source_url, image_url`) can be imported in Settings.
