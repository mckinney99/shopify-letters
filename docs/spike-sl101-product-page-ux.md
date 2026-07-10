# SL-101 Spike: Admin Product Page UX Overhaul

**Status:** Decision pending  
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

## Recommendation

**Ship Option C first.**

- Smallest risk: the page structure doesn't change for merchants who don't open the panel
- Unblocks SL-97 (font size), SL-98 (font picker overhaul), SL-100 (rotation) — all slot cleanly into the sidebar
- If merchant feedback says "I always want the preview visible," we can default the panel to open (one-line localStorage default change)
- If usage data later shows split-screen is strongly preferred, Option B becomes an incremental upgrade from C, not a rewrite

Option A is ruled out because splitting font/color/size controls across Fields and Preview tabs violates the principle that per-field settings live with the field editor.

---

## Story Breakdown (Option C)

| Story | Title | Points | Notes |
|---|---|---|---|
| SL-102 | Pricing tab: add option upcharges summary | 2 | Read `priceDelta` from existing field options; render below per-char rules. No schema change. |
| SL-103 | Product page: collapsible preview sidebar with toggle | 3 | Move `PreviewPlacementBoxEditor` from inline card → sidebar panel. Add toggle button to toolbar. localStorage state. |
| SL-104 | Preview sidebar: onboarding tooltip on first visit | 1 | One-time Polaris `Tooltip` pointing at the toggle button. localStorage dismiss. |

After these three, SL-97 (font size picker), SL-98 (searchable font dropdown), and SL-100 (rotation) all target the sidebar panel and can be shipped in any order.
