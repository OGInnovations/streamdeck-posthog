/**
 * Generates the development variant of the plugin.
 *
 * Stream Deck identifies a plugin by its UUID, and the `.sdPlugin` directory
 * must be named after it, so a locally linked build and a Marketplace install
 * cannot share one identifier — installing one would displace the other. The
 * development variant therefore carries its own UUID, derived from the release
 * manifest rather than maintained separately, so the two can be installed side
 * by side and there is only ever one manifest to edit.
 *
 * The generated directory is a build artifact and is not committed.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Suffix appended to the release UUID to identify the development build. */
export const DEV_SUFFIX = ".dev";

/** Reads the release manifest, which is the single source of truth. */
export function releaseManifest() {
	const uuid = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).streamDeck.uuid;
	const path = join(ROOT, `${uuid}.sdPlugin`);
	return { uuid, path, manifest: JSON.parse(readFileSync(join(path, "manifest.json"), "utf8")) };
}

/**
 * Resolves the identity of a build variant.
 * @param variant Either `release` or `dev`.
 * @returns The variant's UUID and `.sdPlugin` directory.
 */
export function identity(variant) {
	const { uuid } = releaseManifest();
	const variantUuid = variant === "dev" ? `${uuid}${DEV_SUFFIX}` : uuid;
	return {
		uuid: variantUuid,
		isDev: variant === "dev",
		sdPlugin: `${variantUuid}.sdPlugin`,
	};
}

/**
 * Writes the development `.sdPlugin` directory: the release assets, plus a
 * manifest rewritten onto the development UUID and labelled so the two are
 * never confused in the Stream Deck action list.
 * @returns The generated directory's path, relative to the project root.
 */
export function makeDevVariant() {
	const release = releaseManifest();
	const dev = identity("dev");
	const target = join(ROOT, dev.sdPlugin);

	// Rebuilt from scratch so a renamed or deleted asset does not linger.
	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });
	for (const asset of ["imgs", "ui"]) {
		cpSync(join(release.path, asset), join(target, asset), { recursive: true });
	}

	const manifest = structuredClone(release.manifest);
	manifest.UUID = dev.uuid;
	manifest.Name = `${manifest.Name} (Dev)`;
	manifest.Category = `${manifest.Category} (Dev)`;
	manifest.Description = `Development build. ${manifest.Description}`;
	// Action identifiers must be unique across every installed plugin, so they
	// move onto the development UUID with the plugin itself.
	manifest.Actions = manifest.Actions.map((action) => ({
		...action,
		UUID: action.UUID.replace(release.uuid, dev.uuid),
		Name: `${action.Name} (Dev)`,
	}));

	writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	return dev.sdPlugin;
}

// Allow generating the variant on its own: `node tools/make-variant.mjs`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	console.log(makeDevVariant());
}
