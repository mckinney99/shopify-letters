import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  InlineStack,
  BlockStack,
  Text,
  TextField,
  Tabs,
  Divider,
  Banner,
  Box,
  Badge,
  DropZone,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ── Types ─────────────────────────────────────────────────────────────────────

type FontRow = { id: string; name: string; url: string };
type ImageRow = { id: string; name: string; url: string };
type ColorEntry = { label: string; color: string };
type ColorSetRow = { id: string; name: string; entries: (ColorEntry & { id: string; position: number })[] };
type OptionEntry = { label: string; priceDelta: string };
type OptionSetRow = { id: string; name: string; entries: (OptionEntry & { id: string; position: number })[] };
type TemplateRow = { id: string; name: string; payload: string };

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "fonts";

  const [fonts, colorSets, images, optionSets, templates] = await Promise.all([
    tab === "fonts"
      ? prisma.fontAsset.findMany({ where: { shop }, orderBy: { name: "asc" } })
      : Promise.resolve([] as FontRow[]),
    tab === "colors"
      ? prisma.colorSet.findMany({
          where: { shop },
          include: { entries: { orderBy: { position: "asc" } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as ColorSetRow[]),
    tab === "images"
      ? prisma.imageAsset.findMany({ where: { shop }, orderBy: { name: "asc" } })
      : Promise.resolve([] as ImageRow[]),
    tab === "options"
      ? prisma.optionSet.findMany({
          where: { shop },
          include: { entries: { orderBy: { position: "asc" } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as OptionSetRow[]),
    tab === "templates"
      ? prisma.template.findMany({ where: { shop }, orderBy: { name: "asc" } })
      : Promise.resolve([] as TemplateRow[]),
  ]);

  return json({ tab, shop, fonts, colorSets, images, optionSets, templates });
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("_action") as string;

  if (intent === "create_font") {
    const name = (form.get("name") as string)?.trim();
    const url = (form.get("url") as string)?.trim();
    if (!name || !url) return json({ error: "Name and URL are required." }, { status: 422 });
    await prisma.fontAsset.create({ data: { shop, name, url } });
    return json({ ok: true });
  }

  if (intent === "update_font") {
    const id = form.get("id") as string;
    const name = (form.get("name") as string)?.trim();
    const url = (form.get("url") as string)?.trim();
    if (!name || !url) return json({ error: "Name and URL are required." }, { status: 422 });
    await prisma.fontAsset.updateMany({ where: { id, shop }, data: { name, url } });
    return json({ ok: true });
  }

  if (intent === "delete_font") {
    const id = form.get("id") as string;
    await prisma.fontAsset.deleteMany({ where: { id, shop } });
    return json({ ok: true });
  }

  if (intent === "create_image") {
    const name = (form.get("name") as string)?.trim();
    const url = (form.get("url") as string)?.trim();
    if (!name || !url) return json({ error: "Name and URL are required." }, { status: 422 });
    await prisma.imageAsset.create({ data: { shop, name, url } });
    return json({ ok: true });
  }

  if (intent === "update_image") {
    const id = form.get("id") as string;
    const name = (form.get("name") as string)?.trim();
    const url = (form.get("url") as string)?.trim();
    if (!name || !url) return json({ error: "Name and URL are required." }, { status: 422 });
    await prisma.imageAsset.updateMany({ where: { id, shop }, data: { name, url } });
    return json({ ok: true });
  }

  if (intent === "delete_image") {
    const id = form.get("id") as string;
    await prisma.imageAsset.deleteMany({ where: { id, shop } });
    return json({ ok: true });
  }

  if (intent === "create_color_set") {
    const name = (form.get("name") as string)?.trim();
    const entriesRaw = form.get("entries") as string;
    if (!name) return json({ error: "Name is required." }, { status: 422 });
    let entries: ColorEntry[] = [];
    try { entries = JSON.parse(entriesRaw) as ColorEntry[]; } catch { /* ok */ }
    entries = entries.filter((e) => e.label.trim() && e.color);
    await prisma.colorSet.create({
      data: {
        shop,
        name,
        entries: { create: entries.map((e, i) => ({ label: e.label.trim(), color: e.color, position: i })) },
      },
    });
    return json({ ok: true });
  }

  if (intent === "update_color_set") {
    const id = form.get("id") as string;
    const name = (form.get("name") as string)?.trim();
    const entriesRaw = form.get("entries") as string;
    if (!name) return json({ error: "Name is required." }, { status: 422 });
    const owned = await prisma.colorSet.findFirst({ where: { id, shop }, select: { id: true } });
    if (!owned) return json({ error: "Color set not found." }, { status: 404 });
    let entries: ColorEntry[] = [];
    try { entries = JSON.parse(entriesRaw) as ColorEntry[]; } catch { /* ok */ }
    entries = entries.filter((e) => e.label.trim() && e.color);
    await prisma.colorSet.update({
      where: { id },
      data: {
        name,
        entries: {
          deleteMany: {},
          create: entries.map((e, i) => ({ label: e.label.trim(), color: e.color, position: i })),
        },
      },
    });
    return json({ ok: true });
  }

  if (intent === "delete_color_set") {
    const id = form.get("id") as string;
    await prisma.colorSet.deleteMany({ where: { id, shop } });
    return json({ ok: true });
  }

  if (intent === "create_option_set") {
    const name = (form.get("name") as string)?.trim();
    const entriesRaw = form.get("entries") as string;
    if (!name) return json({ error: "Name is required." }, { status: 422 });
    let entries: OptionEntry[] = [];
    try { entries = JSON.parse(entriesRaw) as OptionEntry[]; } catch { /* ok */ }
    entries = entries.filter((e) => e.label.trim());
    await prisma.optionSet.create({
      data: {
        shop,
        name,
        entries: {
          create: entries.map((e, i) => ({
            label: e.label.trim(),
            priceDelta: parseFloat(e.priceDelta) || 0,
            position: i,
          })),
        },
      },
    });
    return json({ ok: true });
  }

  if (intent === "update_option_set") {
    const id = form.get("id") as string;
    const name = (form.get("name") as string)?.trim();
    const entriesRaw = form.get("entries") as string;
    if (!name) return json({ error: "Name is required." }, { status: 422 });
    const owned = await prisma.optionSet.findFirst({ where: { id, shop }, select: { id: true } });
    if (!owned) return json({ error: "Option set not found." }, { status: 404 });
    let entries: OptionEntry[] = [];
    try { entries = JSON.parse(entriesRaw) as OptionEntry[]; } catch { /* ok */ }
    entries = entries.filter((e) => e.label.trim());
    await prisma.optionSet.update({
      where: { id },
      data: {
        name,
        entries: {
          deleteMany: {},
          create: entries.map((e, i) => ({
            label: e.label.trim(),
            priceDelta: parseFloat(e.priceDelta) || 0,
            position: i,
          })),
        },
      },
    });
    return json({ ok: true });
  }

  if (intent === "delete_option_set") {
    const id = form.get("id") as string;
    await prisma.optionSet.deleteMany({ where: { id, shop } });
    return json({ ok: true });
  }

  if (intent === "update_template") {
    const id = form.get("id") as string;
    const name = (form.get("name") as string)?.trim();
    if (!name) return json({ error: "Name is required." }, { status: 422 });
    await prisma.template.updateMany({ where: { id, shop }, data: { name } });
    return json({ ok: true });
  }

  if (intent === "delete_template") {
    const id = form.get("id") as string;
    await prisma.template.deleteMany({ where: { id, shop } });
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, { status: 400 });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DeleteButton({ intent, id }: { intent: string; id: string }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="_action" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Button tone="critical" variant="plain" submit loading={busy} disabled={busy}>
        Delete
      </Button>
    </fetcher.Form>
  );
}

// Simple list item row
function AssetRow({ children }: { children: React.ReactNode }) {
  return (
    <Box paddingBlock="300" borderBlockEndWidth="025" borderColor="border">
      <InlineStack align="space-between" blockAlign="center">
        {children}
      </InlineStack>
    </Box>
  );
}

// ── Fonts tab ─────────────────────────────────────────────────────────────────

function FontsTab({ fonts, shop }: { fonts: FontRow[]; shop: string }) {
  const fetcher = useFetcher<{ error?: string }>();
  const uploadFetcher = useFetcher<{ url?: string; error?: string }>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const busy = fetcher.state !== "idle";
  const uploading = uploadFetcher.state !== "idle";
  const isEditing = editingId !== null;

  useEffect(() => {
    if (uploadFetcher.data?.url) { setUrl(uploadFetcher.data.url); setUploadError(null); }
    if (uploadFetcher.data?.error) setUploadError(uploadFetcher.data.error);
  }, [uploadFetcher.data]);

  const handleDrop = useCallback(
    (_: File[], accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setUploadError("File too large (max 10 MB)"); return; }
      setUploadError(null);
      const fd = new FormData();
      fd.append("shop", shop);
      fd.append("file", file);
      // Files must go as multipart/form-data; without encType Remix urlencodes the
      // FormData and the server receives an empty file (SL-121).
      uploadFetcher.submit(fd, { method: "post", action: "/api/upload", encType: "multipart/form-data" });
    },
    [uploadFetcher, shop]
  );

  const reset = useCallback(() => {
    setEditingId(null); setName(""); setUrl(""); setUploadError(null);
  }, []);

  const startEdit = useCallback((f: FontRow) => {
    setEditingId(f.id); setName(f.name); setUrl(f.url); setUploadError(null);
  }, []);

  const submit = useCallback(() => {
    fetcher.submit(
      editingId ? { _action: "update_font", id: editingId, name, url } : { _action: "create_font", name, url },
      { method: "post" }
    );
    reset();
  }, [fetcher, editingId, name, url, reset]);

  const error = fetcher.data?.error ?? uploadError;

  return (
    <BlockStack gap="400">
      {error && <Banner tone="critical" onDismiss={() => setUploadError(null)}>{error}</Banner>}
      <Card>
        <BlockStack gap="0">
          <Box padding="400">
            <InlineStack align="space-between">
              <Text variant="headingSm" as="h3">{isEditing ? "Edit font" : "Add font"}</Text>
              {isEditing && <Button variant="plain" onClick={reset}>Cancel</Button>}
            </InlineStack>
          </Box>
          <Divider />
          <Box padding="400">
            <BlockStack gap="300">
              <TextField label="Name" value={name} onChange={setName} autoComplete="off" placeholder="e.g. Dancing Script" />
              <DropZone
                label="Upload font file"
                accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
                type="file"
                allowMultiple={false}
                onDrop={handleDrop}
                disabled={uploading}
              >
                {uploading ? (
                  <Box padding="400">
                    <Text as="p" alignment="center" tone="subdued">Uploading…</Text>
                  </Box>
                ) : (
                  <DropZone.FileUpload actionTitle="Add font file" actionHint="or drop a WOFF, WOFF2, TTF, or OTF file (max 10 MB)" />
                )}
              </DropZone>
              <TextField label="Font URL" value={url} onChange={setUrl} autoComplete="off" placeholder="https://fonts.gstatic.com/..." helpText="Upload a file above, or paste a CSS @font-face src URL or Google Fonts file URL directly." />
              <Button variant="primary" onClick={submit} loading={busy} disabled={busy || uploading || !name.trim() || !url.trim()}>
                {isEditing ? "Save changes" : "Save font"}
              </Button>
            </BlockStack>
          </Box>
        </BlockStack>
      </Card>

      <Card>
        <Box padding="400" background="bg-surface-secondary">
          <Text variant="headingMd" as="h3">Saved fonts ({fonts.length})</Text>
        </Box>
        <Divider />
        <Box paddingInline="400">
          {fonts.length === 0 ? (
            <Box paddingBlock="400">
              <Text as="p" tone="subdued">No fonts yet. Add one above.</Text>
            </Box>
          ) : fonts.map((f) => (
            <AssetRow key={f.id}>
              <BlockStack gap="050">
                <Text as="span" fontWeight="semibold">{f.name}</Text>
                <Text as="span" tone="subdued" variant="bodySm">{f.url}</Text>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center">
                <Button variant="plain" onClick={() => startEdit(f)}>Edit</Button>
                <DeleteButton intent="delete_font" id={f.id} />
              </InlineStack>
            </AssetRow>
          ))}
        </Box>
      </Card>
    </BlockStack>
  );
}

// ── Images tab ────────────────────────────────────────────────────────────────

function ImagesTab({ images, shop }: { images: ImageRow[]; shop: string }) {
  const fetcher = useFetcher<{ error?: string }>();
  const uploadFetcher = useFetcher<{ url?: string; error?: string }>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const busy = fetcher.state !== "idle";
  const uploading = uploadFetcher.state !== "idle";
  const isEditing = editingId !== null;

  useEffect(() => {
    if (uploadFetcher.data?.url) { setUrl(uploadFetcher.data.url); setUploadError(null); }
    if (uploadFetcher.data?.error) setUploadError(uploadFetcher.data.error);
  }, [uploadFetcher.data]);

  const handleDrop = useCallback(
    (_: File[], accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setUploadError("File too large (max 10 MB)"); return; }
      setUploadError(null);
      const fd = new FormData();
      fd.append("shop", shop);
      fd.append("file", file);
      // Files must go as multipart/form-data; without encType Remix urlencodes the
      // FormData and the server receives an empty file (SL-121).
      uploadFetcher.submit(fd, { method: "post", action: "/api/upload", encType: "multipart/form-data" });
    },
    [uploadFetcher, shop]
  );

  const reset = useCallback(() => {
    setEditingId(null); setName(""); setUrl(""); setUploadError(null);
  }, []);

  const startEdit = useCallback((img: ImageRow) => {
    setEditingId(img.id); setName(img.name); setUrl(img.url); setUploadError(null);
  }, []);

  const submit = useCallback(() => {
    fetcher.submit(
      editingId ? { _action: "update_image", id: editingId, name, url } : { _action: "create_image", name, url },
      { method: "post" }
    );
    reset();
  }, [fetcher, editingId, name, url, reset]);

  const error = fetcher.data?.error ?? uploadError;

  return (
    <BlockStack gap="400">
      {error && <Banner tone="critical" onDismiss={() => setUploadError(null)}>{error}</Banner>}
      <Card>
        <BlockStack gap="0">
          <Box padding="400">
            <InlineStack align="space-between">
              <Text variant="headingSm" as="h3">{isEditing ? "Edit image" : "Add image"}</Text>
              {isEditing && <Button variant="plain" onClick={reset}>Cancel</Button>}
            </InlineStack>
          </Box>
          <Divider />
          <Box padding="400">
            <BlockStack gap="300">
              <TextField label="Name" value={name} onChange={setName} autoComplete="off" placeholder="e.g. Floral pattern" />
              <DropZone
                label="Upload image"
                accept="image/*"
                type="image"
                allowMultiple={false}
                onDrop={handleDrop}
                disabled={uploading}
              >
                {uploading ? (
                  <Box padding="400">
                    <Text as="p" alignment="center" tone="subdued">Uploading…</Text>
                  </Box>
                ) : (
                  <DropZone.FileUpload actionTitle="Add image" actionHint="or drop a JPEG, PNG, WebP, or GIF (max 10 MB)" />
                )}
              </DropZone>
              <TextField label="Image URL" value={url} onChange={setUrl} autoComplete="off" placeholder="https://cdn.shopify.com/..." helpText="Upload a file above, or paste a CDN URL directly." />
              {url && (
                <img src={url} alt={name || "preview"} style={{ maxWidth: "8rem", maxHeight: "8rem", objectFit: "cover", borderRadius: "6px", border: "1px solid #ddd" }} />
              )}
              <Button variant="primary" onClick={submit} loading={busy} disabled={busy || uploading || !name.trim() || !url.trim()}>
                {isEditing ? "Save changes" : "Save image"}
              </Button>
            </BlockStack>
          </Box>
        </BlockStack>
      </Card>

      <Card>
        <Box padding="400" background="bg-surface-secondary">
          <Text variant="headingMd" as="h3">Saved images ({images.length})</Text>
        </Box>
        <Divider />
        <Box paddingInline="400">
          {images.length === 0 ? (
            <Box paddingBlock="400">
              <Text as="p" tone="subdued">No images yet. Add one above.</Text>
            </Box>
          ) : images.map((img) => (
            <AssetRow key={img.id}>
              <InlineStack gap="300" blockAlign="center">
                <img src={img.url} alt={img.name} style={{ width: "3rem", height: "3rem", objectFit: "cover", borderRadius: "4px", border: "1px solid #ddd", flexShrink: 0 }} />
                <Text as="span" fontWeight="semibold">{img.name}</Text>
              </InlineStack>
              <InlineStack gap="300" blockAlign="center">
                <Button variant="plain" onClick={() => startEdit(img)}>Edit</Button>
                <DeleteButton intent="delete_image" id={img.id} />
              </InlineStack>
            </AssetRow>
          ))}
        </Box>
      </Card>
    </BlockStack>
  );
}

// ── Colors tab ────────────────────────────────────────────────────────────────

function ColorsTab({ colorSets }: { colorSets: ColorSetRow[] }) {
  const fetcher = useFetcher<{ error?: string }>();
  // "closed" = no form; "new" = blank create form; any other string = id of the set being edited.
  const [formMode, setFormMode] = useState<"closed" | "new" | string>("closed");
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<ColorEntry[]>([{ label: "", color: "#000000" }]);
  const busy = fetcher.state !== "idle";
  const isEditing = formMode !== "closed" && formMode !== "new";

  const close = useCallback(() => {
    setFormMode("closed"); setName(""); setEntries([{ label: "", color: "#000000" }]);
  }, []);

  const startCreate = useCallback(() => {
    setFormMode("new"); setName(""); setEntries([{ label: "", color: "#000000" }]);
  }, []);

  const startEdit = useCallback((cs: ColorSetRow) => {
    setFormMode(cs.id);
    setName(cs.name);
    setEntries(cs.entries.map((e) => ({ label: e.label, color: e.color })));
  }, []);

  const submit = useCallback(() => {
    fetcher.submit(
      isEditing
        ? { _action: "update_color_set", id: formMode, name, entries: JSON.stringify(entries) }
        : { _action: "create_color_set", name, entries: JSON.stringify(entries) },
      { method: "post" }
    );
    close();
  }, [fetcher, formMode, isEditing, name, entries, close]);

  const updateEntry = (i: number, key: keyof ColorEntry, val: string) =>
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, [key]: val } : e)));

  const error = fetcher.data?.error;

  return (
    <BlockStack gap="400">
      {error && <Banner tone="critical">{error}</Banner>}

      {formMode !== "closed" ? (
        <Card>
          <BlockStack gap="0">
            <Box padding="400">
              <InlineStack align="space-between">
                <Text variant="headingSm" as="h3">{isEditing ? "Edit color set" : "New color set"}</Text>
                <Button variant="plain" onClick={close}>Cancel</Button>
              </InlineStack>
            </Box>
            <Divider />
            <Box padding="400">
              <BlockStack gap="400">
                <TextField label="Set name" value={name} onChange={setName} autoComplete="off" placeholder="e.g. Metallic tones" />
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Colors</Text>
                  {entries.map((entry, i) => (
                    <InlineStack key={i} gap="200" blockAlign="center">
                      <input
                        type="color"
                        value={entry.color}
                        onChange={(e) => updateEntry(i, "color", e.target.value)}
                        aria-label="Color"
                        style={{ width: "2.25rem", height: "2.25rem", padding: "2px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <TextField label="Label" labelHidden value={entry.label} onChange={(v) => updateEntry(i, "label", v)} autoComplete="off" placeholder="e.g. Gold" />
                      </div>
                      <Button variant="plain" tone="critical" onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))} disabled={entries.length === 1}>
                        Remove
                      </Button>
                    </InlineStack>
                  ))}
                  <Button variant="plain" onClick={() => setEntries((prev) => [...prev, { label: "", color: "#000000" }])}>
                    + Add color
                  </Button>
                </BlockStack>
                <Button variant="primary" onClick={submit} loading={busy} disabled={busy || !name.trim() || entries.every((e) => !e.label.trim())}>
                  {isEditing ? "Save changes" : "Save color set"}
                </Button>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>
      ) : (
        <Button onClick={startCreate}>New color set</Button>
      )}

      <Card>
        <Box padding="400" background="bg-surface-secondary">
          <Text variant="headingMd" as="h3">Saved color sets ({colorSets.length})</Text>
        </Box>
        <Divider />
        <Box paddingInline="400">
          {colorSets.length === 0 ? (
            <Box paddingBlock="400">
              <Text as="p" tone="subdued">No color sets yet.</Text>
            </Box>
          ) : colorSets.map((cs) => (
            <AssetRow key={cs.id}>
              <BlockStack gap="100">
                <Text as="span" fontWeight="semibold">{cs.name}</Text>
                <InlineStack gap="100" blockAlign="center">
                  {cs.entries.map((e) => (
                    <span key={e.id} title={e.label} style={{ display: "inline-block", width: "1.25rem", height: "1.25rem", borderRadius: "50%", background: e.color, border: "1px solid #ddd" }} />
                  ))}
                  <Text as="span" tone="subdued" variant="bodySm">{cs.entries.length} color{cs.entries.length !== 1 ? "s" : ""}</Text>
                </InlineStack>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center">
                <Button variant="plain" onClick={() => startEdit(cs)}>Edit</Button>
                <DeleteButton intent="delete_color_set" id={cs.id} />
              </InlineStack>
            </AssetRow>
          ))}
        </Box>
      </Card>
    </BlockStack>
  );
}

// ── Option sets tab ───────────────────────────────────────────────────────────

function OptionSetsTab({ optionSets }: { optionSets: OptionSetRow[] }) {
  const fetcher = useFetcher<{ error?: string }>();
  // "closed" = no form; "new" = blank create form; any other string = id of the set being edited.
  const [formMode, setFormMode] = useState<"closed" | "new" | string>("closed");
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<OptionEntry[]>([{ label: "", priceDelta: "" }]);
  const busy = fetcher.state !== "idle";
  const isEditing = formMode !== "closed" && formMode !== "new";

  const close = useCallback(() => {
    setFormMode("closed"); setName(""); setEntries([{ label: "", priceDelta: "" }]);
  }, []);

  const startCreate = useCallback(() => {
    setFormMode("new"); setName(""); setEntries([{ label: "", priceDelta: "" }]);
  }, []);

  const startEdit = useCallback((os: OptionSetRow) => {
    setFormMode(os.id);
    setName(os.name);
    setEntries(os.entries.map((e) => ({ label: e.label, priceDelta: String(e.priceDelta) })));
  }, []);

  const submit = useCallback(() => {
    fetcher.submit(
      isEditing
        ? { _action: "update_option_set", id: formMode, name, entries: JSON.stringify(entries) }
        : { _action: "create_option_set", name, entries: JSON.stringify(entries) },
      { method: "post" }
    );
    close();
  }, [fetcher, formMode, isEditing, name, entries, close]);

  const updateEntry = (i: number, key: keyof OptionEntry, val: string) =>
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, [key]: val } : e)));

  const error = fetcher.data?.error;

  return (
    <BlockStack gap="400">
      {error && <Banner tone="critical">{error}</Banner>}

      {formMode !== "closed" ? (
        <Card>
          <BlockStack gap="0">
            <Box padding="400">
              <InlineStack align="space-between">
                <Text variant="headingSm" as="h3">{isEditing ? "Edit option set" : "New option set"}</Text>
                <Button variant="plain" onClick={close}>Cancel</Button>
              </InlineStack>
            </Box>
            <Divider />
            <Box padding="400">
              <BlockStack gap="400">
                <TextField label="Set name" value={name} onChange={setName} autoComplete="off" placeholder="e.g. Shirt sizes" />
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Options</Text>
                  {entries.map((entry, i) => (
                    <InlineStack key={i} gap="200" blockAlign="center">
                      <div style={{ flex: 2 }}>
                        <TextField label="Label" labelHidden value={entry.label} onChange={(v) => updateEntry(i, "label", v)} autoComplete="off" placeholder="e.g. Small" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <TextField label="Add-on price" labelHidden value={entry.priceDelta} onChange={(v) => updateEntry(i, "priceDelta", v)} autoComplete="off" placeholder="0.00" prefix="$" />
                      </div>
                      <Button variant="plain" tone="critical" onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))} disabled={entries.length === 1}>
                        Remove
                      </Button>
                    </InlineStack>
                  ))}
                  <Button variant="plain" onClick={() => setEntries((prev) => [...prev, { label: "", priceDelta: "" }])}>
                    + Add option
                  </Button>
                </BlockStack>
                <Button variant="primary" onClick={submit} loading={busy} disabled={busy || !name.trim() || entries.every((e) => !e.label.trim())}>
                  {isEditing ? "Save changes" : "Save option set"}
                </Button>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>
      ) : (
        <Button onClick={startCreate}>New option set</Button>
      )}

      <Card>
        <Box padding="400" background="bg-surface-secondary">
          <Text variant="headingMd" as="h3">Saved option sets ({optionSets.length})</Text>
        </Box>
        <Divider />
        <Box paddingInline="400">
          {optionSets.length === 0 ? (
            <Box paddingBlock="400">
              <Text as="p" tone="subdued">No option sets yet.</Text>
            </Box>
          ) : optionSets.map((os) => (
            <AssetRow key={os.id}>
              <BlockStack gap="100">
                <Text as="span" fontWeight="semibold">{os.name}</Text>
                <Text as="span" tone="subdued" variant="bodySm">
                  {os.entries.map((e) => e.label).join(", ")}
                </Text>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center">
                <Badge>{`${os.entries.length} option${os.entries.length !== 1 ? "s" : ""}`}</Badge>
                <Button variant="plain" onClick={() => startEdit(os)}>Edit</Button>
                <DeleteButton intent="delete_option_set" id={os.id} />
              </InlineStack>
            </AssetRow>
          ))}
        </Box>
      </Card>
    </BlockStack>
  );
}

// ── Templates tab ─────────────────────────────────────────────────────────────

function TemplateRowDetail({ template }: { template: TemplateRow }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [name, setName] = useState(template.name);
  const busy = fetcher.state !== "idle";

  const fields = (() => {
    try {
      return JSON.parse(template.payload) as Array<{ label: string; type?: string }>;
    } catch {
      return [];
    }
  })();

  const submit = useCallback(() => {
    fetcher.submit({ _action: "update_template", id: template.id, name }, { method: "post" });
  }, [fetcher, template.id, name]);

  return (
    <Box paddingBlock="300" paddingInlineStart="200">
      <BlockStack gap="300">
        {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
        <TextField label="Name" value={name} onChange={setName} autoComplete="off" />
        <Button variant="primary" size="slim" onClick={submit} loading={busy} disabled={busy || !name.trim() || name.trim() === template.name}>
          Save changes
        </Button>
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" fontWeight="semibold">Fields ({fields.length})</Text>
          {fields.map((f, i) => (
            <InlineStack key={i} gap="200">
              <Text as="span" variant="bodySm">{f.label}</Text>
              {f.type && <Badge>{f.type}</Badge>}
            </InlineStack>
          ))}
        </BlockStack>
        <Text as="p" tone="subdued" variant="bodySm">
          To change which fields are in this template, save an updated version from the product Fields tab ("Save as template").
        </Text>
      </BlockStack>
    </Box>
  );
}

function TemplatesTab({ templates }: { templates: TemplateRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text variant="headingMd" as="h3">Saved templates ({templates.length})</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Templates are saved from the product Fields tab ("Save as template"). Apply them from any product's empty-field state.
        </Text>
      </BlockStack>
      <Card>
        <Box paddingInline="400" paddingBlockStart="400">
          {templates.length === 0 ? (
            <Box paddingBlock="400">
              <Text as="p" tone="subdued">No saved templates yet. Go to a product's Fields tab and click "Save as template".</Text>
            </Box>
          ) : templates.map((t) => {
            let fieldCount = 0;
            let fieldLabels = "";
            try {
              const fields = JSON.parse(t.payload) as Array<{ label: string }>;
              fieldCount = fields.length;
              fieldLabels = fields.map((f) => f.label).join(", ");
            } catch { /* ok */ }
            const expanded = expandedId === t.id;
            return (
              <Box key={t.id}>
                <AssetRow>
                  <Button
                    variant="plain"
                    onClick={() => setExpandedId(expanded ? null : t.id)}
                    disclosure={expanded ? "up" : "down"}
                  >
                    {t.name}
                  </Button>
                  <InlineStack gap="300" blockAlign="center">
                    <Text as="span" tone="subdued" variant="bodySm">{fieldCount} field{fieldCount !== 1 ? "s" : ""}: {fieldLabels}</Text>
                    <DeleteButton intent="delete_template" id={t.id} />
                  </InlineStack>
                </AssetRow>
                {expanded && <TemplateRowDetail template={t} />}
              </Box>
            );
          })}
        </Box>
      </Card>
    </BlockStack>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "fonts", content: "Fonts" },
  { id: "colors", content: "Colors" },
  { id: "images", content: "Images" },
  { id: "options", content: "Option sets" },
  { id: "templates", content: "Templates" },
];

export default function AssetsPage() {
  const { tab, shop, fonts, colorSets, images, optionSets, templates } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  const selectedIndex = TABS.findIndex((t) => t.id === tab);
  const activeIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const handleTabChange = useCallback(
    (i: number) => setSearchParams({ tab: TABS[i].id }, { replace: true }),
    [setSearchParams]
  );

  return (
    <Page title="Assets" subtitle="Reusable fonts, colors, images, option sets, and templates — copy into any field.">
      <Tabs tabs={TABS} selected={activeIndex} onSelect={handleTabChange}>
        <Box paddingBlockStart="400">
          {activeIndex === 0 && <FontsTab fonts={fonts as FontRow[]} shop={shop} />}
          {activeIndex === 1 && <ColorsTab colorSets={colorSets as ColorSetRow[]} />}
          {activeIndex === 2 && <ImagesTab images={images as ImageRow[]} shop={shop} />}
          {activeIndex === 3 && <OptionSetsTab optionSets={optionSets as OptionSetRow[]} />}
          {activeIndex === 4 && <TemplatesTab templates={templates as TemplateRow[]} />}
        </Box>
      </Tabs>
    </Page>
  );
}
