/**
 * Copy a fresh build into docs/, which is what GitHub Pages actually serves.
 *
 * Pages has no build step here: it uploads docs/ as it finds it. So a source
 * change that never reaches docs/ changes nothing on the live site, which is a
 * very easy way to spend an afternoon wondering why.
 */
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const from = resolve(root, "dist-aruba");
const to = resolve(root, "docs");

await rm(resolve(to, "assets"), { recursive: true, force: true });
await cp(resolve(from, "assets"), resolve(to, "assets"), { recursive: true });
await cp(resolve(from, "index.html"), resolve(to, "index.html"));
await cp(resolve(from, "index.html"), resolve(to, "404.html"));

/**
 * Bump the offline cache, or a returning visitor keeps the old app forever.
 */
const swPath = resolve(to, "sw.js");
const sw = await readFile(swPath, "utf8");
const bumped = sw.replace(/const CACHE = "mads-hexagon-v(\d+)";/, (_m, n) => `const CACHE = "mads-hexagon-v${Number(n) + 1}";`);
if (bumped === sw) console.warn("publish-docs: could not find the cache version in sw.js");
await writeFile(swPath, bumped);

console.log("docs/ aggiornato — commit e push per pubblicare su GitHub Pages");
