import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const projectDir = process.cwd();
loadEnvConfig(projectDir, false);

const prismaBin = path.join(
  projectDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);

const prismaArgs = process.argv.slice(2);

if (prismaArgs.length === 0) {
  console.error("Usage: node scripts/prisma-with-env.mjs <prisma-args>");
  process.exit(1);
}

const result = spawnSync(prismaBin, prismaArgs, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
