/**
 * Identity of the build, supplied by rollup as a virtual module (see
 * `rollup.config.mjs`). The development and release builds carry different
 * UUIDs so both can be installed at once.
 */
declare module "virtual:identity" {
	/** The plugin's UUID, matching the manifest this bundle was built for. */
	export const PLUGIN_UUID: string;
	/** Whether this is the locally linked development build. */
	export const IS_DEV: boolean;
}
