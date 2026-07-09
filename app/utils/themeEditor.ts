// Builds a Shopify theme editor "deep link" that opens the merchant's current
// theme on a given template. When the theme app extension's UUID is available,
// the link also pre-adds a specific app block to the template so the merchant
// can enable the Etch widget in one click instead of hunting for it manually.
// See SL-70.
//
// Deep-link format (Shopify docs — "App block deep links"):
//   https://{shop}/admin/themes/current/editor?template=product&addAppBlockId={uuid}/{handle}&target=mainSection
//
// The UUID is the *deployed* theme app extension's registration UUID (from the
// Partner Dashboard / `shopify app deploy`), not the local `uid` in the
// extension TOML. It's supplied via the SHOPIFY_THEME_APP_EXTENSION_UUID env
// var; when unset, we still return a valid link that opens the theme editor on
// the product template (the block is then added via the manual instructions).

export function buildThemeEditorDeepLink(opts: {
  shop: string;
  extensionUuid?: string | null;
  blockHandle?: string;
  template?: string;
  target?: string;
}): string | null {
  const {
    shop,
    extensionUuid,
    blockHandle = "customization",
    template = "product",
    target = "mainSection",
  } = opts;

  if (!shop) return null;

  const base = `https://${shop}/admin/themes/current/editor?template=${template}`;
  if (!extensionUuid) return base;

  // uuid and handle are known-safe (hex + slug); keep the "/" literal — Shopify
  // requires an unencoded slash between the extension UUID and the block handle.
  return `${base}&addAppBlockId=${extensionUuid}/${blockHandle}&target=${target}`;
}

// Builds the theme editor deep link that opens the "App embeds" panel and
// pre-selects our embed block. The merchant just flips one toggle — no hunting
// for a section or adding a block manually.
//
// Deep-link format (Shopify docs — "App embed deep links"):
//   https://{shop}/admin/themes/current/editor?context=apps&activateAppId={uuid}/{handle}
export function buildAppEmbedDeepLink(opts: {
  shop: string;
  extensionUuid?: string | null;
  embedHandle?: string;
}): string | null {
  const { shop, extensionUuid, embedHandle = "embed" } = opts;
  if (!shop) return null;
  const base = `https://${shop}/admin/themes/current/editor?context=apps`;
  if (!extensionUuid) return base;
  return `${base}&activateAppId=${extensionUuid}/${embedHandle}`;
}
