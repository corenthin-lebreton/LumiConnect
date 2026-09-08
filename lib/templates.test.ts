import { describe, expect, it } from "vitest";
import { TEMPLATE_TAG, detectOsFamily, hasTag } from "./templates";

describe("detectOsFamily", () => {
  it("reconnaît Windows quelle que soit la casse ou la forme", () => {
    for (const name of [
      "win11",
      "Win11-Pro",
      "WINDOWS",
      "Formation Windows 11 Pro",
      "tpl-win11-pro-v1",
      "lab_windows_2025",
    ]) {
      expect(detectOsFamily(name), name).toBe("windows");
    }
  });

  it("reconnaît les distributions Linux quelle que soit la casse ou la forme", () => {
    for (const name of [
      "debian13",
      "Debian 13 Lab",
      "deb-13",
      "tpl-debian13-v2",
      "ubuntu2404",
      "Ubuntu 24.04",
      "ubun-server",
      "kali",
      "KALI-2025",
      "kal",
      "Linux générique",
    ]) {
      expect(detectOsFamily(name), name).toBe("linux");
    }
  });

  it("ne déduit rien d'un nom sans mot-clé", () => {
    for (const name of ["", "test", "macos-sonoma", "freebsd14", "poste-formateur"]) {
      expect(detectOsFamily(name), name).toBeNull();
    }
  });

  it("ne déduit rien d'un mot-clé collé à la fin d'un autre mot", () => {
    for (const name of ["darwin", "alkali", "mywin", "adebian"]) {
      expect(detectOsFamily(name), name).toBeNull();
    }
  });

  it("ne tranche pas quand plusieurs familles apparaissent", () => {
    for (const name of ["linux-sur-windows", "win-kali", "Debian Windows"]) {
      expect(detectOsFamily(name), name).toBeNull();
    }
  });
});

describe("hasTag", () => {
  it("reconnaît le tag quel que soit le séparateur employé par Proxmox", () => {
    expect(hasTag("lc-tpl", TEMPLATE_TAG)).toBe(true);
    expect(hasTag("prod;lc-tpl;golden", TEMPLATE_TAG)).toBe(true);
    expect(hasTag("prod,lc-tpl", TEMPLATE_TAG)).toBe(true);
    expect(hasTag("prod lc-tpl", TEMPLATE_TAG)).toBe(true);
    expect(hasTag("LC-TPL", TEMPLATE_TAG)).toBe(true);
  });

  it("ne confond pas un tag avec un préfixe ou un suffixe", () => {
    expect(hasTag("lc-tpl-old", TEMPLATE_TAG)).toBe(false);
    expect(hasTag("xlc-tpl", TEMPLATE_TAG)).toBe(false);
    expect(hasTag("", TEMPLATE_TAG)).toBe(false);
    expect(hasTag(undefined, TEMPLATE_TAG)).toBe(false);
    expect(hasTag(null, TEMPLATE_TAG)).toBe(false);
  });
});
