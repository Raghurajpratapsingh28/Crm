import { spawn } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: with-env.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(command, args, { stdio: "inherit", env: process.env, shell: true });
child.on("exit", (code) => process.exit(code ?? 1));
