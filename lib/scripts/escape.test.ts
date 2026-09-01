import { describe, expect, it } from "vitest";
import { escapeBash, escapePowerShell, renderContextFile } from "./escape";

const HOSTILE = [
  "p4ss'; Remove-Item C:\\ -Recurse; #",
  "p4ss'; rm -rf / #",
  "$(whoami)",
  "`whoami`",
  "${IFS}cat${IFS}/etc/shadow",
  'quote" et apostrophe\'',
  "%SYSTEMROOT%",
  "a\\b\\c",
];

describe("escapePowerShell", () => {
  it("double les apostrophes", () => {
    expect(escapePowerShell("O'Brien")).toBe("'O''Brien'");
  });

  it("laisse $ et ` inertes dans une chaîne simple-quote", () => {
    expect(escapePowerShell("$(whoami)")).toBe("'$(whoami)'");
    expect(escapePowerShell("`whoami`")).toBe("'`whoami`'");
  });

  it("produit un littéral dont le corps ne referme jamais la chaîne", () => {
    for (const value of HOSTILE) {
      const escaped = escapePowerShell(value);
      const body = escaped.slice(1, -1);
      expect(body.replace(/''/g, "")).not.toContain("'");
    }
  });
});

describe("escapeBash", () => {
  it("ferme, insère, rouvre pour chaque apostrophe", () => {
    expect(escapeBash("O'Brien")).toBe(`'O'\\''Brien'`);
  });

  it("neutralise substitutions et expansions", () => {
    expect(escapeBash("$(whoami)")).toBe("'$(whoami)'");
    expect(escapeBash("${IFS}")).toBe("'${IFS}'");
  });

  it("produit une commande dont bash restitue la valeur d'origine", async () => {
    const { execFileSync } = await import("node:child_process");
    for (const value of HOSTILE) {
      const out = execFileSync("/bin/bash", ["-c", `printf '%s' ${escapeBash(value)}`], {
        encoding: "utf8",
      });
      expect(out).toBe(value);
    }
  });
});

describe("renderContextFile", () => {
  it("génère des affectations PowerShell avec CRLF", () => {
    const out = renderContextFile("powershell", { LC_USERNAME: "dev", LC_PASSWORD: "a'b" });
    expect(out).toContain(`$env:LC_USERNAME = 'dev'`);
    expect(out).toContain(`$env:LC_PASSWORD = 'a''b'`);
    expect(out).toContain("\r\n");
  });

  it("génère des exports bash", () => {
    const out = renderContextFile("bash", { LC_HOSTNAME: "poste-01" });
    expect(out).toContain(`export LC_HOSTNAME='poste-01'`);
  });

  it("refuse un retour à la ligne plutôt que de tronquer", () => {
    expect(() => renderContextFile("bash", { LC_PASSWORD: "a\nrm -rf /" })).toThrow(
      /retours à la ligne/
    );
    expect(() => renderContextFile("powershell", { LC_PASSWORD: "a\r\nb" })).toThrow(
      /retours à la ligne/
    );
  });

  it("refuse un octet nul", () => {
    expect(() => renderContextFile("bash", { LC_PASSWORD: "a\0b" })).toThrow(/octet nul/);
  });

  it("refuse un nom de variable hors convention LC_", () => {
    expect(() => renderContextFile("bash", { PATH: "/tmp" })).toThrow(/Nom de variable/);
    expect(() => renderContextFile("bash", { "LC_A; rm -rf /": "x" })).toThrow(/Nom de variable/);
  });

  it("restitue les valeurs à l'identique une fois le fichier sourcé par bash", async () => {
    const { execFileSync } = await import("node:child_process");
    const values = { LC_USERNAME: "dev", LC_PASSWORD: HOSTILE[1], LC_HOSTNAME: "poste-01" };
    const file = renderContextFile("bash", values);
    const out = execFileSync(
      "/bin/bash",
      ["-c", `${file}\nprintf '%s' "$LC_PASSWORD"`],
      { encoding: "utf8" }
    );
    expect(out).toBe(values.LC_PASSWORD);
  });
});
