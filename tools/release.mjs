/**
 * Prepares a release.
 *
 * Every Marketplace submission needs its version bumped in two places, its
 * artwork and listing images regenerated, and release notes covering what
 * changed. Doing that by hand invites a version that disagrees with itself, or
 * a listing that shows features from the previous release. This does all of it
 * from one version number, then prints the commit and tag commands.
 *
 * Tagging matters beyond tidiness: the notes for a release are drafted from the
 * commits since the previous tag, so an untagged release leaves the next one
 * with no idea where it started.
 *
 * Usage: node tools/release.mjs 1.1.0
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
	console.error("Usage: node tools/release.mjs <major.minor.patch>\n  e.g. node tools/release.mjs 1.1.0");
	process.exit(1);
}

/** Runs a command, returning its output — empty when stdio is not captured. */
const run = (command, args, options = {}) =>
	execFileSync(command, args, { cwd: ROOT, encoding: "utf8", ...options })?.trim() ?? "";

/** Refuses to build a release out of a dirty tree, which would be unreproducible. */
const dirty = run("git", ["status", "--porcelain"]);
if (dirty && !process.env.ALLOW_DIRTY) {
	console.error("Working tree is not clean. Commit or stash first, or set ALLOW_DIRTY=1.\n");
	console.error(dirty);
	process.exit(1);
}

const pkgPath = join(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const uuid = pkg.streamDeck.uuid;
const manifestPath = join(ROOT, `${uuid}.sdPlugin`, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (pkg.version === version) {
	console.error(`Version is already ${version}. The Marketplace rejects a re-upload of a version it has seen.`);
	process.exit(1);
}

// The previous tag bounds the release notes; the first release has none.
let previousTag = null;
try {
	previousTag = run("git", ["describe", "--tags", "--abbrev=0"]);
} catch {
	// No tags yet.
}

const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
const subjects = run("git", ["log", "--format=%s", range])
	.split("\n")
	.filter(Boolean)
	// Release commits and tooling churn are not news to a plugin's users.
	.filter((subject) => !/^Release \d/.test(subject));

console.log(`Preparing ${version}${previousTag ? ` (since ${previousTag})` : ""}\n`);

// 1. Versions. The manifest uses a four-part version; the Marketplace requires
//    it to increase for every submission.
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
manifest.Version = `${version}.0`;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
console.log(`  package.json  ${version}`);
console.log(`  manifest      ${manifest.Version}`);

// 2. Artwork and listing images, so the listing never advertises the previous
//    release's feature set.
run("node", ["tools/make-artwork.mjs"], { stdio: "ignore" });
run("node", ["--import", "tsx", "tools/make-listing.ts"], { stdio: "ignore" });
console.log("  artwork       regenerated");
console.log("  listing art   regenerated");

// 3. Release notes, drafted from the commits in range for editing by hand.
const notesPath = join(ROOT, "docs", "marketplace", "releases", `${version}.md`);
const notes = [
	`# ${version}`,
	"",
	"<!-- Edit before submitting: these are drafted from commit subjects, which",
	"     describe changes to a reader of the code, not to a plugin's user. -->",
	"",
	...subjects.map((subject) => `- ${subject}`),
	"",
	"---",
	"",
	`Manifest version \`${manifest.Version}\`. Drafted from ${
		previousTag ? `\`${previousTag}..HEAD\`` : "the full history"
	} on ${new Date().toISOString().slice(0, 10)}.`,
	"",
].join("\n");
writeFileSync(notesPath, notes);
console.log(`  notes         docs/marketplace/releases/${version}.md (${subjects.length} commits)`);

// 4. Validate and package.
run("npm", ["run", "build"], { stdio: "ignore" });
const validation = run("npx", ["streamdeck", "validate", `${uuid}.sdPlugin`]);
if (/error/i.test(validation)) {
	console.error(`\nValidation failed:\n${validation}`);
	process.exit(1);
}
console.log(`  validate      ${/warning/i.test(validation) ? "passed with warnings" : "clean"}`);

run("npm", ["run", "pack"], { stdio: "ignore" });
console.log(`  package       dist/${uuid}.streamDeckPlugin`);

console.log(`
Next:

  1. Edit docs/marketplace/releases/${version}.md into user-facing notes.
  2. Commit and tag:

     git add -A
     git commit -m "Release ${version}"
     git tag -a v${version} -m "${version}"
     git push --follow-tags

  3. Upload dist/${uuid}.streamDeckPlugin to Maker Console, with the notes
     from step 1 and the images in docs/marketplace/.
`);
