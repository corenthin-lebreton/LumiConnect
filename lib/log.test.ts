import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, refreshLogLevel } from "./log";

// Le module est muet dès que VITEST est défini : les tests neutralisent la variable
// pour observer le comportement réel, puis la restaurent.
const VITEST_FLAG = process.env.VITEST;

describe("logger", () => {
  const out = vi.fn();
  const err = vi.fn();

  beforeEach(() => {
    delete process.env.VITEST;
    delete process.env.LC_LOG_LEVEL;
    out.mockReset();
    err.mockReset();
    vi.stubGlobal("console", { ...console, log: out, error: err });
  });

  afterEach(() => {
    process.env.VITEST = VITEST_FLAG;
    delete process.env.LC_LOG_LEVEL;
    refreshLogLevel();
    vi.unstubAllGlobals();
  });

  it("préfixe les messages avec le scope", () => {
    refreshLogLevel();
    createLogger("cleanup").info("formation=1 all OK");
    expect(out).toHaveBeenCalledWith("[cleanup] formation=1 all OK");
  });

  it("masque debug au niveau info par défaut", () => {
    refreshLogLevel();
    const log = createLogger("deploy");
    log.debug("détail");
    log.info("jalon");
    expect(out).toHaveBeenCalledTimes(1);
    expect(out).toHaveBeenCalledWith("[deploy] jalon");
  });

  it("laisse passer debug quand LC_LOG_LEVEL=debug", () => {
    process.env.LC_LOG_LEVEL = "debug";
    refreshLogLevel();
    createLogger("deploy").debug("détail");
    expect(out).toHaveBeenCalledWith("[deploy] détail");
  });

  it("écrit warn et error sur la sortie d'erreur", () => {
    refreshLogLevel();
    const log = createLogger("proxmox");
    log.warn("verrou", 1);
    log.error("échec");
    expect(err).toHaveBeenCalledWith("[proxmox] verrou", 1);
    expect(err).toHaveBeenCalledWith("[proxmox] échec");
    expect(out).not.toHaveBeenCalled();
  });

  it("n'écrit rien en silent", () => {
    process.env.LC_LOG_LEVEL = "silent";
    refreshLogLevel();
    const log = createLogger("cleanup");
    log.info("jalon");
    log.error("échec");
    expect(out).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it("retombe sur info si LC_LOG_LEVEL est invalide", () => {
    process.env.LC_LOG_LEVEL = "bavard";
    refreshLogLevel();
    const log = createLogger("deploy");
    log.debug("détail");
    log.info("jalon");
    expect(out).toHaveBeenCalledTimes(1);
  });
});
