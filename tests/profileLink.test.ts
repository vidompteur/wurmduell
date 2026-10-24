import { describe, expect, it } from "vitest";
import { profileUrl } from "../src/ladder/profileLink";

const T = "https://bsky.app/profile/{id}";

describe("Profil-Link", () => {
  it("baut Adressen für Handles und DIDs", () => {
    expect(profileUrl("steini7.eurosky.social", T)).toBe("https://bsky.app/profile/steini7.eurosky.social");
    expect(profileUrl("@Anna.Bsky.Social", T)).toBe("https://bsky.app/profile/Anna.Bsky.Social");
    expect(profileUrl("did:plc:pywyjwjzdtd4gx5ksd6t6d4c", T)).toBe("https://bsky.app/profile/did%3Aplc%3Apywyjwjzdtd4gx5ksd6t6d4c");
  });

  it("lehnt ungültige Kennungen und Vorlagen ab", () => {
    expect(profileUrl("../evil", T)).toBe(null);
    expect(profileUrl("javascript:alert(1)", T)).toBe(null);
    expect(profileUrl("a b.test", T)).toBe(null);
    expect(profileUrl("", T)).toBe(null);
    expect(profileUrl(null, T)).toBe(null);
    expect(profileUrl("anna.test", "")).toBe(null);
    expect(profileUrl("anna.test", "http://x.test/{id}")).toBe(null);
    expect(profileUrl("anna.test", "https://x.test/")).toBe(null);
  });
});
