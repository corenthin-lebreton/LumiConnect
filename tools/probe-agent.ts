import { runGuestScript, startVm, waitForAgent } from "@/lib/services/proxmox-agent";
import { renderContextFile, type Shell } from "@/lib/scripts/escape";

const REQUIRED_ENV = [
  "PROXMOX_URL",
  "PROXMOX_TOKEN_ID",
  "PROXMOX_TOKEN_SECRET",
  "PROXMOX_NODE",
] as const;

function fail(message: string): never {
  console.error(`\n  ÉCHEC — ${message}\n`);
  process.exit(1);
}

function step(label: string) {
  process.stdout.write(`  ${label.padEnd(34, ".")} `);
}

async function main() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    fail(`variables d'environnement manquantes : ${missing.join(", ")}`);
  }

  const vmid = Number(process.argv[2]);
  if (!Number.isInteger(vmid) || vmid <= 0) {
    fail("usage : pnpm probe:agent <vmid>  (ex. pnpm probe:agent 201)");
  }

  const shell: Shell = (process.argv[3] as Shell) ?? "bash";
  if (shell !== "bash" && shell !== "powershell") {
    fail(`shell inconnu : ${shell} (attendu « bash » ou « powershell »)`);
  }

  const isWindows = shell === "powershell";
  const dir = isWindows ? "C:\\ProgramData\\lumiconnect" : "/opt/lumiconnect";
  const sep = isWindows ? "\\" : "/";
  const ext = isWindows ? "ps1" : "sh";

  console.log(`\n  Sonde guest agent — VM ${vmid}, shell ${shell}\n`);

  step("démarrage de la VM");
  const started = await startVm(vmid);
  if (!started.success) fail(`startVm : ${started.error}`);
  console.log("ok");

  step("attente du guest agent");
  const agentTimeoutMs = Number(process.env.LC_AGENT_TIMEOUT_SEC ?? 600) * 1000;
  const agent = await waitForAgent(vmid, agentTimeoutMs);
  if (!agent.success) fail(agent.error!);
  console.log("ok");

  const canary = `LumiConnect'; echo PWNED; #`;

  step("écriture du fichier de contexte");
  const contextPath = `${dir}${sep}context.${isWindows ? "ps1" : "env"}`;
  const contextBody = renderContextFile(shell, { LC_PROBE: canary });
  const mkdir = isWindows
    ? `New-Item -ItemType Directory -Force -Path '${dir}' | Out-Null\r\n`
    : `mkdir -p '${dir}'\n`;

  const bootstrapPath = `${dir === "/opt/lumiconnect" ? "/tmp" : "C:\\Windows\\Temp"}${sep}lc-probe-bootstrap.${ext}`;
  const bootstrap = await runGuestScript({
    vmid,
    shell,
    remotePath: bootstrapPath,
    content: mkdir,
    timeoutMs: 60000,
  });
  if (!bootstrap.success) fail(`création de ${dir} : ${bootstrap.error}`);

  const writeContext = await runGuestScript({
    vmid,
    shell,
    remotePath: contextPath,
    content: contextBody,
    timeoutMs: 60000,
  });
  if (!writeContext.success) fail(`écriture du contexte : ${writeContext.error}`);
  console.log("ok");

  step("exécution d'un script + code retour");
  const body = isWindows
    ? `. '${contextPath}'\r\nWrite-Output $env:LC_PROBE\r\nexit 0\r\n`
    : `. '${contextPath}'\nprintf '%s' "$LC_PROBE"\nexit 0\n`;

  const run = await runGuestScript({
    vmid,
    shell,
    remotePath: `${dir}${sep}probe.${ext}`,
    content: body,
    timeoutMs: 120000,
  });
  if (!run.success) fail(`exécution : ${run.error}`);
  console.log(`ok (exit ${run.data!.exitcode})`);

  step("intégrité de la valeur hostile");
  const stdout = run.data!.stdout.trim();
  if (stdout !== canary) {
    fail(
      `la valeur est ressortie altérée.\n     attendu : ${JSON.stringify(canary)}\n     reçu    : ${JSON.stringify(stdout)}`
    );
  }
  console.log("ok");

  step("détection d'un code de sortie non nul");
  const failing = await runGuestScript({
    vmid,
    shell,
    remotePath: `${dir}${sep}probe-fail.${ext}`,
    content: isWindows ? "exit 3\r\n" : "exit 3\n",
    timeoutMs: 60000,
  });
  if (failing.success) fail("un script sortant en 3 a été rapporté comme réussi");
  if (failing.data?.exitcode !== 3) {
    fail(`code de sortie attendu 3, obtenu ${failing.data?.exitcode}`);
  }
  console.log("ok");

  console.log("\n  Socle guest agent validé.\n");
}

main().catch((err) => fail(String(err?.stack ?? err)));
