import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Link,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <BlockStack gap="150">
      <Text as="h3" variant="headingSm">{q}</Text>
      <Text as="p" tone="subdued">{children}</Text>
    </BlockStack>
  );
}

function FaqSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">{title}</Text>
        <Divider />
        <BlockStack gap="400">{children}</BlockStack>
      </BlockStack>
    </Card>
  );
}

export default function Support() {
  return (
    <Page title="Help & Support" subtitle="How Etch works, step by step.">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Contact support</Text>
                <Text as="p" tone="subdued">
                  For billing questions, bug reports, or feature requests, email
                  us and we&apos;ll respond within one business day.
                </Text>
                <Text as="p">
                  <Link url="mailto:support@etch.direct" target="_blank">
                    support@etch.direct
                  </Link>
                </Text>
              </BlockStack>
            </Card>

            <FaqSection title="Getting started">
              <QA q="How do I turn Etch on?">
                From the Etch home page, click &quot;Activate widget&quot; — it opens your
                theme editor with the &quot;Etch Customization&quot; app embed pre-selected.
                Toggle it on and save. This is a one-time, store-wide setup: once
                enabled, Etch&apos;s widget is available on every product page
                automatically, with nothing to add manually. (There&apos;s also an
                alternative &quot;app block&quot; you can drag onto a specific
                template/section instead, if you want more manual control over
                placement — you only need one method active.)
              </QA>
              <QA q="What do the stat tiles on the home page mean?">
                &quot;Total products&quot; is your full Shopify catalog count. &quot;Customized
                Etch products (live)&quot; is how many products have published,
                customer-facing customization right now. &quot;Draft Etch products&quot;
                is how many have fields set up but not yet published — started,
                not finished.
              </QA>
              <QA q="What do the statuses on the Products page mean?">
                &quot;Not configured&quot; — Etch hasn&apos;t been set up on this product at
                all. &quot;Draft&quot; — fields have been added but aren&apos;t live yet.
                &quot;Active&quot; — the product&apos;s customization is published and visible
                to customers.
              </QA>
            </FaqSection>

            <FaqSection title="Building fields">
              <QA q="What field types can I add?">
                Short text, long text (paragraph), number, date, dropdown, button
                group, color swatches, image swatches, checkbox, file upload, and
                two display-only types (text block, static image) for instructions
                or extra product info that customers don&apos;t interact with.
              </QA>
              <QA q="What options can I set on a field?">
                Every field has a label, a &quot;Required&quot; toggle, and optional help
                text. Text fields add min/max character limits, an allowed or
                disallowed character list, a &quot;Block spaces&quot; checkbox, and a
                &quot;Count spaces toward price&quot; checkbox for per-character pricing.
                Text fields can also offer a font picker, a text color picker, and
                a font size picker, each pulling from your saved Assets or a
                built-in library. Number fields take a min/max value. Date fields
                have a &quot;Future dates only&quot; toggle. Upload fields let you restrict
                accepted file types. Choice fields (dropdown, buttons, swatches,
                image swatches) each get their own list of options, and each
                option can carry its own add-on price.
              </QA>
              <QA q="How does pricing work?">
                Each priceable field uses one of three pricing modes: <b>Per
                letter</b> (a price per character typed — e.g. $0.50/char makes
                &quot;Hello&quot; add $2.50), <b>Flat fee</b> (a fixed amount added whenever
                the field has any value), or <b>Percentage of base price</b> (a %
                of the product&apos;s price added when filled in). Per-letter pricing
                also supports optional <b>character groups</b> — charge a
                different rate for specific characters (e.g. emoji costing more
                than regular letters). Choice-type fields (dropdown, buttons,
                swatches, checkbox) are priced per option instead, set right on
                each option in the field editor.
              </QA>
              <QA q="Can I show or hide a field based on another field?">
                Yes — each field has a &quot;Visibility&quot; setting where you can add a
                condition like &quot;Show this field when [another field] is [exact
                value].&quot; You can stack multiple conditions on one field. If you
                delete a field that other fields depend on, those conditions are
                cleaned up automatically.
              </QA>
              <QA q="How do I control where the customer's text appears on my product photo?">
                In the Live Preview panel, drag, resize, and rotate the overlay
                box directly on your product image — that box controls exactly
                where a shopper&apos;s typed text (in their chosen font, color, and
                size) renders, both in your preview and on the live storefront.
                Non-text fields can get a similar static placement. A &quot;Show text
                overlay on storefront&quot; checkbox controls whether shoppers actually
                see live text rendered on the image as they type, versus the
                image staying static.
              </QA>
              <QA q="Can I collapse the Live Preview panel?">
                Yes — use the collapse control on the preview rail to shrink it to
                a thin strip and give the field editor more room, or drag the
                divider to resize it. Your preference is remembered for next time.
              </QA>
              <QA q="How do I upload an image or font?">
                Anywhere Etch asks for an image or font (option images, static
                images, custom fonts), you can either drag and drop a file
                (images or font files, up to 10 MB) or paste a URL directly —
                uploading just fills in the URL field for you, so both paths end
                up in the same place.
              </QA>
            </FaqSection>

            <FaqSection title="Publishing & activating">
              <QA q="What's the difference between a draft and Publish changes?">
                Every edit you make — adding a field, changing pricing, tweaking a
                condition — saves automatically as a <b>draft</b>. Customers never
                see a draft; they keep seeing whatever you last published. Click
                <b> &quot;Publish changes&quot;</b> (enabled once your draft differs from
                what&apos;s live) to push your edits to the storefront and checkout in
                one step. You can keep editing after publishing — those changes
                stay in draft again until you publish once more.
              </QA>
              <QA q="What's the difference between Active/Inactive and Publish changes?">
                <b>Active/Inactive</b> is the on/off switch for whether customers
                see Etch on this product at all. <b>Publish changes</b> is what
                pushes your latest edits live. The first time you activate a
                product, Etch automatically publishes your current draft too, so
                a product never goes live showing stale or empty fields.
                Deactivating hides the widget without deleting anything — your
                fields and pricing are still there when you turn it back on.
              </QA>
              <QA q="How do I preview my changes before publishing?">
                Click &quot;Preview on store&quot; on the product page — it opens your live
                storefront product page in a new tab with a short-lived, signed
                link that shows your current draft, even if the product isn&apos;t
                Active yet.
              </QA>
            </FaqSection>

            <FaqSection title="Templates & reusable assets">
              <QA q="What are templates, and how do I use one?">
                A template is a saved set of fields you can drop onto any product
                in one click. On a product with no fields yet, use &quot;Start from a
                template&quot; to apply one of Etch&apos;s built-in starters or one you&apos;ve
                saved. You can build and edit templates directly from
                Assets → Templates — name it, add fields, set their types and
                pricing — or capture a product&apos;s current fields as a new
                template using &quot;Save as template&quot; on that product&apos;s Fields tab.
              </QA>
              <QA q="What's on the Assets page?">
                Assets holds everything reusable across products: <b>Fonts</b>
                (upload a file or paste a font URL), <b>Colors</b> (named color
                sets for the text-color picker), <b>Images</b> (reusable images
                for swatches or static image fields), <b>Option sets</b> (named
                label + price lists, e.g. shirt sizes), and <b>Templates</b>
                (reusable field sets). Every tab supports creating, editing, and
                deleting — build something once and reuse it on any product.
              </QA>
            </FaqSection>

            <FaqSection title="Orders">
              <QA q="Where do I see what a customer typed or chose?">
                Open the order in Orders → click into it, and each customized
                line item shows every field&apos;s label alongside exactly what the
                customer entered or selected, plus a full price breakdown (base
                price, per-character charges by character group, and the total
                customization add-on) so you can see exactly how the price was
                calculated.
              </QA>
              <QA q="What does the 'Price mismatch' badge mean?">
                Etch compares the price it quoted the shopper during checkout
                against what was actually charged. If they don&apos;t match, the
                order gets flagged with a &quot;Price mismatch&quot; badge so you can
                investigate — this is rare, but worth checking if you see it.
                Orders placed before this check existed won&apos;t have a price
                breakdown available.
              </QA>
            </FaqSection>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Privacy policy
                </Text>
                <Text as="p" tone="subdued">
                  Our privacy policy explains what data Etch stores and how GDPR
                  requests are handled.
                </Text>
                <Text as="p">
                  <Link url="https://etch.direct/privacy" target="_blank">
                    https://etch.direct/privacy
                  </Link>
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  About Etch
                </Text>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">
                    Etch lets you charge customers based on what they type: configurable
                    per-character pricing for engraving, monogramming, or any text-based
                    customization, plus dropdowns, swatches, checkboxes, file uploads,
                    and more for any other kind of product customization.
                  </Text>
                  <Text as="p" tone="subdued">
                    Pricing rules are applied at checkout automatically via
                    Shopify&apos;s Cart Transform API. No code required on the
                    storefront.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
