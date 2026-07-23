# Poul — Analytics (PostHog)

Wired 2026-07-22, dormant until activated. Same pattern as [AFFILIATES.md](AFFILIATES.md):
the config lives in `poul-v1.5.html` (`POSTHOG` object, next to `AFFILIATE`), and the
key is **public by design** — a `phc_…` project API key can only ingest events, never
read data. It does NOT go in `.env`.

## To activate (one human step, one paste)

1. Create a free PostHog account at posthog.com → new project → **US Cloud**
   (free tier: 1M events/month — Poul won't scratch it).
2. Copy the **Project API key** (`phc_…`) from Project Settings.
3. Paste it into `POSTHOG.key` in `poul-v1.5.html`.
4. Bump the SW cache version in `sw.js` (`poul-v35` → `poul-v36`) — required for
   the change to propagate to installed PWAs.
5. Commit + push. Verify events arrive in PostHog's Activity view within minutes.

While `key === ''`: no script loads, no network requests, `track()` is a silent no-op.

## Privacy posture (deliberate — don't loosen casually)

| Setting | Value | Why |
|---|---|---|
| `autocapture` | off | Explicit events only — the schema below is the contract |
| `disable_session_recording` | true | No replay; nobody's browsing is filmed |
| `persistence` | localStorage | No cookies → no consent-banner obligation |
| `person_profiles` | identified_only | All events anonymous (no accounts in V1) — also the cheap event class |
| `respect_dnt` | true | Do Not Track honored |

## Event schema

| Event | Fired when | Properties |
|---|---|---|
| `card_drawn` | startDraw() lands a card | card_id, card_title, pack, category, rarity, cost |
| `card_redrawn` | redrawCard() succeeds | + tokens_left |
| `card_committed` | commitCard() | + spark_earned, streak |
| `card_declined` | declineCard() | cardProps |
| `streak_milestone` | streak hits 3 / 7 / 30 | days |
| `pack_selected` | selectPack() | pack |
| `booking_link_tapped` | booking CTA link clicked | label, card_id, pack |
| `$pageview` | app open (built-in) | — |

`cardProps()` in the HTML is the single source for the shared property block —
extend it there, not per-event.

## What the data is for

- **Commit rate per card** = natural quality score → drives the next card audit
  and the demographic-fit analysis (see back-pocket notes).
- **`booking_link_tapped`** = the affiliate-activation signal. When this has real
  volume, enrolling in the affiliate programs stops being guesswork.
- **Pack popularity / redraw rate / session depth** — engagement proof for any
  future partner or sponsor conversation.

## CSP

`poul-v1.5.html` line 14 allows exactly two PostHog origins:
`us-assets.i.posthog.com` (script-src + connect-src) and `us.i.posthog.com`
(connect-src). If PostHog's snippet ever needs another origin, add it
deliberately — don't wildcard.
