import { describe, expect, it } from "vitest";
import { format, parseProperties, t, tList } from "../src/i18n";

/** Prüft, dass ein Schlüssel einen echten Text liefert (fehlende Schlüssel geben den Schlüssel zurück). */
const has = (key: string): boolean => t(key) !== key;

describe("Texte (de.properties)", () => {
  it("liest Schlüssel, Kommentare und Leerzeilen korrekt", () => {
    const p = parseProperties("# Kommentar\n\na.b = Wert mit = Gleichheitszeichen \r\nleer=\n  c =x");
    expect(p).toEqual({ "a.b": "Wert mit = Gleichheitszeichen", leer: "", c: "x" });
  });

  it("ersetzt Platzhalter und lässt unbekannte stehen", () => {
    expect(format("{a} und {b}", { a: 1 })).toBe("1 und {b}");
    expect(format("ohne")).toBe("ohne");
    expect(t("hud.turn", { team: "Rot", worm: "Erdi" })).toBe("Rot: Erdi ist dran");
  });

  it("liefert bei unbekanntem Schlüssel den Schlüssel selbst", () => {
    expect(t("gibt.es.nicht")).toBe("gibt.es.nicht");
  });

  it("dynamisch gebildete Schlüssel sind vollständig vorhanden", () => {
    for (const id of ["bazooka", "grenade", "dynamite", "shotgun", "teleport"]) expect(has(`weapon.${id}`)).toBe(true);
    for (const l of ["easy", "normal", "hard"]) expect(has(`setup.ai.${l}`)).toBe(true);
    for (const l of ["move", "aim", "fire", "weapon", "zoom", "pause"]) {
      expect(has(`legend.${l}.key`)).toBe(true);
      expect(has(`legend.${l}.text`)).toBe(true);
    }
    for (const c of ["rank", "name", "wins", "losses", "matches", "winrate", "accuracy", "damage", "streak", "last"]) expect(has(`ladder.col.${c}`)).toBe(true);
    for (const n of ["0", "1", "n"]) expect(has(`setup.teleports.${n}`)).toBe(true);
    for (const n of ["2", "3"]) expect(has(`setup.teamSize.${n}`)).toBe(true);
  });

  it("hat genug Wurmnamen für beide Teams", () => {
    expect(tList("setup.wormNames").length).toBeGreaterThanOrEqual(6);
  });
});
