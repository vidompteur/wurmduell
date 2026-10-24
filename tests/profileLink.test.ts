import { describe, expect, it } from "vitest";
import { profileUrl } from "../src/ladder/profileLink";

const T = "https://bsky.app/profile/{id}";
const BY = { "eurosky.social": "https://mu.social/profile/{id}" };

describe("Profil-Link", () => {
  it("baut Adressen für Handles und DIDs", () => {
    expect(profileUrl("steini7.eurosky.social", T, {})).toBe("https://bsky.app/profile/steini7.eurosky.social");
    expect(profileUrl("@Anna.Bsky.Social", T)).toBe("https://bsky.app/profile/Anna.Bsky.Social");
    expect(profileUrl("did:plc:pywyjwjzdtd4gx5ksd6t6d4c", T)).toBe("https://bsky.app/profile/did%3Aplc%3Apywyjwjzdtd4gx5ksd6t6d4c");
  });

  it("nutzt je Handle-Domain eine eigene Vorlage (Eurosky → mu), sonst die Standardvorlage", () => {
    expect(profileUrl("steini7.eurosky.social", T, BY)).toBe("https://mu.social/profile/steini7.eurosky.social");
    expect(profileUrl("EUROSKY.social", T, BY)).toBe("https://mu.social/profile/EUROSKY.social");
    expect(profileUrl("anna.bsky.social", T, BY)).toBe("https://bsky.app/profile/anna.bsky.social");
    expect(profileUrl("noteurosky.social", T, BY)).toBe("https://bsky.app/profile/noteurosky.social");
    expect(profileUrl("did:plc:abc", T, BY)).toBe("https://bsky.app/profile/did%3Aplc%3Aabc");
  });

  it("lehnt ungültige Kennungen und Vorlagen ab", () => {
    expect(profileUrl("../evil", T, BY)).toBe(null);
    expect(profileUrl("javascript:alert(1)", T)).toBe(null);
    expect(profileUrl("a b.test", T)).toBe(null);
    expect(profileUrl("", T)).toBe(null);
    expect(profileUrl(null, T)).toBe(null);
    expect(profileUrl("anna.test", "")).toBe(null);
    expect(profileUrl("anna.test", "http://x.test/{id}")).toBe(null);
    expect(profileUrl("anna.test", "https://x.test/")).toBe(null);
  });
});
