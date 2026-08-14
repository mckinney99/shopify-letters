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

// The Etch theme app extension's app-embed block handle (extensions/etch-customization/blocks/embed.liquid).
export const ETCH_EMBED_BLOCK_HANDLE = "embed";

// Decides whether the Etch app embed is *enabled* on the merchant's live theme,
// given the parsed config/settings_data.json (SL-109).
//
// App embeds live in the theme's `current.blocks` map, keyed by block id, each
// with a `type` like `shopify://apps/{app}/blocks/{block}/{uuid}` and an optional
// `disabled: true` when the merchant has toggled the embed off.
//
// This is robust to the cases that made the old raw-UUID substring match unreliable:
//   - `current` can be a preset *name* (string), not an object → resolve via `presets`.
//   - The env UUID (SHOPIFY_THEME_APP_EXTENSION_UUID) is the local TOML `uid`, which
//     often differs from the *deployed* UUID that actually appears in the theme. So we
//     primarily match on the stable app-embed block handle (`/blocks/embed/`), and fall
//     back to the configured UUID when it happens to match.
//   - A present-but-off embed (`disabled: true`) counts as NOT activated.
export function isEtchEmbedEnabled(settings: unknown, extensionUuid?: string | null): boolean {
  if (!settings || typeof settings !== "object") return false;
  const root = settings as Record<string, any>;
  let current = root.current;
  if (typeof current === "string") current = root.presets?.[current];
  const blocks = current?.blocks;
  if (!blocks || typeof blocks !== "object") return false;

  const uuid = (extensionUuid || "").toLowerCase();
  for (const [key, val] of Object.entries<any>(blocks)) {
    const type = String(val?.type ?? "");
    const hay = `${key} ${type}`.toLowerCase();
    const isAppEmbedBlock =
      hay.includes("shopify://apps/") && hay.includes(`/blocks/${ETCH_EMBED_BLOCK_HANDLE}/`);
    const refsOurEmbed = isAppEmbedBlock || (!!uuid && hay.includes(uuid));
    if (!refsOurEmbed) continue;
    if (val?.disabled === true) continue; // present but toggled off
    return true;
  }
  return false;
}
