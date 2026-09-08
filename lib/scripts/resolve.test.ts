import { describe, expect, it } from "vitest";
import {
  deselectWithDependents,
  resolveSelection,
  selectWithDependencies,
  totalTimeoutSec,
} from "./resolve";
import type { ScriptEntry, ScriptRegistry } from "./registry";

function entry(id: string, overrides: Partial<ScriptEntry> = {}): ScriptEntry {
  return {
    id,
    label: id,
    mandatory: false,
    requires: [],
    timeout_sec: 900,
    reboot_after: false,
    ...overrides,
  };
}

function registryOf(scripts: ScriptEntry[]): ScriptRegistry {
  return { os_id: "linux", shell: "bash", scripts };
}

const ids = (entries: ScriptEntry[]) => entries.map((e) => e.id);

describe("resolveSelection", () => {
  const standard = registryOf([
    entry("base", { mandatory: true }),
    entry("git"),
    entry("docker"),
    entry("ansible", { requires: ["git"] }),
    entry("compose", { requires: ["docker"] }),
  ]);

  it("inclut le script obligatoire même s'il n'est pas coché", () => {
    expect(ids(resolveSelection(standard, ["git"]))).toEqual(["base", "git"]);
  });

  it("ne duplique pas le script obligatoire s'il est coché", () => {
    expect(ids(resolveSelection(standard, ["base", "git"]))).toEqual(["base", "git"]);
  });

  it("place le script obligatoire en premier", () => {
    expect(ids(resolveSelection(standard, ["docker", "git"]))[0]).toBe("base");
  });

  it("tire les dépendances non cochées", () => {
    expect(ids(resolveSelection(standard, ["ansible"]))).toEqual(["base", "git", "ansible"]);
  });

  it("ordonne chaque dépendance avant son dépendant", () => {
    const order = ids(resolveSelection(standard, ["compose", "ansible"]));
    expect(order.indexOf("docker")).toBeLessThan(order.indexOf("compose"));
    expect(order.indexOf("git")).toBeLessThan(order.indexOf("ansible"));
  });

  it("suit les dépendances transitives", () => {
    const chain = registryOf([
      entry("base", { mandatory: true }),
      entry("a", { requires: ["b"] }),
      entry("b", { requires: ["c"] }),
      entry("c"),
    ]);
    expect(ids(resolveSelection(chain, ["a"]))).toEqual(["base", "c", "b", "a"]);
  });

  it("produit le même ordre quel que soit l'ordre de sélection", () => {
    const a = ids(resolveSelection(standard, ["ansible", "compose", "git"]));
    const b = ids(resolveSelection(standard, ["git", "compose", "ansible"]));
    expect(a).toEqual(b);
  });

  it("rejette un script inconnu", () => {
    expect(() => resolveSelection(standard, ["rustup"])).toThrow(/Script inconnu/);
  });

  it("détecte un cycle et nomme les scripts impliqués", () => {
    const cyclic = registryOf([
      entry("base", { mandatory: true }),
      entry("a", { requires: ["b"] }),
      entry("b", { requires: ["a"] }),
    ]);
    expect(() => resolveSelection(cyclic, ["a"])).toThrow(/circulaires.*a, b/);
  });

  it("ne fait pas dépendre les scripts obligatoires les uns des autres à tort", () => {
    const twoMandatory = registryOf([
      entry("base", { mandatory: true }),
      entry("agent", { mandatory: true }),
      entry("git"),
    ]);
    const order = ids(resolveSelection(twoMandatory, ["git"]));
    expect(order).toEqual(["base", "agent", "git"]);
  });

  it("retourne une sélection vide réduite aux obligatoires", () => {
    expect(ids(resolveSelection(standard, []))).toEqual(["base"]);
  });
});

describe("totalTimeoutSec", () => {
  it("additionne les délais de la séquence", () => {
    const entries = [entry("base", { timeout_sec: 300 }), entry("docker", { timeout_sec: 1800 })];
    expect(totalTimeoutSec(entries)).toBe(2100);
  });
});

describe("selectWithDependencies", () => {
  const registry = registryOf([
    entry("base", { mandatory: true }),
    entry("git"),
    entry("docker"),
    entry("ansible", { requires: ["git"] }),
    entry("molecule", { requires: ["ansible", "docker"] }),
  ]);

  it("ajoute les dépendances manquantes", () => {
    expect(selectWithDependencies(registry, [], "ansible")).toEqual(["git", "ansible"]);
  });

  it("remonte toute la chaîne", () => {
    expect(selectWithDependencies(registry, [], "molecule")).toEqual([
      "git",
      "docker",
      "ansible",
      "molecule",
    ]);
  });

  it("range la sélection dans l'ordre du registry, pas dans celui des clics", () => {
    expect(selectWithDependencies(registry, ["docker"], "git")).toEqual(["git", "docker"]);
  });

  it("ne duplique pas un script déjà sélectionné", () => {
    expect(selectWithDependencies(registry, ["git"], "git")).toEqual(["git"]);
  });
});

describe("deselectWithDependents", () => {
  const registry = registryOf([
    entry("base", { mandatory: true }),
    entry("git"),
    entry("docker"),
    entry("ansible", { requires: ["git"] }),
    entry("molecule", { requires: ["ansible", "docker"] }),
  ]);

  it("retire aussi ce qui en dépend", () => {
    expect(deselectWithDependents(registry, ["git", "ansible"], "git")).toEqual([]);
  });

  it("suit les dépendances indirectes", () => {
    const selection = ["git", "docker", "ansible", "molecule"];
    expect(deselectWithDependents(registry, selection, "git")).toEqual(["docker"]);
  });

  it("laisse les scripts indépendants en place", () => {
    expect(deselectWithDependents(registry, ["git", "docker"], "docker")).toEqual(["git"]);
  });

  it("est sans effet sur un script non sélectionné", () => {
    expect(deselectWithDependents(registry, ["git"], "docker")).toEqual(["git"]);
  });
});
