---
stepsCompleted:
  - step-01-init.md
  - step-02-discovery.md
  - step-02b-vision.md
  - step-02c-executive-summary.md
  - step-03-success.md
  - step-04-journeys.md
  - step-05-domain.md
  - step-06-innovation.md
  - step-07-project-type.md
  - step-08-scoping.md
  - step-09-functional.md
  - step-10-nonfunctional.md
  - step-11-polish.md
  - step-12-complete.md
inputDocuments: []
workflowType: 'prd'
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 0
classification:
  projectType: saas_b2b
  domain: general (Shopify e-commerce context)
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - shopify-letters

**Author:** Eric
**Date:** 2026-03-22

## Executive Summary

shopify-letters is a greenfield Shopify app for small and midsize merchants selling customizable products whose prices depend on customer input (for example, engraved text length). It addresses a gap: merchants need input-based pricing, but common alternatives bundle this into larger, higher-cost apps with features they do not need.

Merchants configure fields and pricing rules once; shoppers enter customization on the storefront and see the correct price before purchase. Orders retain customization text and pricing-relevant metadata for fulfillment and support, reducing manual quoting and follow-up.

### What Makes This Special

The product is intentionally narrow: one high-value workflow instead of an all-in-one customization suite. Positioning is affordability and execution quality—roughly one-third the cost of broader alternatives—because craft and made-to-order sellers value fast setup, pricing correctness, and speed-to-purchase over feature breadth.

v1 prioritizes deterministic pricing: one canonical pricing model powers live preview and authoritative cart/checkout enforcement so displayed and charged amounts stay aligned.

## Project Classification

- **Project Type:** SaaS B2B (merchant-facing Shopify app)
- **Domain:** General software with Shopify e-commerce context
- **Complexity:** Medium (pricing consistency and storefront-to-cart correctness)
- **Project Context:** Greenfield

## Success Criteria

### User Success

Merchants configure input-based pricing quickly: select a product, add customization fields, define base and per-character rules, set character restrictions, and apply character-group pricing (free or premium groups) in **under 2 minutes** for a standard case.

Shoppers customize on the product page, see an updated price as they edit, and add to cart with clear customization context. At checkout, line items show the expected price and customization details (for example, a customized indicator and field values).

### Business Success

In the first 1–2 months, success is validated through real merchant usage and structured feedback, not aggressive growth targets. The signal is whether merchants configure and run live storefront flows with low friction.

By 12 months: **6–12 active stores**, sustained usage, low churn, and feedback that the app delivers measurable value (lower app spend, easier setup, less manual pricing work).

### Technical Success

- High add-to-cart success for customized lines
- Near-zero mismatch between preview price and charged/cart line price for valid flows
- Responsive recalculation during customization
- High availability for pricing and customization paths
- Reliable storage of customization payload for fulfillment

### Measurable Outcomes

- Merchant setup for a standard rule set: **≤ 2 minutes**
- Customization-to-cart completion: **baseline measured within the first 60 days** of production use, then improved iteratively
- Price mismatch events: **rare**, monitored as a primary quality metric
- Customized add-to-cart: **high, stable success rate** (targets set at implementation planning)
- **≥ 6 active stores** by month 12; retention as a primary KPI
- Recurring feedback loop (for example, monthly merchant touchpoints or in-app feedback) feeding roadmap decisions

## Product Scope

### MVP - Minimum Viable Product

- Enable customization pricing on selected products
- Customization form fields per product
- Base and per-character pricing rules
- Character restrictions (allowed/disallowed)
- Character-group pricing (for example, free or premium groups)
- Real-time storefront price updates during customization
- Add customized line to cart with metadata
- Authoritative price enforcement (display ↔ charged)
- Basic monitoring for pricing correctness and add-to-cart failures

### Growth Features (Post-MVP)

- Roadmap driven by merchant feedback
- Additional pricing models beyond per-character and group rules
- Merchant analytics and funnel insight
- Configuration UX for larger catalogs
- Onboarding and setup automation improvements

### Vision (Future)

- Portfolio of focused Shopify apps driven by demand
- Reuse platform learnings across apps
- Prefer narrow, high-value apps over oversized bundles

## User Journeys

### Journey 1: Primary Merchant - Success Path (Fast Setup, First Sale)

**Opening Scene:**  
A craft merchant sells engraved phone cases and gifts but struggles to collect correct upfront pricing without back-and-forth.

**Rising Action:**  
They install shopify-letters, pick a product, add fields, define per-character pricing, and set restrictions and group rules (target **under 2 minutes** for a standard setup).

**Climax:**  
A shopper customizes on the storefront, sees live price updates, and adds to cart with the expected price and details.

**Resolution:**  
The merchant gets paid orders with clear customization data and trustworthy pricing—less manual quoting and less undercharging risk.

### Journey 2: Primary Shopper - Edge Case and Recovery (Invalid Input)

**Opening Scene:**  
A shopper enters text that includes disallowed characters.

**Rising Action:**  
Immediate validation explains what is wrong; edits trigger live recalculation.

**Climax:**  
They reach a valid state and see the final price before committing.

**Resolution:**  
They add to cart with confidence; customization and price stay visible through cart and checkout.

### Journey 3: Admin/Operations - Catalog Expansion

**Opening Scene:**  
The merchant (admin) rolls customization out to more products and wants consistent behavior.

**Rising Action:**  
They reuse or adapt rules, verify storefront behavior across product types (engraving, jewelry text, wedding names, etc.).

**Climax:**  
Rules behave consistently for common and edge inputs before broad publish.

**Resolution:**  
Faster product onboarding, fewer pricing surprises, less operational overhead.

### Journey 4: Support - Price Dispute

**Opening Scene:**  
A customer questions a customized line price.

**Rising Action:**  
The merchant reviews order/cart context, submitted values, and applicable rules; compares displayed vs charged amounts.

**Climax:**  
They determine expected rule-based pricing vs an anomaly.

**Resolution:**  
Clear customer communication; rule updates if confusion repeats. Auditable inputs and rule context reduce support anxiety.

### Journey Requirements Summary

Capabilities implied by these journeys: product-level field and rule configuration; character rules and group pricing; live validation and recalculation; consistent pricing from product page through checkout; durable customization metadata on cart/orders; practical support visibility; clear invalid-input recovery.

## Domain-Specific Requirements

### Compliance & Regulatory

- Meet Shopify App Store and public app listing expectations.
- Document how characters are counted and billed (merchant-facing) to limit disputes.
- Disclose how customization data tied to cart/orders is handled.
- Apply baseline privacy and retention practices for merchant and customer data in target regions.

### Technical Constraints

- Deterministic pricing: same logical inputs produce the same price in preview and at cart/checkout.
- Explicit normalization: allowed/disallowed characters, grouping, counting rules.
- Immediate, understandable validation on the storefront.
- Safe failure: block invalid customization from completing purchase paths incorrectly.
- Latency suitable for in-session customization (see Non-Functional Requirements).

### Platform Integration (Shopify)

- Trace customization and pricing context across product, cart, and order surfaces.
- Persist payloads that support fulfillment and support troubleshooting.
- Use embedded admin patterns for merchant configuration.
- **v1 scope:** Shopify **Products**, **Cart**, and **Orders** (and required platform primitives). **Out of v1:** external CRM, email, analytics stacks, warehouses, and custom third-party APIs.

### Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Displayed price ≠ charged price | Canonical pricing engine; server-side enforcement; mismatch monitoring |
| Merchant misconfiguration | Previews, validation, safe defaults |
| Customer confusion on rules | Inline validation and clear formatting guidance |
| Ambiguous fulfillment data | Structured payload + human-readable order context |
| Scope creep | v1 stays on core Online Store customization; defer POS/multi-channel until justified |

## SaaS B2B Specific Requirements

### Overview

Merchant-facing B2B SaaS via the Shopify App Store. One installing merchant (shop) is one tenant: configuration and operational data are isolated per shop. v1 assumes a **single admin** manages all app settings.

### Architecture Notes

- **Tenancy:** Partition all app data by shop identity; deny cross-shop access.
- **Admin UX:** Embedded Shopify admin surfaces.
- **Storefront:** Online Store customization with live preview; cart/orders carry metadata and enforced pricing context.
- **Integrations:** Shopify-only in v1 (see Platform Integration above).

### Permission Model

- **v1:** One role — store admin / app manager — full configuration access.
- **Later:** Staff/read-only/fulfillment-scoped roles if demand appears.

### Billing

- **~1 week free trial**, then **one monthly paid plan** (Shopify billing).
- Trial/conversion behavior follows Shopify billing rules; listing copy states trial length and ongoing price.

### Compliance (product)

- App Store review plus baseline security/privacy hygiene (transparency, secure storage, least-privilege API use).
- No industry-specific regulatory program in v1 unless later required.

### Implementation Notes

- Surface trial end and monthly price before commitment where the platform allows.
- Tenant isolation testable (e.g., shop A cannot read shop B’s configuration).
- Defer non-Shopify connectors until post-MVP feedback identifies value.

## Project Scoping & Phased Development

### MVP Strategy

**Approach:** Problem-solving MVP — smallest release where real merchants run **live customization with correct charged prices** and structured order data.

**Team:** Small (solo or 2–3) with Shopify app, storefront, and pricing-enforcement skills; no dedicated compliance/integration team in v1.

### Phase 1 (MVP) — Journeys Supported

- Merchant: install → configure → publish (≤ ~2 min standard setup)
- Shopper: customize → live price → add to cart with correct context
- Support: explain price from captured inputs + rules (auditable, minimal tooling)

### Phase 1 — Must-Have Capabilities

Shop isolation; per-product fields and rules (base + per-character, restrictions, groups); storefront UI with validation + live price; authoritative cart/checkout pricing; cart/order capture of text + pricing context; ~1 week trial + monthly billing; basic signals for mismatch and failed customization-to-cart paths.

### Phase 2 (Growth)

Feedback-led roadmap; funnel/revenue analytics; richer pricing models; better catalog-scale configuration; staff permissions if needed; optional external integrations after the core loop is stable.

### Phase 3 (Expansion)

Additional Shopify surfaces only if demand proves it; additional focused apps in a portfolio.

### Risk Posture

- **Technical:** Price mismatch is the #1 failure mode — canonical function, enforcement, monitoring before feature sprawl.
- **Market:** Narrow scope + lower price — validate setup time and billing clarity with early merchants.
- **Resources:** If constrained, cut to **one storefront path + one pricing family + order capture** until mismatch rate is under control.

## Functional Requirements

### App Installation, Billing, and Shop Access

- FR1: A merchant can install the app on a Shopify store from the Shopify App ecosystem.
- FR2: A merchant can start a time-limited free trial before paying.
- FR3: A merchant can convert from trial to a single monthly paid subscription.
- FR4: A merchant can view and manage subscription state using Shopify-managed billing flows.
- FR5: The system can ensure all app-owned configuration and data are accessible only within the installing shop’s scope.

### Product and Customization Configuration

- FR6: A merchant can select one or more products to enable customization pricing.
- FR7: A merchant can add one or more customization fields to an enabled product.
- FR8: A merchant can define base pricing and per-character pricing rules for customization.
- FR9: A merchant can define allowed and disallowed character rules for customization inputs.
- FR10: A merchant can define character groups with distinct pricing behavior (for example, free groups or premium groups).
- FR11: A merchant can apply character-group rules to specific customization fields.
- FR12: A merchant can publish customization configuration so it becomes available on the storefront.
- FR13: A merchant can disable customization for a product without deleting historical order records.

### Storefront Customization and Pricing Preview

- FR14: A shopper can enter customization input on a product page for enabled products.
- FR15: A shopper can receive immediate validation feedback when input violates configured rules.
- FR16: A shopper can see a live updated price that reflects the current valid customization input.
- FR17: A shopper can understand which customization fields are required before purchase.

### Cart, Checkout, and Price Integrity

- FR18: A shopper can add a customized configuration to cart as a line item associated with the product.
- FR19: The system can compute an authoritative final price for a customized line based on the same rules used for preview.
- FR20: The system can prevent checkout progression when customization inputs are invalid or incomplete.
- FR21: A shopper can see customization details associated with cart and checkout line items.
- FR22: The system can keep the shopper-facing charged amount consistent with the authoritative customized line price for valid flows.

### Orders and Fulfillment Support

- FR23: A merchant can view customization inputs and pricing-relevant details on placed orders.
- FR24: A merchant can use order line details to fulfill customized work without relying on informal channels.
- FR25: A merchant can diagnose “price looked wrong” cases using captured customization inputs and applied rule context.

### Operational Visibility (MVP)

- FR26: A merchant can access basic operational signals needed to debug early installs (for example, failed customization-to-cart attempts or pricing mismatch indicators).

## Non-Functional Requirements

### Performance

- The system shall keep price recalculation and validation feedback responsive during interactive editing on the product page (target: sub-second perceived latency for typical edits on a single field under normal conditions), measured during acceptance testing and monitored in production.
- The system shall complete cart line updates for customized products reliably under typical storefront network conditions.

### Reliability

- The system shall maintain very high correctness between preview pricing and charged pricing for customized lines on valid flows.
- The system shall emit diagnostic signals sufficient to detect, triage, and investigate pricing mismatch events.
- The system shall maintain high availability for customization and pricing operations during normal operating windows.

### Security & Privacy

- The system shall enforce strict shop isolation for merchant configuration and shopper customization data.
- The system shall protect data in transit and at rest using baseline ecommerce-appropriate practices for order-related personalization data.
- The system shall use least-privilege access to Shopify-scoped credentials and tokens.

### Scalability

- The system shall support growth from pilot shops to the 6–12 active-store target without redesigning tenancy boundaries.
- The system shall tolerate typical small-merchant traffic variation without manual scaling for normal peaks.

### Accessibility

- The system shall meet **WCAG 2.1 Level AA** as the target for customer-facing customization controls (keyboard operability, screen reader compatibility for core interactions).

### Integration & Platform Degradation

- When Shopify platform calls fail, the system shall fail safely: prefer blocking incorrect charges over silent partial success, with merchant-visible outcomes where applicable.
