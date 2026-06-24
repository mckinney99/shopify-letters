import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  {
    title:
      "Etch: Per-Character Pricing for Shopify | Custom Engraving & Personalization",
  },
  {
    name: "description",
    content:
      "Etch lets you charge customers based on what they type. Set per-character and per-letter pricing for custom engraving, monogramming, personalized jewelry, custom mugs, tote bags, and more. No code required.",
  },
  { property: "og:title", content: "Etch: Per-Character Pricing for Shopify" },
  {
    property: "og:description",
    content:
      "Charge customers based on what they type. Perfect for custom engraving, monogramming, personalized gifts, and any Shopify product with custom text.",
  },
  { property: "og:url", content: "https://etch.direct" },
  { property: "og:type", content: "website" },
  { property: "og:image", content: "https://etch.direct/og-image.png" },
  { name: "twitter:card", content: "summary_large_image" },
  {
    name: "twitter:title",
    content: "Etch: Per-Character Pricing for Shopify",
  },
  {
    name: "twitter:description",
    content:
      "Charge customers based on what they type. Per-character pricing for engraving, monogramming, and custom text products on Shopify.",
  },
  { name: "twitter:image", content: "https://etch.direct/og-image.png" },
  { tagName: "link", rel: "canonical", href: "https://etch.direct" },
];

const schema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Etch",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Shopify",
  url: "https://etch.direct",
  description:
    "Etch adds per-character and per-letter pricing to Shopify products. Merchants set a flat fee and a price per character typed, and Etch automatically calculates and adds the right amount to the cart at checkout. No code required.",
  offers: {
    "@type": "Offer",
    price: "9.99",
    priceCurrency: "USD",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: "9.99",
      priceCurrency: "USD",
      billingDuration: "P1M",
    },
  },
  provider: {
    "@type": "Organization",
    name: "Etch",
    url: "https://etch.direct",
  },
};

const USE_CASES = [
  "Custom Engraving",
  "Monogramming",
  "Personalized Jewelry",
  "Custom T-Shirts",
  "Custom Mugs",
  "Custom Tote Bags",
  "Custom Keychains",
  "Custom Water Bottles",
  "Custom Coasters",
  "Custom Stickers",
  "Custom Signs",
  "Custom Wristbands",
  "Custom Bracelets",
  "Custom Notepads",
  "Custom Posters",
  "Custom Patches",
  "Corporate Apparel",
  "Personalized Gifts",
  "Custom Pet Tags",
  "Custom Coins",
  "Custom Magnets",
  "Wedding Gifts",
  "Custom Keyrings",
  "Custom Bookmarks",
];

const STEPS = [
  {
    num: "1",
    heading: "Pick a product",
    body: "Choose any product from your Shopify store: an engraved ring, a custom tote bag, a personalized mug, or anything else your customers can personalise.",
  },
  {
    num: "2",
    heading: "Set your pricing",
    body: 'Add a text field (e.g. "Enter engraving text"), set a flat base fee and/or a price per character. Etch handles the calculation automatically.',
  },
  {
    num: "3",
    heading: "Go live instantly",
    body: "Publish with one click. Customers type, Etch calculates the right price, and the updated total appears in the cart. No code, no plugins, no developer needed.",
  },
];

const INCLUDES = [
  "Unlimited products",
  "Unlimited orders",
  "Flat fee + per-character pricing",
  "Automatic cart price updates",
  "Customer text visible in admin",
  "Works with any Shopify theme",
  "No code required",
  "14-day free trial",
];

const APP_STORE_URL = "https://apps.shopify.com/etch";

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* ── Nav ── */}
      <header className="nav">
        <div className="nav-inner container">
          <span className="logo">Etch</span>
          <a href={APP_STORE_URL} className="btn btn-sm" rel="noopener noreferrer" target="_blank">
            Add to Shopify
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">Shopify custom pricing app</p>
          <h1 className="hero-h1">
            Charge customers exactly<br />
            what their personalisation<br />
            is worth.
          </h1>
          <p className="hero-sub">
            Etch adds <strong>per-character and per-letter pricing</strong> to any Shopify product.
            Set a price per character typed and Etch automatically calculates the right total at checkout.
            No code, no developer, no guesswork.
          </p>
          <div className="hero-actions">
            <a href={APP_STORE_URL} className="btn btn-lg" rel="noopener noreferrer" target="_blank">
              Start free 14-day trial →
            </a>
            <p className="hero-small">$9.99/month after trial · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* ── Use cases strip ── */}
      <section className="use-cases">
        <div className="container">
          <p className="use-cases-label">Works for every custom product</p>
          <div className="use-cases-grid">
            {USE_CASES.map((label) => (
              <span key={label} className="use-case-chip">{label}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="how" id="how-it-works">
        <div className="container">
          <h2 className="section-heading">Set up in under 2 minutes</h2>
          <p className="section-sub">
            No developer. No custom code. Just three steps to live per-character pricing on your Shopify store.
          </p>
          <div className="steps">
            {STEPS.map((s) => (
              <div key={s.num} className="step">
                <div className="step-num">{s.num}</div>
                <h3 className="step-h">{s.heading}</h3>
                <p className="step-p">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Video placeholder ── */}
      <section className="video-section">
        <div className="container">
          <h2 className="section-heading">See Etch in action</h2>
          <p className="section-sub">Watch how to go from zero to live per-character pricing in under two minutes.</p>
          <div className="video-placeholder">
            <div className="video-play">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="video-coming">Video coming soon</p>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="pricing" id="pricing">
        <div className="container pricing-inner">
          <h2 className="section-heading">Simple, transparent pricing</h2>
          <p className="section-sub">One plan. Everything included. Cancel from your Shopify admin at any time.</p>
          <div className="price-card">
            <div className="price-top">
              <p className="price-name">Monthly</p>
              <p className="price-amount"><span className="price-dollar">$</span>9.99<span className="price-period">/month</span></p>
              <p className="price-trial">14-day free trial included</p>
            </div>
            <ul className="price-includes">
              {INCLUDES.map((item) => (
                <li key={item}>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <a href={APP_STORE_URL} className="btn btn-lg price-cta" rel="noopener noreferrer" target="_blank">
              Add to Shopify, Free for 14 days
            </a>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="final-cta">
        <div className="container">
          <h2 className="final-h2">Ready to charge what your craftsmanship is worth?</h2>
          <p className="final-sub">
            Join Shopify merchants selling custom engraving, personalised jewellery, monogrammed apparel,
            and hundreds of other custom products, all powered by Etch.
          </p>
          <a href={APP_STORE_URL} className="btn btn-lg btn-outline" rel="noopener noreferrer" target="_blank">
            Add to Shopify for free →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container footer-inner">
          <span className="logo footer-logo">Etch</span>
          <nav className="footer-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="mailto:support@etch.direct">Support</a>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">Shopify App Store</a>
          </nav>
          <p className="footer-copy">© 2026 Etch. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}

const css = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root {
  --navy: #0F172A;
  --gold: #C8973A;
  --gold-hover: #B07D2A;
  --text: #1E293B;
  --muted: #64748B;
  --border: #E2E8F0;
  --bg-alt: #F8FAFC;
  --white: #FFFFFF;
  --radius: 12px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

body { background: var(--white); color: var(--text); line-height: 1.6; }

.container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

/* Nav */
.nav { position: sticky; top: 0; background: rgba(15,23,42,0.97); backdrop-filter: blur(8px); z-index: 100; border-bottom: 1px solid rgba(255,255,255,0.06); }
.nav-inner { display: flex; align-items: center; justify-content: space-between; height: 60px; }
.logo { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; color: var(--white); }
.footer-logo { color: var(--muted); }

/* Buttons */
.btn { display: inline-block; font-weight: 600; border-radius: 8px; text-decoration: none; transition: background 0.15s, transform 0.1s; background: var(--gold); color: var(--white); }
.btn:hover { background: var(--gold-hover); transform: translateY(-1px); }
.btn-sm { padding: 8px 18px; font-size: 0.875rem; }
.btn-lg { padding: 14px 28px; font-size: 1rem; }
.btn-outline { background: transparent; border: 2px solid var(--gold); color: var(--gold); }
.btn-outline:hover { background: var(--gold); color: var(--white); }

/* Hero */
.hero { background: var(--navy); color: var(--white); padding: 100px 0 80px; }
.hero-inner { max-width: 780px; }
.eyebrow { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); margin-bottom: 20px; }
.hero-h1 { font-size: clamp(2.25rem, 5vw, 3.5rem); font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; margin-bottom: 24px; }
.hero-sub { font-size: 1.125rem; color: #94A3B8; line-height: 1.7; max-width: 600px; margin-bottom: 40px; }
.hero-sub strong { color: var(--white); }
.hero-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.hero-small { font-size: 0.8125rem; color: #64748B; }

/* Use cases */
.use-cases { background: var(--bg-alt); padding: 48px 0; border-bottom: 1px solid var(--border); }
.use-cases-label { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 20px; text-align: center; }
.use-cases-grid { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.use-case-chip { background: var(--white); border: 1px solid var(--border); border-radius: 100px; padding: 6px 16px; font-size: 0.875rem; color: var(--text); white-space: nowrap; }

/* How it works */
.how { padding: 96px 0; }
.section-heading { font-size: clamp(1.75rem, 3vw, 2.25rem); font-weight: 800; letter-spacing: -0.02em; text-align: center; margin-bottom: 12px; }
.section-sub { font-size: 1.0625rem; color: var(--muted); text-align: center; max-width: 560px; margin: 0 auto 56px; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px; }
.step { background: var(--bg-alt); border: 1px solid var(--border); border-radius: var(--radius); padding: 36px 32px; }
.step-num { width: 40px; height: 40px; border-radius: 50%; background: var(--gold); color: var(--white); font-weight: 700; font-size: 1rem; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
.step-h { font-size: 1.125rem; font-weight: 700; margin-bottom: 10px; }
.step-p { font-size: 0.9375rem; color: var(--muted); line-height: 1.65; }

/* Video */
.video-section { background: var(--bg-alt); padding: 96px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.video-placeholder { max-width: 800px; margin: 0 auto; aspect-ratio: 16/9; background: var(--navy); border-radius: var(--radius); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.08); }
.video-play { width: 80px; height: 80px; border-radius: 50%; background: rgba(200,151,58,0.15); border: 2px solid rgba(200,151,58,0.4); display: flex; align-items: center; justify-content: center; color: var(--gold); }
.video-coming { font-size: 0.9375rem; letter-spacing: 0.04em; }

/* Pricing */
.pricing { padding: 96px 0; }
.pricing-inner { }
.price-card { max-width: 480px; margin: 0 auto; background: var(--white); border: 2px solid var(--border); border-radius: 16px; overflow: hidden; }
.price-top { background: var(--navy); color: var(--white); padding: 40px 40px 32px; }
.price-name { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); margin-bottom: 12px; }
.price-amount { font-size: 3rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1; margin-bottom: 8px; }
.price-dollar { font-size: 1.5rem; vertical-align: top; margin-top: 8px; display: inline-block; }
.price-period { font-size: 1.125rem; font-weight: 400; color: #94A3B8; }
.price-trial { font-size: 0.9375rem; color: #94A3B8; }
.price-includes { list-style: none; padding: 32px 40px; display: flex; flex-direction: column; gap: 14px; border-bottom: 1px solid var(--border); }
.price-includes li { display: flex; align-items: center; gap: 10px; font-size: 0.9375rem; }
.price-includes svg { color: var(--gold); flex-shrink: 0; }
.price-cta { display: block; margin: 28px 40px 36px; text-align: center; }

/* Final CTA */
.final-cta { background: var(--navy); color: var(--white); padding: 96px 0; text-align: center; }
.final-h2 { font-size: clamp(1.75rem, 3vw, 2.5rem); font-weight: 800; letter-spacing: -0.02em; margin-bottom: 16px; }
.final-sub { font-size: 1.0625rem; color: #94A3B8; max-width: 580px; margin: 0 auto 40px; line-height: 1.7; }

/* Footer */
.footer { background: #080F1D; padding: 40px 0; }
.footer-inner { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
.footer-links { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
.footer-links a { font-size: 0.875rem; color: #475569; text-decoration: none; }
.footer-links a:hover { color: #94A3B8; }
.footer-copy { font-size: 0.8125rem; color: #334155; }

@media (max-width: 640px) {
  .hero { padding: 64px 0 56px; }
  .steps { grid-template-columns: 1fr; }
  .price-top, .price-includes, .price-cta { padding-left: 24px; padding-right: 24px; }
  .price-cta { margin-left: 24px; margin-right: 24px; }
}
`;
