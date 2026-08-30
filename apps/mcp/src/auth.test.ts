import { describe, expect, it } from "vitest";
import { bearerToken } from "./auth";

describe("bearerToken", () => {
  it("extracts a bearer credential", () => {
    expect(bearerToken("Bearer access-token")).toBe("access-token");
  });

  it("rejects missing and incompatible authorization", () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
  });
});
