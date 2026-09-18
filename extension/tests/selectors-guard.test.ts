import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "../src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else if (name.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

test("querySelector só existe em whatsappSelectors.ts", () => {
  const files = walk(src);
  const offenders: string[] = [];
  for (const file of files) {
    if (file.replaceAll("\\", "/").endsWith("selectors/whatsappSelectors.ts")) continue;
    const text = readFileSync(file, "utf8");
    if (/querySelector(All)?\s*\(/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
