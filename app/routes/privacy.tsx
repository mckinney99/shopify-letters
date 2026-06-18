import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Etch" },
];

export default function Privacy() {
  return (
    <main
      style={{
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        maxWidth: 720,
        margin: "48px auto",
        padding: "0 24px 80px",
        color: "#1a1a1a",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
        Privacy Policy
      </h1>
      <p style={{ color: "#6b7280", marginTop: 0, marginBottom: 40 }}>
        Etch &mdash; Last updated June 2026
      </p>

      <section>
        <h2>About Etch</h2>
        <p>
          Etch is a Shopify app that lets merchants configure input-based pricing
          for customizable products (for example, per-character engraving fees).
          This policy explains what data Etch collects, why, and how it is
          handled.
        </p>
      </section>

      <section>
        <h2>Data We Store</h2>
        <p>
          Etch stores only the configuration data merchants provide through the
          app. <strong>We do not store any customer personal information</strong>{" "}
          (names, email addresses, payment details, or order content).
        </p>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            marginTop: 16,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>
                Data type
              </th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>
                What it contains
              </th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>
                Why it is stored
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                "Session",
                "Shop domain and OAuth access token",
                "Required to make authenticated API calls to your Shopify store",
              ],
              [
                "Product configuration",
                "Shopify product ID and whether Etch pricing is enabled",
                "Tracks which products have input-based pricing active",
              ],
              [
                "Customization field",
                "Field label, type, and validation rules set by the merchant",
                'Defines what shoppers see at the product page (e.g. "Engraving text")',
              ],
              [
                "Pricing rule",
                "Base price, per-character price, and field association",
                "Calculates order line-item adjustments at checkout",
              ],
              [
                "Character price group",
                "Character set and per-character override price",
                "Allows different pricing for character subsets (e.g. uppercase vs. lowercase)",
              ],
            ].map(([type, contents, reason]) => (
              <tr
                key={type}
                style={{ borderBottom: "1px solid #f3f4f6" }}
              >
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                  {type}
                </td>
                <td style={{ padding: "10px 12px", color: "#374151" }}>
                  {contents}
                </td>
                <td style={{ padding: "10px 12px", color: "#374151" }}>
                  {reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Data Retention</h2>
        <p>
          Merchant configuration data is retained for as long as the Etch app is
          installed on the store. When the app is uninstalled, all associated
          data is deleted automatically in response to the{" "}
          <code>SHOP_REDACT</code> webhook that Shopify sends.
        </p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>GDPR and Data Subject Requests</h2>
        <p>
          Etch complies with Shopify&apos;s mandatory GDPR webhooks:
        </p>
        <ul>
          <li>
            <strong>Customer data request</strong> — Because Etch stores no
            customer personal information, there is no customer data to provide.
            We acknowledge the request and confirm no PII is held.
          </li>
          <li>
            <strong>Customer data erasure</strong> — Same as above: Etch holds
            no customer PII, so there is nothing to erase on a per-customer
            basis.
          </li>
          <li>
            <strong>Shop data erasure</strong> — When a merchant uninstalls the
            app, all merchant configuration records (sessions, product configs,
            customization fields, pricing rules, and character price groups) are
            permanently deleted.
          </li>
        </ul>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Third-Party Sharing</h2>
        <p>
          Etch does not sell, rent, or share merchant data with any third
          parties. Data is stored in a cloud database hosted on AWS (us-east-1)
          and is not used for any purpose other than operating the app.
        </p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Contact</h2>
        <p>
          Questions about this policy or requests for data deletion can be sent
          to{" "}
          <a href="mailto:support@etch.direct" style={{ color: "#2563eb" }}>
            support@etch.direct
          </a>
          .
        </p>
      </section>
    </main>
  );
}
