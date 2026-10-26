// Creates the local .env files from their .env.example templates — only when
// they don't exist yet, so it never overwrites values you've already filled in.
// Cross-platform on purpose (plain Node, no bash).
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = ["api", "web"];

for (const dir of targets) {
  const example = resolve(root, dir, ".env.example");
  const env = resolve(root, dir, ".env");
  if (!existsSync(example)) continue;
  if (existsSync(env)) {
    console.log(`  kept    ${dir}/.env (already exists)`);
    continue;
  }
  copyFileSync(example, env);
  console.log(`  created ${dir}/.env  <- fill in the values`);
}
