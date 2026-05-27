export function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function countBillableCharacters(text: string): number {
  return normalizeText(text).length;
}
