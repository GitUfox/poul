# Poul — Affiliate Activation

The booking CTA on the result screen ("Make it happen") deep-links the committed
venue to a partner. Until affiliate IDs are filled in, the links are plain
searches and earn nothing — but they work. Flip them on by editing the
`AFFILIATE` config near the top of the booking section in `poul-v1.5.html`.

> These IDs ship inside public URLs in the browser bundle. They are **not secrets**
> — do NOT put them in `.env`. Paste them straight into the `AFFILIATE` object.

Each partner has a `mode`:
- `'none'` — plain search link (default, earns nothing)
- `'param'` — append query params to the destination URL
- `'wrap'` — prefix a network redirect that URL-encodes the destination

---

## Viator (mode: `param`) — adventure / active cards

1. Join the **Viator Partner Program** → https://www.viator.com/partner/affiliates
   (runs on Partnerize; approval is usually fast).
2. From the dashboard, grab your **PID** (looks like `P00XXXXX`).
3. Edit the config:

```js
viator: { mode: 'param', params: { pid: 'P00XXXXX', mcid: '42383', medium: 'link' } },
```

`mcid: '42383'` and `medium: 'link'` are Viator's standard API-partner values; keep them unless your dashboard says otherwise.

---

## OpenTable (mode: `wrap`) — foodie cards

OpenTable's affiliate runs through **CJ Affiliate** (Commission Junction).

1. Join CJ → https://www.cj.com/ , then apply to the **OpenTable** advertiser program.
2. In CJ, build a **deep link** to `https://www.opentable.com/` — CJ gives you a
   click-redirect URL ending in `...?url=` (or `/destination/`).
3. Paste the redirect prefix (everything up to and including `url=`):

```js
opentable: { mode: 'wrap', wrap: 'https://www.anrdoezrs.net/links/XXXXXXX/type/dlg/sid/poul/?url=' },
```

The app appends the URL-encoded destination automatically.

---

## Ticketmaster (mode: `wrap`) — social cards

Ticketmaster's affiliate runs through **Impact** (impact.com).

1. Apply to the **Ticketmaster** program on Impact → https://impact.com/
2. Create a tracking link for `https://www.ticketmaster.com/` and copy the
   redirect prefix that encodes a destination (`...?u=` style).

```js
ticketmaster: { mode: 'wrap', wrap: 'https://ticketmaster.evyy.net/c/XXXXXXX/XXXXXX/XXXX?u=' },
```

---

## Shortcut: monetize everything with one ID

If per-merchant signups are too much friction, **Sovrn Commerce / Skimlinks**
auto-affiliates outbound merchant links with a single site ID. Wrap every
partner (including Google-less ones) via `mode: 'wrap'` with:

```
https://go.skimresources.com/?id=YOURSITEID&xs=1&url=
```

Trade-off: it routes clicks through a third party (a privacy consideration to
disclose). Per-merchant `param`/`wrap` above is more transparent.

---

## After editing

1. Bump the service-worker cache in `sw.js` (`poul-vNN` → next number) so phones
   pull the change.
2. Commit + push; GitHub Pages auto-deploys.
3. Smoke test: commit to a foodie card, tap **Reserve a table**, confirm the URL
   carries your ID.
