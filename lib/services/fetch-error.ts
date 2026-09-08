const HINTS: Record<string, string> = {
  DEPTH_ZERO_SELF_SIGNED_CERT: "certificat auto-signé : coller la CA du service dans le groupe",
  SELF_SIGNED_CERT_IN_CHAIN: "certificat auto-signé : coller la CA du service dans le groupe",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "certificat non vérifiable : coller la CA du service dans le groupe",
  ERR_TLS_CERT_ALTNAME_INVALID: "le certificat ne couvre pas ce nom d'hôte",
  CERT_HAS_EXPIRED: "certificat expiré",
  ECONNREFUSED: "connexion refusée (service arrêté ou port incorrect)",
  ENOTFOUND: "nom d'hôte introuvable",
  EHOSTUNREACH: "hôte injoignable",
  ETIMEDOUT: "délai de connexion dépassé",
  UND_ERR_CONNECT_TIMEOUT: "délai de connexion dépassé",
};

// `fetch failed` ne dit rien : la cause utile est dans error.cause (undici / TLS).
interface CauseLike {
  code?: string;
  message?: string;
  errors?: CauseLike[];
}

export function describeFetchError(error: unknown): string {
  const e = error as { name?: string; message?: string; cause?: CauseLike };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "délai dépassé";
  // Une AggregateError (IPv4 + IPv6 refusés) porte le code sur ses erreurs internes.
  const cause = e?.cause?.code ? e.cause : e?.cause?.errors?.find((inner) => inner.code);
  const code = cause?.code;
  if (code) {
    const hint = HINTS[code] ?? cause?.message ?? code;
    return `${hint} (${code})`;
  }
  if (e?.cause?.message) return e.cause.message;
  return e?.message ?? String(error);
}
