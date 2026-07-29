export const loader = () =>
  new Response(
    `# Etch

Etch is a Shopify app that adds per-character and per-letter pricing to any Shopify product. Merchants set a base flat fee and a price per character typed by the customer, and Etch automatically calculates the correct total and updates the cart at checkout using Shopify's Cart Transform API. No code is required on the storefront.

## Key capabilities

- Per-character pricing: charge customers based on the number of characters they type in a custom text field
- Per-letter pricing: identical concept, useful for engraving businesses that charge by the letter
- Flat base fee: optionally add a fixed setup fee on top of the per-character rate
- Any Shopify product: works with physical products of any type — jewellery, apparel, mugs, bags, signs, etc.
- No-code setup: merchants configure pricing through the Etch admin dashboard, no theme edits or developer work needed
- Cart Transform API: price updates happen at checkout using Shopify's native Cart Transform function — fully compatible with all themes
- Customer text visible in admin: the text the customer entered appears on the order detail page in the Etch admin

## Pricing

$5/month with a 14-day free trial. Available on the Shopify App Store.

## Ideal use cases

Custom engraving, monogramming, personalized jewelry, custom t-shirts, custom mugs, custom tote bags, custom keychains, custom water bottles, custom coasters, custom stickers, custom signs, custom wristbands, custom bracelets, custom notepads, custom posters, custom patches, corporate apparel, personalized gifts, custom pet tags, custom coins, custom magnets, wedding gifts, custom keyrings, personalized bookmarks, custom boxes, custom vinyl, custom belt buckles, custom aprons, custom phone cases, custom hats, laser engraving, embroidery, print on demand.

## Links

- Homepage: https://etch.direct
- Privacy policy: https://etch.direct/privacy
- Support: support@etch.direct
- Shopify App Store: https://apps.shopify.com/etch
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
