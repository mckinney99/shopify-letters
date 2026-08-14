# SL-101 Spike: Admin Product Page UX Overhaul

**Status:** Decision made — Option D  
**Output:** Design options + recommendation + story breakdown

---

## Problem

The product configuration page (`/app/products/:id`) has grown organically across several sprints. Three problems have surfaced:

1. **Live preview is buried** — the preview placement editor lives inside the Fields tab as a collapsible card. Merchants don't discover it, and it gets cramped when the field list is long.
2. **Pricing lives in two places** — per-option `priceDelta` is set inline on choice fields (Fields tab), and per-character rules live in the Pricing tab. Merchants don't know which tab to look in.
3. **Layout doesn't scale** — font picker, color picker, font size (SL-97), rotation (SL-100), and more upcoming options will keep piling into the Fields tab.

## Current State

- 2 tabs: **Fields** and **Pricing**
- Preview placement editor embedded inside Fields tab (toggle card)
- Per-option pricing edited inline in the field editor form
- Per-character pricing in the Pricing tab
- ~2,242 lines in a single route file

---

## Option A — Dedicated Preview Tab

Add a third **Preview** tab. Move the placement editor, font/color/size controls, and the live canvas out of Fields entirely.

**Layout:** Fields | Pricing | Preview (NEW)

**What moves:**
- Placement editor → Preview tab
- Font/color pickers (currently per-field in the field form) → Preview tab
- Pricing tab gains a consolidated option upcharges section alongside per-char rules

**Trade-offs:**

| | |
|---|---|
| ✅ | Each tab has exactly one job |
| ✅ | Preview gets full screen width — not cramped |
| ✅ | Pricing consolidation fits naturally |
| ⚠️ | Merchant must navigate away from Fields to check preview (3 tabs = more clicking) |
| ⚠️ | Font/color pickers are per-field settings but live in a different tab from the field editor — feels disconnected |

---

## Option B — Split-Screen Layout

Widen the page to ~1100px. Config tabs occupy the left ~65%; a live preview panel is pinned to the right ~35% at all times.

**Layout:** [Fields | Pricing tabs] | [Live Preview panel — always visible]

**What changes:**
- Preview panel is always visible, always up-to-date
- Panel shows placement controls, field selector, x/y/rotation metrics
- Left pane keeps the current 2-tab structure
- Pricing tab consolidates per-char + option upcharges

**Trade-offs:**

| | |
|---|---|
| ✅ | Preview always visible — zero tab-switching friction |
| ✅ | Immediate feedback when editing font/color/size/position |
| ✅ | Pricing consolidation fits naturally in left pane |
| ⚠️ | Cramped at ~800px viewport width (most 13" laptops) |
| ⚠️ | Panel takes 35% width even when merchant doesn't need preview |
| ⚠️ | Largest implementation effort of the three |

---

## Option C — Collapsible Preview Sidebar ⭐ Recommended

Keep the current 2-tab layout. Add a **"Preview panel" toggle button** in the tab toolbar. When toggled on, a sidebar slides in from the right (~290px), creating a split view. When toggled off, the main content expands back to full width. State persists in localStorage.

**Layout (panel open):** [Fields | Pricing tabs] | [▶ Preview sidebar]  
**Layout (panel closed):** [Fields | Pricing tabs — full width]

**What changes:**
- Preview placement editor moves from embedded Fields card → sidebar panel
- Toggle button in the toolbar (subtle, not prominent — doesn't impose the panel)
- Pricing tab gains a consolidated option upcharges section
- Sidebar remembers open/closed state per-browser

**Trade-offs:**

| | |
|---|---|
| ✅ | Works at any screen width — closed state is identical to today |
| ✅ | Preview on demand — not forced on merchants who don't use it |
| ✅ | Smallest diff from today's layout — lowest implementation risk |
| ✅ | Pricing consolidation easy to add in the same PR |
| ✅ | Extensible — rotation (SL-100), font size (SL-97) slot naturally into the sidebar |
| ⚠️ | Preview is opt-in — merchants need to discover the toggle (mitigated by a one-time onboarding tooltip) |
| ⚠️ | Sidebar narrower than Option B's right pane (~290px vs ~320px) |

---

## Pricing Consolidation (applies to all options)

The Pricing tab should be the single source of truth for all money. Proposed structure:

```
Pricing tab
├── Per-character rules
│   └── [field name] → [$X / char for A-Z] → [Edit]
└── Option upcharges
    └── [field name] → [option label] → [+$X] → [Edit]
```

Option upcharges can still be edited inline in the field editor (convenience), but the Pricing tab shows the complete picture. This removes the "where do I set pricing?" confusion without removing the inline editing shortcut.

---

## Option D — No Tabs, Inline Pricing, Right Preview Panel ⭐ CHOSEN

Emerged from design review. Supersedes Options A–C.

**What changes:**
- **Pricing tab removed entirely.** Per-character char-group pricing moves inline into each text/textarea field card. Per-option pricing already lives inline on choice fields — no change needed there.
- **No tabs at all.** Single scrollable field list. Simpler IA.
- **Live preview panel** fixed to the right (~300px). At narrow viewports (<900px) it snaps to bottom automatically. No manual position toggle for now — revisit if merchant feedback asks for it.
- **Preview panel shows storefront-accurate context:** product image + text overlay (with actual configured font/color loaded via Google Fonts), product title, price, Etch widget input, and a visual Add to Cart button (non-functional, labeled "preview only").
- **"Preview on store" button** in the page header opens the real storefront product page — actual theme, no simulation. Works even when the product is not yet published via a signed preview token (see below).

**Preview token flow:**
1. Merchant clicks "Preview on store" in admin
2. Admin generates HMAC-signed token (`shop + productId + expiry`, 30-min TTL, stateless)
3. Opens `https://{shop}/products/{handle}?etch_preview={token}` in a new tab
4. Storefront `etch-customization.js` detects the param, sends token to `/api/preview` for validation
5. If valid: renders widget with full field config regardless of `published` state
6. A dismissible "You're previewing — this isn't live yet" banner renders on the product page so the merchant knows this is preview-only and customers are unaffected
7. Token expiry and per-request HMAC validation ensure no customer ever sees the unpublished widget

---

## Recommendation

**Ship Option D.**

- Eliminates the "where do I set pricing?" confusion completely — no tab to look in, it's right there on the field
- Preview panel always visible alongside fields — zero friction, no toggle needed
- "Preview on store" solves a real merchant pain point (can't see what it looks like until published) with a secure token mechanism
- Responsive snap (right → bottom) handles narrow screens without a position toggle UI
- Unblocks SL-97, SL-98, SL-100 — all slot naturally into the preview panel

---

## Story Breakdown (Option D)

| Story | Title | Points | Notes |
|---|---|---|---|
| SL-102 | Admin: remove Pricing tab — move char-group pricing inline into field cards | 3 | Move `PricingTab` char-group editor into each text/textarea `FieldRow` expanded view. Delete the Pricing tab. No schema change. |
| SL-103 | Admin: live preview panel (right, snaps to bottom on narrow screens) | 5 | Move `PreviewPlacementBoxEditor` to a fixed right panel. Panel shows product image + overlay, product title/price, Etch widget input, visual ATC button. Load configured Google Fonts in admin for accurate rendering. Snap to bottom below 900px. |
| SL-104 | Admin + Storefront: "Preview on store" with signed token + preview banner | 3 | Admin generates HMAC token, opens storefront URL with `?etch_preview=token`. Storefront widget validates token via `/api/preview`, renders even if unpublished. Dismissible "You're previewing" banner on storefront. |

After these three, SL-97 (font size picker), SL-98 (searchable font dropdown), and SL-100 (rotation) all target the preview panel and can be shipped in any order.
