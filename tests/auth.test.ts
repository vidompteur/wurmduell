import { describe, expect, it } from "vitest";
import { cleanCallbackUrl } from "../src/atproto/auth";

describe("OAuth-Rückgabe bereinigen", () => {
  it("entfernt Parameter aus dem Fragment und behält den Rest", () => {
    expect(cleanCallbackUrl("https://x.test/app/?debug#state=a&code=b&iss=c")).toBe("https://x.test/app/?debug=");
  });

  it("entfernt Parameter aus der Query", () => {
    expect(cleanCallbackUrl("https://x.test/app/?code=b&state=a&keep=1")).toBe("https://x.test/app/?keep=1");
  });

  it("lässt URLs ohne Rückgabeparameter unverändert", () => {
    expect(cleanCallbackUrl("https://x.test/app/")).toBe("https://x.test/app/");
  });
});
