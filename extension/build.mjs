import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const assets = join(root, "assets");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c >>> 0) >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const crc = crc32(Buffer.concat([t, data]));
  return Buffer.concat([u32be(data.length), t, data, u32be(crc)]);
}

function makePng(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      const edge = x < size * 0.12 || y < size * 0.12 || x > size * 0.88 || y > size * 0.88;
      const bar = x > size * 0.28 && x < size * 0.42 && y > size * 0.22 && y < size * 0.78;
      const top = x > size * 0.28 && x < size * 0.72 && y > size * 0.22 && y < size * 0.36;
      if (edge) {
        raw[i] = 15;
        raw[i + 1] = 23;
        raw[i + 2] = 32;
      } else if (bar || top) {
        raw[i] = 233;
        raw[i + 1] = 237;
        raw[i + 2] = 239;
      } else {
        raw[i] = 0;
        raw[i + 1] = 168;
        raw[i + 2] = 132;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function writeIcons() {
  mkdirSync(assets, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    writeFileSync(join(assets, `icon${size}.png`), makePng(size));
  }
}

async function bundle() {
  mkdirSync(dist, { recursive: true });
  writeIcons();
  const common = {
    bundle: true,
    sourcemap: false,
    target: "chrome114",
    logLevel: "info",
  };
  await Promise.all([
    esbuild.build({
      ...common,
      entryPoints: [join(root, "src/background/index.ts")],
      outfile: join(dist, "background.js"),
      format: "esm",
      platform: "browser",
    }),
    esbuild.build({
      ...common,
      entryPoints: [join(root, "src/content/index.ts")],
      outfile: join(dist, "content.js"),
      format: "iife",
      platform: "browser",
    }),
    esbuild.build({
      ...common,
      entryPoints: [join(root, "src/popup/index.ts")],
      outfile: join(dist, "popup.js"),
      format: "iife",
      platform: "browser",
    }),
    esbuild.build({
      ...common,
      entryPoints: [join(root, "src/sidepanel/index.ts")],
      outfile: join(dist, "sidepanel.js"),
      format: "iife",
      platform: "browser",
    }),
  ]);
  copyFileSync(join(root, "src/popup/index.html"), join(dist, "popup.html"));
  copyFileSync(join(root, "src/sidepanel/index.html"), join(dist, "sidepanel.html"));
  copyFileSync(join(root, "src/ui/panel.css"), join(dist, "panel.css"));
}

async function test() {
  const outdir = join(root, "tmp-tests");
  mkdirSync(outdir, { recursive: true });
  await esbuild.build({
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outdir,
    entryPoints: [
      join(root, "tests/phones.test.ts"),
      join(root, "tests/readings.test.ts"),
      join(root, "tests/dedupe.test.ts"),
      join(root, "tests/dates.test.ts"),
      join(root, "tests/origem.test.ts"),
      join(root, "tests/selectors-guard.test.ts"),
    ],
    external: ["node:test", "node:assert/strict", "node:fs", "node:path", "node:url"],
  });
  const files = readdirSync(outdir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => join(outdir, f));
  const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
}

const arg = process.argv[2];
if (arg === "--test") {
  await test();
} else {
  await bundle();
  if (arg === "--with-test") await test();
}
