export type CharGroup = {
  label: string;
  characters: string;
};

export type FieldRules = {
  minChars?: number | null;
  maxChars?: number | null;
  allowedChars?: string | null;
  disallowedChars?: string | null;
  allowSpaces?: boolean | null;
  charGroups?: CharGroup[];
};

export type NormalizeResult = {
  normalizedText: string;
  charCount: number;
  groupCounts: Record<string, number>;
  errors: string[];
};

export function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

// Spread gives Unicode codepoint count (correct for emoji/multi-unit chars).
export function countBillableCharacters(text: string): number {
  return [...normalizeText(text)].length;
}

export function normalizeInput(rawInput: string, rules: FieldRules): NormalizeResult {
  const normalizedText = normalizeText(rawInput);
  const chars = [...normalizedText]; // codepoint array — correct for emoji
  const charCount = chars.length;
  const errors: string[] = [];

  if (rules.allowSpaces === false && chars.some((c) => c === " ")) {
    errors.push("Spaces are not allowed.");
  }
  if (rules.allowedChars != null && rules.allowedChars.length > 0) {
    const allowed = new Set([...rules.allowedChars]);
    const bad = [...new Set(chars.filter((c) => c !== " " && !allowed.has(c)))];
    if (bad.length > 0) {
      errors.push(`${bad.join(", ")} character${bad.length === 1 ? "" : "s"} not allowed`);
    }
  } else if (rules.disallowedChars != null && rules.disallowedChars.length > 0) {
    const disallowed = new Set([...rules.disallowedChars]);
    const bad = [...new Set(chars.filter((c) => disallowed.has(c)))];
    if (bad.length > 0) {
      errors.push(`${bad.join(", ")} character${bad.length === 1 ? "" : "s"} not allowed`);
    }
  }

  if (rules.minChars != null && charCount < rules.minChars) {
    errors.push(
      `Must be at least ${rules.minChars} character${rules.minChars === 1 ? "" : "s"}.`
    );
  }
  if (rules.maxChars != null && charCount > rules.maxChars) {
    errors.push(
      `Must be at most ${rules.maxChars} character${rules.maxChars === 1 ? "" : "s"}.`
    );
  }

  const groupCounts: Record<string, number> = {};
  for (const group of rules.charGroups ?? []) {
    const groupSet = new Set([...group.characters]);
    groupCounts[group.label] = chars.filter((c) => groupSet.has(c)).length;
  }

  return { normalizedText, charCount, groupCounts, errors };
}
