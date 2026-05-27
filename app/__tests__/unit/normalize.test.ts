import { describe, it, expect } from "vitest";
import { normalizeText, countBillableCharacters } from "~/utils/normalize";

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
});
