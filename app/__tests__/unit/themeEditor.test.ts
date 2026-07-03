import { describe, it, expect } from "vitest";
import { buildThemeEditorDeepLink } from "~/utils/themeEditor";

describe("buildThemeEditorDeepLink", () => {
  const shop = "etch-dev.myshopify.com";

  it("pre-adds the app block when the extension UUID is provided", () => {
    const url = buildThemeEditorDeepLink({ shop, extensionUuid: "abc123" });
    expect(url).toBe(
      "https://etch-dev.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=abc123/customization&target=mainSection"
    );
  });

  it("keeps the slash between UUID and block handle unencoded", () => {
    const url = buildThemeEditorDeepLink({ shop, extensionUuid: "abc123" });
    expect(url).toContain("addAppBlockId=abc123/customization");
    expect(url).not.toContain("%2F");
  });

  it("falls back to the product-template editor link when no UUID is set", () => {
    const url = buildThemeEditorDeepLink({ shop, extensionUuid: undefined });
    expect(url).toBe(
      "https://etch-dev.myshopify.com/admin/themes/current/editor?template=product"
    );
  });

  it("honors custom block handle, template, and target", () => {
    const url = buildThemeEditorDeepLink({
      shop,
      extensionUuid: "uuid-1",
      blockHandle: "banner",
      template: "index",
      target: "sectionGroup",
    });
    expect(url).toBe(
      "https://etch-dev.myshopify.com/admin/themes/current/editor?template=index&addAppBlockId=uuid-1/banner&target=sectionGroup"
    );
  });

  it("returns null when shop is missing", () => {
    expect(buildThemeEditorDeepLink({ shop: "", extensionUuid: "abc" })).toBeNull();
  });
});
