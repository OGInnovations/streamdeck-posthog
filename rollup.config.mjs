import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

import { identity, makeDevVariant, releaseManifest } from "./tools/make-variant.mjs";

// SD_VARIANT=dev builds the locally linked development plugin; anything else
// builds the release plugin that ships to the Marketplace.
const variant = process.env.SD_VARIANT === "dev" ? "dev" : "release";
const { uuid, isDev, sdPlugin } = identity(variant);
const isWatching = !!process.env.ROLLUP_WATCH;

/**
 * The plugin's identity, supplied to the bundle as a virtual module so the
 * action registers the UUID that matches the manifest it was built for. A
 * virtual module keeps this out of the source tree and out of version control.
 */
function pluginIdentity() {
	const id = "virtual:identity";
	return {
		name: "plugin-identity",
		resolveId: (source) => (source === id ? id : null),
		load: (source) =>
			source === id
				? `export const PLUGIN_UUID = ${JSON.stringify(uuid)};\nexport const IS_DEV = ${isDev};\n`
				: null,
	};
}

/** Regenerates the development variant, and watches the assets it copies. */
function devVariant() {
	return {
		name: "dev-variant",
		buildStart() {
			const release = releaseManifest();
			this.addWatchFile(path.join(release.path, "manifest.json"));
			this.addWatchFile(path.join(release.path, "ui"));
			if (isDev) {
				makeDevVariant();
			}
		},
	};
}

/** @type {import('rollup').RollupOptions} */
export default {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		},
	},
	plugins: [
		devVariant(),
		pluginIdentity(),
		// outDir must match the variant being built, overriding tsconfig's default.
		typescript({
			outDir: `${sdPlugin}/bin`,
			sourceMap: isWatching,
			mapRoot: isWatching ? "./" : undefined,
		}),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
	],
};
