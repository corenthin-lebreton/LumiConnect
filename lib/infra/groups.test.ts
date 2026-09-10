import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret } from "@/lib/crypto";
import { SECRET_FIELDS, encryptSecrets, secretRequiredForNewUrl, toConfig, toSummary } from "./groups";
import type { InfraGroupRow } from "@/types";

const row: InfraGroupRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Salle Lyon",
  proxmox_url: "https://pve.example.com:8006",
  proxmox_node: "pve",
  proxmox_token_id: "lumiconnect@pve!deploy",
  proxmox_token_secret: "secret-proxmox",
  proxmox_ca_pem: null,
  proxmox_insecure_tls: false,
  pfsense_url: "https://192.168.1.1",
  pfsense_api_key: "cle-pfsense",
  pfsense_ca_pem: null,
  pfsense_insecure_tls: false,
  guacamole_url: "http://guac.example.com:8080/guacamole",
  guacamole_datasource: "postgresql",
  guacamole_admin_user: "guacadmin",
  guacamole_admin_password: "mdp-guac",
  created_by: null,
  created_at: "2026-09-08T00:00:00Z",
  updated_at: "2026-09-08T00:00:00Z",
};

beforeAll(() => {
  process.env.LC_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("toSummary", () => {
  it("ne laisse sortir aucun secret", () => {
    const summary = toSummary({ ...row, formations: [{ count: 3 }] });
    for (const field of SECRET_FIELDS) expect(summary).not.toHaveProperty(field);
    expect(JSON.stringify(summary)).not.toMatch(/secret-proxmox|cle-pfsense|mdp-guac/);
    expect(summary.formations_count).toBe(3);
    expect(summary.name).toBe("Salle Lyon");
  });

  it("compte zéro formation quand la jointure est absente", () => {
    expect(toSummary(row).formations_count).toBe(0);
  });
});

describe("encryptSecrets / toConfig", () => {
  it("chiffre les trois secrets et rien d'autre, toConfig les déchiffre", () => {
    const encrypted = encryptSecrets(row);
    for (const field of SECRET_FIELDS) {
      expect(encrypted[field]).toMatch(/^v1:/);
      expect(decryptSecret(encrypted[field])).toBe(row[field]);
    }
    expect(encrypted.proxmox_token_id).toBe(row.proxmox_token_id);

    const config = toConfig(encrypted);
    expect(config.proxmox.tokenSecret).toBe("secret-proxmox");
    expect(config.pfsense.apiKey).toBe("cle-pfsense");
    expect(config.guacamole.adminPassword).toBe("mdp-guac");
    expect(config.proxmox.node).toBe("pve");
  });

  it("ignore les secrets absents (patch sans changement)", () => {
    const encrypted = encryptSecrets({ name: "x", proxmox_token_secret: undefined });
    expect(encrypted.proxmox_token_secret).toBeUndefined();
  });
});

describe("secretRequiredForNewUrl", () => {
  it("laisse passer une modification sans changement d'URL", () => {
    expect(secretRequiredForNewUrl(row, { name: "autre" } as never)).toBeNull();
    expect(secretRequiredForNewUrl(row, { proxmox_url: row.proxmox_url })).toBeNull();
  });

  it("exige le secret du service dont l'URL change", () => {
    expect(secretRequiredForNewUrl(row, { proxmox_url: "https://evil.example" })).toMatch(/Proxmox/);
    expect(secretRequiredForNewUrl(row, { guacamole_url: "http://evil.example" })).toMatch(/Guacamole/);
    expect(secretRequiredForNewUrl(row, { pfsense_url: "https://evil.example" })).toMatch(/pfSense/);
  });

  it("accepte le changement d'URL quand le secret est ressaisi", () => {
    expect(
      secretRequiredForNewUrl(row, { proxmox_url: "https://new.example", proxmox_token_secret: "s" })
    ).toBeNull();
  });
});
