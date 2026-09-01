import { createCipheriv, createDecipheriv, randomBytes, randomInt } from "node:crypto";

const SCHEME = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = process.env.LC_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "LC_ENCRYPTION_KEY manquante. Générer une clé: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `LC_ENCRYPTION_KEY doit décoder sur 32 octets (reçu ${key.length}). Générer: openssl rand -base64 32`
    );
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${SCHEME}:`);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    SCHEME,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const [, ivB64, tagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Secret chiffré malformé");
  }

  const decipher = createDecipheriv(ALGO, loadKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

const PASSWORD_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

export function generatePassword(length = 16): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARSET.charAt(randomInt(PASSWORD_CHARSET.length));
  }
  return password;
}
