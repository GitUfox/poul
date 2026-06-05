# Poul Changelog

---

## Audit — 2026-06-04

**Effort:** high | **SW version:** poul-v13

### Code Quality

- **Fixed:** `saveState()` — moved `const toSave` above the `try` block — *Why: `const` is block-scoped; the `catch` handler for `QuotaExceededError` referenced `toSave` to strip photos and retry, but couldn't see it. This caused a silent `ReferenceError` at the exact moment the fallback was needed — user progress was lost when localStorage was full.*
- **Fixed:** `revealCard()` — changed `card.rarity.toLowerCase()` to `(card.rarity || 'Common').toLowerCase()` — *Why: travel pack cards with a missing `rarity` field would throw a `TypeError` and crash the card reveal screen.*
- **Fixed:** Token replenishment copy — removed "Tokens replenish daily." from the How to Play sheet — *Why: no such code exists. Tokens only decrease and reset on full reset. The copy was a false promise. Replaced with "tokens don't refill automatically."*

### Security

- **Fixed:** `renderPool()` — mapsUrl now validated with `/^https?:\/\//i` before being set as `href` — *Why: the card reveal screen already had this guard, but the pool view set the URL raw. A `javascript:` URL in a pack file would execute on click.*
- **Fixed:** Added `escHtml()` helper and applied to all card fields in `renderPool()` (title, rarity, completedAt, description, cost, duration, time, season, bonus) — *Why: card string fields were inserted directly into `innerHTML` without escaping. A tampered pack file could inject HTML that executes due to `unsafe-inline` in the CSP.*
- **Fixed:** `renderPackOptions()` — pack `name` and `location` now escaped with `escHtml()`; pack `id` now wrapped in `encodeURIComponent()` in the `onclick` attribute, and decoded with `decodeURIComponent()` in `selectPack()` — *Why: a pack id containing a single quote would break out of the onclick string and could be exploited; a malicious name/location could inject HTML.*

### Simplification

- **Fixed:** `renderPool()` — removed inline `rarityColors` object; replaced with new module-level `POOL_RARITY_COLORS` constant defined near `RARITY_COLORS` — *Why: the local object was an anonymous duplicate that diverged from the global. Now the intentional visual difference (muted pool colors vs. bright reveal colors) is documented and named.*
- **Fixed:** Scrollbar CSS — replaced two hardcoded `#212621` values with `var(--surface3)` — *Why: `--surface3` is already `#212621` per the design token. Hardcoding the same value in two places creates drift risk if the token ever changes.*
- **Fixed:** Removed dead CSS property `dummy: none` from `.wordmark-ball` rule — *Why: no-op property, left over from a placeholder. No visual impact.*

### Deferred

- None — all identified issues were auto-fixable.

**Summary:** 9 fixes applied, 0 deferred.

---
