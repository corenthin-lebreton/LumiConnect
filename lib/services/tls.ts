import { X509Certificate } from "node:crypto";
import { Agent } from "undici";

export interface TlsOptions {
  caPem: string | null;
  insecureTls: boolean;
}

function commonName(pem: string): string | undefined {
  return new X509Certificate(pem).subject
    .split("\n")
    .find((line) => line.startsWith("CN="))
    ?.slice(3);
}

// `null` = confiance système : laisser le dispatcher global (pas d'agent à fermer).
// `useCaCommonName` force le SNI au CN du PEM : utile pour un certificat auto-signé feuille
// joint par IP (pfSense), nuisible pour une CA racine dont le CN n'est pas un nom d'hôte
// (Proxmox : « Proxmox Virtual Environment ... CA »).
export function tlsAgent(
  tls: TlsOptions,
  connectTimeout: number,
  useCaCommonName = false
): Agent | null {
  if (tls.insecureTls) {
    return new Agent({ connect: { rejectUnauthorized: false }, connectTimeout });
  }
  if (!tls.caPem) return null;
  const servername = useCaCommonName ? commonName(tls.caPem) : undefined;
  return new Agent({ connect: { ca: tls.caPem, servername }, connectTimeout });
}

// pveFetch est appelé en boucle : un agent par requête rouvrirait une session TLS à chaque fois.
const cache = new Map<string, Agent>();

export function cachedTlsAgent(tls: TlsOptions, connectTimeout: number): Agent | null {
  if (!tls.insecureTls && !tls.caPem) return null;
  const key = `${tls.insecureTls}|${connectTimeout}|${tls.caPem ?? ""}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const agent = tlsAgent(tls, connectTimeout)!;
  cache.set(key, agent);
  return agent;
}
