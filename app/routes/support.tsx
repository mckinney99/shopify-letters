import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Support — Etch" },
  {
    name: "description",
    content:
      "How-to guides, FAQs, and contact info for the Etch per-character pricing app for Shopify.",
  },
  { tagName: "link", rel: "canonical", href: "https://etch.direct/support" },
];

const HOW_TOS = [
  {
    id: "add-widget",
    num: "1",
    heading: "Add the Etch widget to your storefront",
    steps: [
      "In your Shopify admin, go to Online Store → Themes → Customize.",
      "Navigate to a product page template.",
      'Click "Add section" or "Add block" (depending on your theme) and search for "Etch Customization".',
      "Add the block and click Save.",
    ],
    note: "The widget only appears on product pages where you have published an Etch configuration. Products without a configuration are unaffected.",
  },
  {
    id: "create-field",
    num: "2",
    heading: "Create a form field for a product",
    steps: [
      "In your Shopify admin, go to Apps → Etch.",
      "Find the product you want to configure and click it.",
      'Click "Add field" to create a new text input.',
      'Give it a label your customers will see (e.g. "Engraving text" or "Monogram initials").',
      "Set any character restrictions — minimum/maximum characters, allowed or disallowed characters, and whether spaces count.",
      "Click Save.",
    ],
    note: "You can add as many fields as you need. Each field has its own label and character rules, and can optionally have its own pricing.",
  },
  {
    id: "add-pricing",
    num: "3",
    heading: "Add pricing to a form field",
    steps: [
      "On the product configuration page, click the Pricing tab.",
      "Set a per-character price — this is the amount charged for each character the customer types.",
      'Optionally add a base fee charged regardless of length (e.g. a flat "setup" charge).',
      "When finished, toggle the product to Published so the widget and pricing go live.",
    ],
    note: "Pricing is optional. If you leave the pricing fields empty, Etch still collects the customer's text and saves it to the order — you just won't charge extra for it. This is useful for gift messages, special instructions, or any text you want to gather without a surcharge.",
  },
  {
    id: "add-characters",
    num: "4",
    heading: "Add character groups",
    steps: [
      'On the Pricing tab, click "Add character group".',
      'Give the group a label (e.g. "Symbols" or "Numbers").',
      "Type in the characters that belong to this group.",
      "Set the price per character for this group.",
      "Click Save.",
    ],
    note: "Character groups let you charge different prices for different characters. For example: $2.00 per standard letter, $3.50 per symbol. Characters that don't fall into any group use the default per-character price you set above.",
  },
];

const FAQS = [
  {
    q: "Does the Etch widget work with my Shopify theme?",
    a: "Yes. Etch uses Shopify's Theme App Extension system, which is compatible with all Online Store 2.0 themes — the large majority of themes available in the Shopify Theme Store. If you're on a legacy theme, contact us and we'll help.",
  },
  {
    q: "Is the price enforced at checkout, or can customers change it?",
    a: "It's enforced. Etch uses a Shopify Cart Transform function to apply the correct price server-side before the order is finalised. Customers cannot modify or bypass it from the browser.",
  },
  {
    q: "Can I add multiple text fields to one product?",
    a: "Yes. Add as many fields as you need — each with its own label, character rules, and optional pricing. For example, one field for a first name and another for a second line.",
  },
  {
    q: "Do I need a developer or code changes to use Etch?",
    a: "No. Everything is configured through the Etch admin in your Shopify dashboard. Adding the widget to your storefront takes about 30 seconds via the Theme Customizer — no code, no file edits, no developer needed.",
  },
  {
    q: "Can I charge different prices for different characters?",
    a: "Yes, using character groups. For example, you can charge $2.00 per standard letter and $3.50 per symbol or number. Characters not in any group fall back to your default per-character price.",
  },
  {
    q: "Does Etch work with product variants?",
    a: "Yes. When a customer switches variants (e.g. different ring sizes or materials at different base prices), the live price estimate in the widget updates automatically. The per-character surcharge is added on top of whichever variant price is selected.",
  },
  {
    q: "What happens if a customer leaves a required field empty?",
    a: "The widget validates each field before the customer can add the item to their cart. If a required field is empty or violates a character rule, an inline error is shown and the add-to-cart action is blocked until it's corrected.",
  },
  {
    q: "Can I use Etch just to collect text without charging extra?",
    a: "Absolutely. Pricing rules are optional. You can create a field with no pricing at all — Etch will still display the input on your product page and save the customer's text to the order. This works great for gift messages, special instructions, or any personalisation that doesn't affect the price.",
  },
  {
    q: "Where do I see what the customer typed after an order is placed?",
    a: "In your Shopify admin, go to Orders → click the order → scroll down to the line items. The customer's text appears as a line item property directly beneath the product name.",
  },
];

const APP_STORE_URL = "https://apps.shopify.com/etch";

export default function SupportPage() {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* ── Nav ── */}
      <header className="nav">
        <div className="nav-inner container">
          <a href="/" className="logo">Etch</a>
          <a href={APP_STORE_URL} className="btn btn-sm" rel="noopener noreferrer" target="_blank">
            Add to Shopify
          </a>
        </div>
      </header>

      {/* ── Page hero ── */}
      <section className="support-hero">
        <div className="container">
          <p className="eyebrow">Help &amp; Support</p>
          <h1 className="support-h1">How to use Etch</h1>
          <p className="support-sub">
            Step-by-step guides, FAQs, and a direct line to our team if you need it.
          </p>
        </div>
      </section>

      {/* ── How-to ── */}
      <section className="howto-section">
        <div className="container">
          <h2 className="section-heading">Getting started</h2>
          <p className="section-sub">Four steps from install to live per-character pricing on your storefront.</p>

          <div className="howto-list">
            {HOW_TOS.map((item) => (
              <div key={item.id} className="howto-card" id={item.id}>
                <div className="howto-header">
                  <div className="step-num">{item.num}</div>
                  <h3 className="howto-title">{item.heading}</h3>
                </div>
                <ol className="howto-steps">
                  {item.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {item.note && <p className="howto-note">{item.note}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Finding customer input ── */}
      <section className="orders-section">
        <div className="container orders-inner">
          <div className="orders-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="13" y2="16" />
            </svg>
          </div>
          <div>
            <h2 className="orders-heading">Finding customer text in orders</h2>
            <p className="orders-body">
              After a customer places an order, what they typed is saved directly to the order as a line item property. To view it: go to <strong>Shopify admin → Orders</strong>, click the order, then scroll to the line items. The customer's text appears beneath the product name — no extra steps, no export needed.
            </p>
          </div>
        </div>
      </section>

      {/* ── No-price use case ── */}
      <section className="noprice-section">
        <div className="container">
          <div className="noprice-card">
            <div className="noprice-badge">Did you know?</div>
            <h2 className="noprice-heading">You don't have to charge for every field</h2>
            <p className="noprice-body">
              Pricing rules are completely optional in Etch. If you want to collect a gift message, special instructions, or a personalisation note without adding any cost, just leave the pricing fields empty. Etch will still display the input on your product page and save what the customer types to the order — perfect for any text you need without a surcharge.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="faq-section">
        <div className="container">
          <h2 className="section-heading">Frequently asked questions</h2>
          <p className="section-sub">Can't find what you're looking for? <a href="mailto:support@etch.direct" className="inline-link">Email us</a> and we'll get back to you.</p>
          <div className="faq-list">
            {FAQS.map((item, i) => (
              <div key={i} className="faq-item">
                <h3 className="faq-q">{item.q}</h3>
                <p className="faq-a">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact CTA ── */}
      <section className="contact-section">
        <div className="container contact-inner">
          <div className="contact-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <h2 className="contact-heading">Still need help?</h2>
            <p className="contact-body">
              Send us a message and we'll get back to you as soon as possible.
            </p>
            <a href="mailto:support@etch.direct" className="btn btn-lg contact-btn">
              Email support@etch.direct
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container footer-inner">
          <span className="logo footer-logo">Etch</span>
          <nav className="footer-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/support">Support</a>
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
.logo { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; color: var(--white); text-decoration: none; }
.footer-logo { color: var(--muted); }

/* Buttons */
.btn { display: inline-block; font-weight: 600; border-radius: 8px; text-decoration: none; transition: background 0.15s, transform 0.1s; background: var(--gold); color: var(--white); }
.btn:hover { background: var(--gold-hover); transform: translateY(-1px); }
.btn-sm { padding: 8px 18px; font-size: 0.875rem; }
.btn-lg { padding: 14px 28px; font-size: 1rem; }

/* Inline link */
.inline-link { color: var(--gold); text-decoration: none; font-weight: 600; }
.inline-link:hover { text-decoration: underline; }

/* Support hero */
.support-hero { background: var(--navy); color: var(--white); padding: 80px 0 64px; }
.eyebrow { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); margin-bottom: 16px; }
.support-h1 { font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; margin-bottom: 16px; }
.support-sub { font-size: 1.0625rem; color: #94A3B8; max-width: 520px; }

/* Section headings */
.section-heading { font-size: clamp(1.625rem, 3vw, 2.125rem); font-weight: 800; letter-spacing: -0.02em; text-align: center; margin-bottom: 12px; }
.section-sub { font-size: 1.0625rem; color: var(--muted); text-align: center; max-width: 560px; margin: 0 auto 48px; }

/* How-to */
.howto-section { padding: 96px 0; }
.howto-list { display: flex; flex-direction: column; gap: 24px; }
.howto-card { background: var(--bg-alt); border: 1px solid var(--border); border-radius: var(--radius); padding: 36px 40px; }
.howto-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.step-num { width: 40px; height: 40px; border-radius: 50%; background: var(--gold); color: var(--white); font-weight: 700; font-size: 1rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.howto-title { font-size: 1.1875rem; font-weight: 700; }
.howto-steps { padding-left: 20px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.howto-steps li { font-size: 0.9375rem; color: var(--text); line-height: 1.6; }
.howto-note { font-size: 0.875rem; color: var(--muted); line-height: 1.65; border-left: 3px solid var(--gold); padding-left: 14px; margin-top: 4px; }

/* Orders section */
.orders-section { background: var(--navy); color: var(--white); padding: 72px 0; }
.orders-inner { display: flex; align-items: flex-start; gap: 28px; }
.orders-icon { color: var(--gold); flex-shrink: 0; margin-top: 4px; }
.orders-heading { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 12px; }
.orders-body { font-size: 1rem; color: #94A3B8; line-height: 1.7; max-width: 680px; }
.orders-body strong { color: var(--white); }

/* No-price section */
.noprice-section { background: var(--bg-alt); padding: 72px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.noprice-card { max-width: 760px; margin: 0 auto; }
.noprice-badge { display: inline-block; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: var(--gold); color: var(--white); border-radius: 100px; padding: 4px 12px; margin-bottom: 16px; }
.noprice-heading { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 12px; }
.noprice-body { font-size: 1rem; color: var(--muted); line-height: 1.75; }

/* FAQ */
.faq-section { padding: 96px 0; }
.faq-list { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; }
.faq-item { padding: 28px 0; border-bottom: 1px solid var(--border); }
.faq-item:first-child { border-top: 1px solid var(--border); }
.faq-q { font-size: 1rem; font-weight: 700; margin-bottom: 8px; }
.faq-a { font-size: 0.9375rem; color: var(--muted); line-height: 1.7; }

/* Contact */
.contact-section { background: var(--navy); color: var(--white); padding: 80px 0; }
.contact-inner { display: flex; align-items: flex-start; gap: 28px; }
.contact-icon { color: var(--gold); flex-shrink: 0; margin-top: 4px; }
.contact-heading { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 10px; }
.contact-body { font-size: 1.0625rem; color: #94A3B8; margin-bottom: 28px; }
.contact-btn { background: var(--gold); }
.contact-btn:hover { background: var(--gold-hover); }

/* Footer */
.footer { background: #080F1D; padding: 40px 0; }
.footer-inner { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
.footer-links { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
.footer-links a { font-size: 0.875rem; color: #475569; text-decoration: none; }
.footer-links a:hover { color: #94A3B8; }
.footer-copy { font-size: 0.8125rem; color: #334155; }

@media (max-width: 640px) {
  .support-hero { padding: 56px 0 40px; }
  .howto-section { padding: 64px 0; }
  .howto-card { padding: 24px 20px; }
  .orders-inner, .contact-inner { flex-direction: column; gap: 16px; }
  .faq-section { padding: 64px 0; }
}
`;
