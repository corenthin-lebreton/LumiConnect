import { describe, expect, it } from "vitest";
import { TEMPLATE_TAG, hasTag, parseTemplateName } from "./templates";

describe("parseTemplateName", () => {
  it("reconnaît les quatre templates du projet", () => {
    expect(parseTemplateName("tpl-win11-pro-v1")).toEqual({
      osId: "win11",
      variant: "pro",
      revision: 1,
    });
    expect(parseTemplateName("tpl-debian13-std-v1")).toEqual({
      osId: "debian13",
      variant: "std",
      revision: 1,
    });
    expect(parseTemplateName("tpl-ubuntu2404-std-v12")).toEqual({
      osId: "ubuntu2404",
      variant: "std",
      revision: 12,
    });
    expect(parseTemplateName("tpl-kali-std-v3")).toEqual({
      osId: "kali",
      variant: "std",
      revision: 3,
    });
  });

  it("rejette les noms hors nomenclature", () => {
    for (const name of [
      "win11",
      "tpl-win11-v1",
      "tpl-win11-pro",
      "tpl-win11-pro-v",
      "tpl-Win11-pro-v1",
      "tpl-win11-pro-v1-extra",
      "template-win11-pro-v1",
      "",
    ]) {
      expect(parseTemplateName(name), name).toBeNull();
    }
  });

  it("ne laisse pas un os_id contenir de quoi construire un chemin", () => {
    for (const name of ["tpl-../etc-std-v1", "tpl-a/b-std-v1", "tpl-a.b-std-v1"]) {
      expect(parseTemplateName(name), name).toBeNull();
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
