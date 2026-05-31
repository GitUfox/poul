# POUL — Product Scope & Design Specification
### Pronounced "pool" · Version 1.0 · Draft for Review

---

## 1. PRODUCT VISION

**One sentence:** A location-aware activity lottery that gamifies spontaneity — solo or with friends — rewarding people who say yes and gently roasting those who don't.

**The Name:**
"Poul" carries two meanings simultaneously: the **pool of cards** you draw from, and the **8-ball of chance** — you don't always know what you'll get, but you still have to call your shot.

**Tagline:** *Luck favors the spontaneous.*

**Design Philosophy (borrowed from the greats):**
- *Cards Against Humanity*: The card IS the experience. It should feel physical, weighty, and a little unpredictable.
- *Yahtzee*: Randomness is the fun. You don't control the roll — you control how you respond to it.
- *Pool*: You rack 'em up, you take your shot, you live with the result.

---

## 2. TARGET USER

**Primary:** Ages 22–35, socially active, experience-oriented. They travel, they hike, they go to rooftop bars. They're not broke but they're not planning black-tie events either.

**Psychographic:** The person who says "we should do something different this weekend" but then ends up at the same bar. Poul is their escape hatch.

**Use Cases:**
- Friday night with 3 friends, nobody can decide
- Solo traveler in a new city wanting direction
- Couples looking to break routine
- Travel groups who want structured spontaneity

---

## 3. CORE MECHANICS

### 3.1 The Draw
The central interaction. User selects a **Vibe Category**, taps the **8-ball**, and receives an **Activity Card**. The card contains:
- Activity name + one-line description
- Category tag
- Practical metadata: estimated cost, time commitment, distance from user
- A "Bonus Challenge" (micro-dare attached to the activity)
- Rarity tier: Common / Rare / Legendary

### 3.2 Vibe Categories
| Category | Examples |
|----------|---------|
| 🔥 Adventure | Hot air balloon, cliff jumping, escape room |
| 🍜 Foodie | Hidden supper club, food truck crawl, cooking class |
| 🧘 Chill | Botanical garden, sunset hike, bookstore crawl |
| 🎉 Social | Bar trivia, rooftop happy hour, karaoke |
| 💪 Active | Pickup basketball, trail run, Muay Thai class |
| 🎱 The 8-Ball | No category. No filter. No redraws. You called your shot — now pocket it. |

### 3.3 The Spark Score
Every user has a **Spark Score** — a persistent reputation metric that reflects their spontaneity over time.

| Action | Spark Impact |
|--------|-------------|
| Draw a card + commit + complete | +15 |
| Draw a card + commit + bail | -20 |
| Draw a card + decline | -5 |
| Redraw (costs a token) | -2 |
| Complete a Legendary activity | +40 |
| Complete a streak of 3 | +25 bonus |
| Complete bonus challenge | +10 |
| Complete an 8-Ball draw | +25 |

**Spark Score determines:**
- Card pool quality (low score = blander draws over time)
- Poul Type assignment
- Leaderboard ranking among friends

### 3.4 Token Economy
- Users start with **10 Redraw Tokens**
- Tokens replenish: 2/day (free tier), 5/day (premium)
- Spending a token redraws within the same category
- Tokens can be gifted to friends ("I dare you to keep this card")
- Tokens earned by completing activities and streaks

---

## 4. MULTIPLAYER / GROUP MODE

### 4.1 The Group Draw — "Rack 'em Up"
- One user creates a **Session** (generates a 4-digit code)
- Friends join via code or link
- Host selects category (or group votes)
- All players see the same card simultaneously
- 30-second countdown to commit or decline
- Results revealed all at once (the poker moment)

### 4.2 Commitment Outcomes
| Scenario | Result |
|----------|--------|
| All in | Max Spark bonus for everyone, activity locked in |
| Majority in | Activity proceeds, dissenters take Spark hit |
| Tie | 8-Ball automatically drawn, must commit |
| All out | Everyone takes a small penalty, forced redraw |

### 4.3 The Hot Seat Mode (Phase 2)
- One player randomly selected as the Caller
- Others bet YES or NO on whether Caller commits
- Correct predictions earn tokens
- Caller's decision revealed with dramatic delay

### 4.4 The Dare Stack (Phase 2)
- Each player secretly submits one activity before the session
- App draws randomly from the pool
- Nobody knows whose dare got drawn
- Anonymous accountability — spiciest mode

---

## 5. PROGRESSION & IDENTITY

### 5.1 Poul Types
Assigned after 20+ draws based on behavior patterns. Designed as shareable cards — your organic growth engine.

| Type | Description |
|------|-------------|
| 🔥 The Igniter | Always says yes. High Spark. Drags everyone along. |
| 🌊 The Drifter | Goes with flow, never initiates but never bails. |
| 🗺️ The Planner in Disguise | Only commits to easy cards. Thinks they're spontaneous. |
| 🎱 The 8-Ball | Unpredictable, high variance. Nobody can read them. |
| 🧊 The Ice Block | Statistically least spontaneous. The pool has receipts. |
| 👻 The Ghost | Joins sessions. Never commits. Haunts the leaderboard. |

### 5.2 The Collection — "Your Pool"
Every completed activity adds a card to the user's personal pool. Browseable like a travel journal with date, crew, optional photo, and location stamp.

### 5.3 Streaks
- 3-day streak: bonus tokens
- 7-day streak: unlocks Hidden Gem card tier
- 30-day streak: Legendary status, exclusive city pack unlock

---

## 6. CONTENT & LOCATION SYSTEM

### 6.1 Card Content
Cards are **city-aware**, served based on device location.

**Content tiers:**
- **Tier 1 (Launch):** Phoenix/Scottsdale, 30–40 manually curated cards
- **Tier 2 (Scale):** Top 20 US cities, Claude API-assisted curation
- **Tier 3 (Travel):** International packs (France, Norway, Turkey, etc.)

### 6.2 Card Rarity
- **Common:** Accessible, low-cost, easy yes
- **Rare:** Requires planning or spend
- **Legendary:** Once-in-a-while experiences

---

## 7. MONETIZATION

| Model | Details |
|-------|---------|
| Free Tier | Home city, 2 redraws/day, basic categories |
| Premium ($4.99/mo) | All cities, 5 redraws/day, 8-Ball access, Dare Stack mode |
| City Packs ($2.99 each) | One-time unlock for travel destinations |
| Gift Tokens | IAP, gifting mechanic between friends |
| Brand Partnerships | Local businesses sponsor Legendary cards |

---

## 8. MVP SCOPE (BUILD PHASE 1)

### In for V1
- [ ] Single user flow: category select → 8-ball draw → commit / decline
- [ ] Spark Score tracking + visual display
- [ ] Activity cards with metadata (cost, time, distance)
- [ ] Card collection / "Your Pool" journal
- [ ] Phoenix/Scottsdale content (30–40 cards)
- [ ] Poul Type assignment + shareable type card
- [ ] Redraw token system (basic)

### Out for V1 (Phase 2+)
- Group / multiplayer mode
- Hot Seat + Dare Stack modes
- Travel city packs + monetization
- Streak system + advanced progression
- Brand partnerships + Legendary card sponsorships

---

## 9. DESIGN SYSTEM

**Aesthetic:** Dark as a pool hall at midnight. The felt green carries through as the primary accent. The 8-ball is the brand's visual anchor: black, precise, weighted with consequence.

**Typography:**
- *Manrope* — UI text, metadata, labels, buttons
- *Playfair Display* — Card titles, section headers, the "8" inside the ball

**Color Palette:**
| Token | Value | Use |
|-------|-------|-----|
| Background | `#0e0f0e` | App background |
| Surface | `#161a16` | Cards, panels |
| Felt | `#2d6a4f` | Primary brand color |
| Felt Bright | `#3d9970` | CTAs, accents, links |
| Commit | `#52d98a` | Yes / commit button |
| Decline | `#e85d75` | No / pass button |
| Ivory | `#f2ead8` | 8-ball circle, Legendary tier |
| Text Primary | `#f0f0eb` | Body text |
| Text Secondary | `#6e7a6e` | Metadata, labels |

**The 8-Ball:** Hero draw button. Radial gradient from deep charcoal to black. Ivory circle with "8" in Playfair. Taps → slight rotation + green glow on hover. This is the money interaction.

---

## 10. OPEN QUESTIONS — Call Your Shot First

1. **Web app or native?** Web-first (single HTML file like Wandr) recommended for V1.
2. **How do we verify completion?** Honor system V1 → photo upload V2 → GPS V3.
3. **Standalone or Wandr feature?** Poul has its own identity — strong case for standalone.
4. **Social graph for V1?** Session-only recommended (no accounts, lower friction).
5. **Static or API-generated cards?** Hand-curated for Phoenix launch. Claude API for scaling.

---

*POUL · Scope Document V1.0 · Luck favors the spontaneous.*
