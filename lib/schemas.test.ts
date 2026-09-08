import { describe, expect, it } from "vitest";
import { infraGroupPatchSchema, infraGroupSchema } from "./schemas";

const valid = {
  name: "Salle Lyon",
  proxmox_url: "https://pve.example.com:8006/",
  proxmox_node: "pve",
  proxmox_token_id: "lumiconnect@pve!deploy",
  proxmox_token_secret: "secret-proxmox",
  pfsense_url: "https://192.168.1.1",
  pfsense_api_key: "cle-pfsense",
  pfsense_ca_pem: "",
  guacamole_url: "http://guac.example.com:8080/guacamole",
  guacamole_datasource: "postgresql",
  guacamole_admin_user: "guacadmin",
  guacamole_admin_password: "mdp-guac",
};

describe("infraGroupSchema", () => {
  it("accepte un groupe complet et normalise les valeurs", () => {
    const parsed = infraGroupSchema.parse(valid);
    expect(parsed.proxmox_url).toBe("https://pve.example.com:8006");
    expect(parsed.pfsense_ca_pem).toBeNull();
    expect(parsed.pfsense_insecure_tls).toBe(false);
  });

  it("refuse une URL Proxmox avec un chemin", () => {
    const result = infraGroupSchema.safeParse({ ...valid, proxmox_url: "https://pve.example.com/api2/json" });
    expect(result.success).toBe(false);
  });

  it("refuse un protocole autre que http(s)", () => {
    for (const url of ["ftp://pve.example.com", "file:///etc/passwd", "javascript:alert(1)"]) {
      expect(infraGroupSchema.safeParse({ ...valid, proxmox_url: url }).success, url).toBe(false);
      expect(infraGroupSchema.safeParse({ ...valid, pfsense_url: url }).success, url).toBe(false);
    }
  });

  it("refuse un identifiant de token mal formé", () => {
    for (const tokenId of ["lumiconnect", "lumiconnect@pve", "lumiconnect!deploy", "a b@pve!t"]) {
      expect(infraGroupSchema.safeParse({ ...valid, proxmox_token_id: tokenId }).success, tokenId).toBe(false);
    }
  });

  it("exige les trois secrets à la création", () => {
    for (const field of ["proxmox_token_secret", "pfsense_api_key", "guacamole_admin_password"]) {
      expect(infraGroupSchema.safeParse({ ...valid, [field]: "" }).success, field).toBe(false);
    }
  });

  it("valide le certificat CA quand il est fourni", () => {
    expect(infraGroupSchema.safeParse({ ...valid, pfsense_ca_pem: "pas un pem" }).success).toBe(false);
    const parsed = infraGroupSchema.parse({ ...valid, pfsense_ca_pem: "-----BEGIN CERTIFICATE-----\nabc" });
    expect(parsed.pfsense_ca_pem).toContain("BEGIN CERTIFICATE");
  });
});

describe("infraGroupPatchSchema", () => {
  it("laisse les secrets vides à undefined pour les conserver", () => {
    const parsed = infraGroupPatchSchema.parse({
      ...valid,
      proxmox_token_secret: "",
      pfsense_api_key: undefined,
      guacamole_admin_password: "nouveau",
    });
    expect(parsed.proxmox_token_secret).toBeUndefined();
    expect(parsed.pfsense_api_key).toBeUndefined();
    expect(parsed.guacamole_admin_password).toBe("nouveau");
  });
});
