# MP price compare

The price check now runs at **https://mp-price-compare.heinijoensen.workers.dev/** (Cloudflare Worker + KV).
This GitHub Pages site only redirects there.

- Data is refreshed automatically (weekly by default) by a data job; nobody needs to upload files.
- Access is checked server-side (user code / separate admin code, stored only as salted hashes in Worker secrets).
- Admins can trigger a run, change settings and handle user flags inside the site.
- `match.js` is the shared matching engine (confirmed > EAN > VVS > supplier item no. > name suggestion, with price sanity checks).

No prices, costs or keys are stored in this repository.
