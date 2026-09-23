export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

// Le seuil est lu une seule fois : les logs sont sur le chemin chaud du déploiement.
// Sous vitest la sortie est muette pour garder le rapport de test lisible.
function resolveLevel(): LogLevel {
  if (process.env.VITEST) return "silent";
  const raw = process.env.LC_LOG_LEVEL?.toLowerCase();
  return raw && raw in ORDER ? (raw as LogLevel) : "info";
}

let threshold = ORDER[resolveLevel()];

// Utilisé par les tests pour relire l'environnement après l'avoir modifié.
export function refreshLogLevel(): void {
  threshold = ORDER[resolveLevel()];
}

export interface Logger {
  debug(message: string, ...rest: unknown[]): void;
  info(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  error(message: string, ...rest: unknown[]): void;
}

// Le préfixe `[scope]` reproduit les préfixes historiques pour ne pas casser les
// habitudes de lecture dans `docker logs`.
export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;

  function emit(level: Exclude<LogLevel, "silent">, message: string, rest: unknown[]) {
    if (ORDER[level] < threshold) return;
    const write = level === "warn" || level === "error" ? console.error : console.log;
    write(`${prefix} ${message}`, ...rest);
  }

  return {
    debug: (message, ...rest) => emit("debug", message, rest),
    info: (message, ...rest) => emit("info", message, rest),
    warn: (message, ...rest) => emit("warn", message, rest),
    error: (message, ...rest) => emit("error", message, rest),
  };
}
