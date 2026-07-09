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
  fileAccept: string | null;
  options: Array<{
    label: string;
    priceDelta: number;
    swatchColor?: string;
    imageUrl?: string;
  }>;
};

export type BuiltInTemplate = {
  id: string;
  name: string;
  description: string;
  fields: TemplateField[];
};

const defaults: Omit<TemplateField, "label" | "type" | "options"> = {
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
  fileAccept: null,
};

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: "builtin-monogram",
    name: "Monogram",
    description: "3-initial monogram — exactly 3 letters, required",
    fields: [
      {
        ...defaults,
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
        ...defaults,
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
        ...defaults,
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
        ...defaults,
        label: "Name",
        type: "text",
        required: true,
        maxChars: 30,
        options: [],
      },
      {
        ...defaults,
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
        ...defaults,
        label: "Line 1",
        type: "text",
        required: true,
        maxChars: 40,
        options: [],
      },
      {
        ...defaults,
        label: "Line 2",
        type: "text",
        required: false,
        maxChars: 40,
        options: [],
      },
    ],
  },
];
