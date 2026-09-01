import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

let crypto: typeof import("./crypto");

beforeAll(async () => {
  process.env.LC_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  crypto = await import("./crypto");
});

describe("encryptSecret / decryptSecret", () => {
  it("fait un aller-retour fidèle", () => {
    const secret = "Tr0ub4dor&3 é€'\"\\";
    expect(crypto.decryptSecret(crypto.encryptSecret(secret))).toBe(secret);
  });

  it("produit un chiffré différent à chaque appel (IV aléatoire)", () => {
    expect(crypto.encryptSecret("même-valeur")).not.toBe(crypto.encryptSecret("même-valeur"));
  });

  it("renvoie tel quel le clair hérité d'avant la migration 002", () => {
    expect(crypto.decryptSecret("motdepasse-en-clair")).toBe("motdepasse-en-clair");
  });

  it("rejette un chiffré altéré au lieu de renvoyer des octets faux", () => {
    const encrypted = crypto.encryptSecret("secret");
    const parts = encrypted.split(":");
    const tampered = Buffer.from(parts[3], "base64");
    tampered[0] ^= 0xff;
    parts[3] = tampered.toString("base64");
    expect(() => crypto.decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejette un chiffré malformé", () => {
    expect(() => crypto.decryptSecret("v1:pastassez")).toThrow(/malformé/);
  });
});

describe("generatePassword", () => {
  it("respecte la longueur demandée", () => {
    expect(crypto.generatePassword(24)).toHaveLength(24);
  });

  it("ne répète pas la même valeur", () => {
    const seen = new Set(Array.from({ length: 200 }, () => crypto.generatePassword()));
    expect(seen.size).toBe(200);
  });
});
