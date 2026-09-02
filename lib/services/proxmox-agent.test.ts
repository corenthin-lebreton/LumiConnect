import { describe, expect, it } from "vitest";
import { sanitizeForAgent } from "@/lib/services/proxmox-agent";

describe("sanitizeForAgent", () => {
  it("laisse l'ASCII et le latin-1 intacts", () => {
    const content = "Write-Host 'déjà configuré, coût 5€'";
    expect(sanitizeForAgent(content)).toBe(content.replace("€", "?"));
  });

  it("remplace la ponctuation typographique par son équivalent ASCII", () => {
    expect(sanitizeForAgent("a — b – c")).toBe("a - b - c");
    expect(sanitizeForAgent("‘x’ “y”")).toBe("'x' \"y\"");
    expect(sanitizeForAgent("suite…")).toBe("suite...");
  });

  it("supprime le BOM", () => {
    expect(sanitizeForAgent("﻿param()")).toBe("param()");
  });

  it("replie les caractères composés vers leur base latin-1", () => {
    expect(sanitizeForAgent("Ā")).toBe("A");
  });

  it("remplace par ? ce qui n'a pas d'équivalent latin-1", () => {
    expect(sanitizeForAgent("ok 你好")).toBe("ok ??");
    expect(sanitizeForAgent("\u{1F600}")).toBe("??");
  });

  it("ne laisse jamais sortir un point de code au-dessus de 0xff", () => {
    const sanitized = sanitizeForAgent("— ’ … ﻿ 你 \u{1F600} Ā é");
    for (const char of sanitized) {
      expect(char.codePointAt(0)!).toBeLessThanOrEqual(0xff);
    }
  });
});
