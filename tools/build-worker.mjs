import { build } from "esbuild";

await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/worker.cjs",
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
