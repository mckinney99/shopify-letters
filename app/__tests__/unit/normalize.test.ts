import { describe, it, expect } from "vitest";
import {
  normalizeText,
  countBillableCharacters,
  normalizeInput,
} from "~/utils/normalize";

describe("normalizeText", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("collapses internal whitespace to a single space", () => {
    expect(normalizeText("hello   world")).toBe("hello world");
  });

  it("handles an already-clean string", () => {
    expect(normalizeText("hello")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("countBillableCharacters", () => {
  it("counts characters after normalization", () => {
    expect(countBillableCharacters("  hi  ")).toBe(2);
  });

  it("counts spaces between words as one character each", () => {
    expect(countBillableCharacters("a  b")).toBe(3);
  });

  it("counts multi-byte unicode correctly (each codepoint = 1)", () => {
    expect(countBillableCharacters("café")).toBe(4);
  });

  it("counts emoji as 1 character each (not 2 UTF-16 units)", () => {
    expect(countBillableCharacters("hi 😀")).toBe(4);
  });
});

describe("normalizeInput", () => {
  it("returns normalized text and count with no rules", () => {
    const result = normalizeInput("  hello  ", {});
    expect(result.normalizedText).toBe("hello");
    expect(result.charCount).toBe(5);
    expect(result.errors).toHaveLength(0);
    expect(result.groupCounts).toEqual({});
  });

  it("returns empty result for empty input", () => {
    const result = normalizeInput("", {});
    expect(result.normalizedText).toBe("");
    expect(result.charCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // ── minChars / maxChars ────────────────────────────────────────────────────

  it("errors when charCount is below minChars", () => {
    const { errors } = normalizeInput("hi", { minChars: 5 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/at least 5/);
  });

  it("passes when charCount equals minChars", () => {
    const { errors } = normalizeInput("hello", { minChars: 5 });
    expect(errors).toHaveLength(0);
  });

  it("errors when charCount exceeds maxChars", () => {
    const { errors } = normalizeInput("toolongstring", { maxChars: 5 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/at most 5/);
  });

  it("passes when charCount equals maxChars", () => {
    const { errors } = normalizeInput("hello", { maxChars: 5 });
    expect(errors).toHaveLength(0);
  });

  it("uses singular 'character' for limit of 1", () => {
    const { errors } = normalizeInput("", { minChars: 1 });
    expect(errors[0]).toMatch(/1 character\b/);
  });

  it("can accumulate both min and max errors", () => {
    // minChars > maxChars is a config mistake, but the module shouldn't panic
    const { errors } = normalizeInput("hi", { minChars: 5, maxChars: 1 });
    expect(errors).toHaveLength(2);
  });

  // ── allowedChars ───────────────────────────────────────────────────────────

  it("errors when input contains chars outside allowedChars", () => {
    const { errors } = normalizeInput("Hello!", { allowedChars: "abcdefghijklmnopqrstuvwxyz" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/not allowed/);
    expect(errors[0]).toContain("H");
  });

  it("allows spaces regardless of allowedChars", () => {
    const { errors } = normalizeInput("hello world", { allowedChars: "abcdefghijklmnopqrstuvwxyz" });
    expect(errors).toHaveLength(0);
  });

  it("passes when all chars are in allowedChars", () => {
    const { errors } = normalizeInput("abc", { allowedChars: "abcdef" });
    expect(errors).toHaveLength(0);
  });

  // ── disallowedChars ────────────────────────────────────────────────────────

  it("errors when input contains disallowed characters", () => {
    const { errors } = normalizeInput("hello!", { disallowedChars: "!@#" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/not allowed/);
    expect(errors[0]).toContain("!");
  });

  it("does not silently truncate — produces error instead", () => {
    const result = normalizeInput("bad!", { disallowedChars: "!" });
    expect(result.normalizedText).toBe("bad!");
    expect(result.errors).toHaveLength(1);
  });

  it("passes when no disallowed chars are present", () => {
    const { errors } = normalizeInput("hello", { disallowedChars: "!@#" });
    expect(errors).toHaveLength(0);
  });

  // ── charGroups ────────────────────────────────────────────────────────────

  it("counts chars per group", () => {
    const result = normalizeInput("AaBbCc", {
      charGroups: [
        { label: "Uppercase", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
        { label: "Lowercase", characters: "abcdefghijklmnopqrstuvwxyz" },
      ],
    });
    expect(result.groupCounts["Uppercase"]).toBe(3);
    expect(result.groupCounts["Lowercase"]).toBe(3);
  });

  it("chars not in any group are simply not counted in groups", () => {
    const result = normalizeInput("A1B2", {
      charGroups: [{ label: "Uppercase", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" }],
    });
    expect(result.groupCounts["Uppercase"]).toBe(2);
  });

  it("group count is deterministic for the same input", () => {
    const rules = { charGroups: [{ label: "Vowels", characters: "aeiou" }] };
    const r1 = normalizeInput("hello world", rules);
    const r2 = normalizeInput("hello world", rules);
    expect(r1.groupCounts).toEqual(r2.groupCounts);
  });

  // ── unicode / emoji ────────────────────────────────────────────────────────

  it("counts unicode accented characters correctly", () => {
    const { charCount, errors } = normalizeInput("café", { maxChars: 4 });
    expect(charCount).toBe(4);
    expect(errors).toHaveLength(0);
  });

  it("counts emoji as 1 character each", () => {
    const { charCount } = normalizeInput("hi 😀", {});
    expect(charCount).toBe(4);
  });

  it("validates emoji against allowedChars correctly", () => {
    const { errors } = normalizeInput("😀", { allowedChars: "abc" });
    expect(errors).toHaveLength(1);
  });
});
