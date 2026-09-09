/**
 * Checks that a tag agrees with the version the project declares.
 *
 * The version lives in two places — `package.json` and the manifest's
 * four-part `Version` — and the Marketplace rejects a re-upload of a version it
 * has already seen. A tag that disagrees with either means the packaged plugin
 * is not what the tag says it is, which is only discovered at upload.
 *
 * Usage: node tools/check-version.mjs 1.1.0
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const expected = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(expected ?? "")) {
	console.error("Usage: node tools/check-version.mjs <major.minor.patch>");
	process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, `${pkg.streamDeck.uuid}.sdPlugin`, "manifest.json"), "utf8"));

const problems = [];
if (pkg.version !== expected) {
	problems.push(`package.json declares ${pkg.version}, expected ${expected}`);
}
if (manifest.Version !== `${expected}.0`) {
	problems.push(`manifest declares ${manifest.Version}, expected ${expected}.0`);
}

if (problems.length) {
	console.error(`Version mismatch:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
	process.exit(1);
}

console.log(`${expected} agrees across package.json and the manifest (${manifest.Version}).`);
