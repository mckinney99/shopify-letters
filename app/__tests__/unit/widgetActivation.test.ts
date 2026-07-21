import { describe, it, expect } from "vitest";
import { isEtchEmbedEnabled } from "~/utils/themeEditor";

// SL-109: robust detection of the Etch app embed in config/settings_data.json.
const DEPLOYED_UUID = "deadbeefcafe";
const embedType = (uuid: string) => `shopify://apps/etch-staging-1/blocks/embed/${uuid}`;

describe("isEtchEmbedEnabled", () => {
  it("returns true when the embed block is present and enabled (matched by block handle)", () => {
    const settings = { current: { blocks: { abc123: { type: embedType(DEPLOYED_UUID) } } } };
    // Env UUID intentionally different from the deployed one — handle match must still work.
    expect(isEtchEmbedEnabled(settings, "some-other-local-uid")).toBe(true);
  });

  it("returns false when the embed block is present but toggled off (disabled: true)", () => {
    const settings = { current: { blocks: { abc123: { type: embedType(DEPLOYED_UUID), disabled: true } } } };
    expect(isEtchEmbedEnabled(settings, DEPLOYED_UUID)).toBe(false);
  });

  it("resolves `current` when it is a preset name string", () => {
    const settings = {
      current: "Default",
      presets: { Default: { blocks: { x1: { type: embedType(DEPLOYED_UUID) } } } },
    };
    expect(isEtchEmbedEnabled(settings, null)).toBe(true);
  });

  it("matches on the configured UUID when the block type carries no app-block path", () => {
    const settings = { current: { blocks: { k: { type: DEPLOYED_UUID } } } };
    expect(isEtchEmbedEnabled(settings, DEPLOYED_UUID)).toBe(true);
  });

  it("ignores unrelated app embeds from other apps", () => {
    const settings = {
      current: { blocks: { other: { type: "shopify://apps/some-other-app/blocks/reviews/xyz" } } },
    };
    expect(isEtchEmbedEnabled(settings, DEPLOYED_UUID)).toBe(false);
  });

  it("returns false when there are no blocks", () => {
    expect(isEtchEmbedEnabled({ current: {} }, DEPLOYED_UUID)).toBe(false);
    expect(isEtchEmbedEnabled({}, DEPLOYED_UUID)).toBe(false);
    expect(isEtchEmbedEnabled(null, DEPLOYED_UUID)).toBe(false);
  });
});
