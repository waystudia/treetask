import { describe, expect, it } from "vitest";
import {
  formatProjectInviteCode,
  isProjectInviteCode,
  normalizeProjectInviteCode,
} from "./project-invite";

describe("project invite code", () => {
  it("keeps only the first six digits", () => {
    expect(normalizeProjectInviteCode(" 123-456 789 ")).toBe("123456");
    expect(normalizeProjectInviteCode(123456)).toBe("123456");
    expect(normalizeProjectInviteCode(null)).toBe("");
  });

  it("accepts only complete six-digit codes", () => {
    expect(isProjectInviteCode("123456")).toBe(true);
    expect(isProjectInviteCode("12345")).toBe(false);
    expect(isProjectInviteCode("123 456")).toBe(false);
  });

  it("formats a complete code for people without changing its value", () => {
    expect(formatProjectInviteCode("123456")).toBe("123 456");
    expect(normalizeProjectInviteCode(formatProjectInviteCode("123456"))).toBe("123456");
  });
});
