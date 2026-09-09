/**
 * Source unique de verite pour les origines autorisees.
 *
 * Ce module est importe par next.config.ts : il ne doit avoir aucune dependance
 * ni utiliser l'alias "@/" (le loader de config de Next ne le resout pas).
 */

const DEFAULT_ORIGIN = "http://localhost:3000";

/** Origine publique de l'application (schema + hote), sans slash final. */
export const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, "");

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

/** Hote de l'application au format host[:port] (format attendu par Next). */
export const appHost = hostOf(APP_ORIGIN);

const DEV_ORIGINS = [
  "localhost:3000",
  "127.0.0.1:3000",
  "192.168.1.240",
  "192.168.1.240:3000",
];

/**
 * Hotes autorises pour les Server Actions et les requetes de developpement.
 * En production, seul l'hote public de l'application est accepte.
 */
export function allowedOrigins(): string[] {
  const extra = (process.env.LC_DEV_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const hosts =
    process.env.NODE_ENV === "production"
      ? [appHost]
      : [appHost, ...DEV_ORIGINS, ...extra];

  return [...new Set(hosts)];
}

/**
 * Origine absolue a utiliser pour construire une redirection.
 * Derriere un reverse proxy TLS, request.url porte le schema et l'hote internes :
 * on privilegie l'origine configuree, puis les en-tetes X-Forwarded-*.
 */
export function resolveRequestOrigin(request: Request): string {
  if (process.env.NODE_ENV === "production") return APP_ORIGIN;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    return `${proto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
