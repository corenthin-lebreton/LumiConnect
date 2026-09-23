import { describe, expect, it } from "vitest";
import { drivePath } from "./guacamole-step";
import type { Formation } from "@/types";

const formation = { name: "CODA 1234567" } as Formation;

describe("chemin du lecteur réseau", () => {
  it("combine le nom de formation slugifié et le vmid", () => {
    expect(drivePath(formation, { vmid: 204, iteration: 4, ip: "10.0.0.4" })).toBe(
      "/drive/coda-1234567-204"
    );
  });

  it("normalise accents, espaces et ponctuation", () => {
    const accented = { name: "Formation Réseau (été) !" } as Formation;
    expect(drivePath(accented, { vmid: 201, iteration: 1, ip: "10.0.0.1" })).toBe(
      "/drive/formation-reseau-ete-201"
    );
  });
});
