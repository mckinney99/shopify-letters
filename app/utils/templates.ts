// Canonical field shape stored in a Template payload. Mirrors CustomizationField
// columns (minus id/shop/productId/position/timestamps) plus denormalized options.
export type TemplateField = {
  label: string;
  type: string;
  required: boolean;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
  allowSpaces: boolean;
  countSpaces: boolean;
  helpText: string | null;
  dateFutureOnly: boolean;
  fontOptions: string | null;
  textColorOptions: string | null;
  fontSizeOptions: string | null;
  fileAccept: string | null;
  options: Array<{
    label: string;
    priceDelta: number;
    swatchColor?: string;
    imageUrl?: string;
    previewImageUrl?: string;
  }>;
};

export type BuiltInTemplate = {
  id: string;
  name: string;
  description: string;
  fields: TemplateField[];
};

export const FIELD_TYPE_OPTIONS = [
  { label: "Short text", value: "text" },
  { label: "Paragraph text", value: "textarea" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Buttons", value: "buttons" },
  { label: "Color swatches", value: "swatches" },
  { label: "Image swatches", value: "image-swatches" },
  { label: "Checkbox", value: "checkbox" },
  { label: "File upload", value: "upload" },
  { label: "Text block (display only)", value: "text-block" },
  { label: "Image (display only)", value: "image-static" },
];

// Choice fields present a fixed list of options instead of free text.
export const CHOICE_TYPES = ["dropdown", "checkbox", "buttons", "swatches", "image-swatches"];
export function isChoiceType(type: string): boolean {
  return CHOICE_TYPES.includes(type);
}

export const templateFieldDefaults: Omit<TemplateField, "label" | "type" | "options"> = {
  required: false,
  minChars: null,
  maxChars: null,
  allowedChars: null,
  disallowedChars: null,
  allowSpaces: true,
  countSpaces: false,
  helpText: null,
  dateFutureOnly: false,
  fontOptions: null,
  textColorOptions: null,
  fontSizeOptions: null,
  fileAccept: null,
};

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: "builtin-monogram",
    name: "Monogram",
    description: "3-initial monogram — exactly 3 letters, required",
    fields: [
      {
        ...templateFieldDefaults,
        label: "Monogram initials",
        type: "text",
        required: true,
        minChars: 3,
        maxChars: 3,
        helpText: "Enter up to 3 initials (e.g. ABC)",
        options: [],
      },
    ],
  },
  {
    id: "builtin-gift-message",
    name: "Gift message",
    description: "Optional freeform message up to 150 characters",
    fields: [
      {
        ...templateFieldDefaults,
        label: "Gift message",
        type: "textarea",
        required: false,
        maxChars: 150,
        helpText: "Leave blank if you don't want to include a message",
        options: [],
      },
    ],
  },
  {
    id: "builtin-engraved-name",
    name: "Engraved name",
    description: "Single name field, required, up to 30 characters",
    fields: [
      {
        ...templateFieldDefaults,
        label: "Name to engrave",
        type: "text",
        required: true,
        maxChars: 30,
        options: [],
      },
    ],
  },
  {
    id: "builtin-name-and-date",
    name: "Name & date",
    description: "A name plus an optional date — good for anniversary gifts",
    fields: [
      {
        ...templateFieldDefaults,
        label: "Name",
        type: "text",
        required: true,
        maxChars: 30,
        options: [],
      },
      {
        ...templateFieldDefaults,
        label: "Date (optional)",
        type: "date",
        required: false,
        options: [],
      },
    ],
  },
  {
    id: "builtin-two-lines",
    name: "Two lines of text",
    description: "Line 1 (required) and Line 2 (optional) — classic for plaques",
    fields: [
      {
        ...templateFieldDefaults,
        label: "Line 1",
        type: "text",
        required: true,
        maxChars: 40,
        options: [],
      },
      {
        ...templateFieldDefaults,
        label: "Line 2",
        type: "text",
        required: false,
        maxChars: 40,
        options: [],
      },
    ],
  },
];
