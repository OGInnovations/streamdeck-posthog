/**
 * Generates the plugin's artwork.
 *
 * Everything is authored here as SVG rather than committed as opaque binaries,
 * so the shapes stay editable and every size stays consistent. Elgato's
 * guidelines ask for SVG where Stream Deck accepts it — category icons, action
 * icons and key images — and require PNG for the plugin icon, at 256x256 and
 * 512x512.
 *
 * Two quirks of the rasteriser used for the PNG shape how this is written: it
 * ignores a `scale()` transform, so coordinates are emitted already scaled to
 * each target size, and it only renders SVG at the full canvas size from 512
 * pixels upwards — below that it draws the artwork smaller and pads the rest
 * with white. The icon is therefore rendered at 512 and reduced to 256.
 * Regenerating the artwork needs macOS `qlmanage`; the generated files are
 * committed, so building the plugin does not.
 *
 * Usage: node tools/make-artwork.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decode, downscale, encode } from "./png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UUID = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).streamDeck.uuid;
const IMGS = join(ROOT, `${UUID}.sdPlugin`, "imgs");

/**
 * The plugin's mark: a rising line with a live point at its head, which is
 * what a key actually shows. Defined on a 24x24 grid and scaled per size.
 */
const MARK = [
	[3.6, 16.2],
	[8.8, 11.0],
	[12.7, 13.8],
	[18.6, 7.0],
];

/** Baseline the area fill closes against, on the same 24x24 grid. */
const BASELINE = 18.8;

/** Mint, tying the icon to the rising-trend colour the keys already use. */
const MINT = "#34D399";

/**
 * Draws the mark at a given size.
 * @param size Edge length of the canvas, in pixels.
 * @param color Stroke and point colour.
 * @param options.weight Stroke width on the 24x24 grid.
 * @param options.area Whether to shade the area beneath the line.
 * @returns SVG markup.
 */
function mark(size, color, { weight = 2.4, area = false } = {}) {
	const k = size / 24;
	const at = ([x, y]) => `${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`;
	const line = `M${MARK.map(at).join(" L")}`;
	const head = MARK[MARK.length - 1];
	const stroke = (weight * k).toFixed(2);

	// A low opacity keeps the area reading as shading under the line rather
	// than a filled block.
	const shading = area
		? `<path d="${line} L${at([head[0], BASELINE])} L${at([MARK[0][0], BASELINE])} Z"` +
			` fill="${color}" opacity="0.13"/>`
		: "";

	return (
		shading +
		`<path d="${line}" fill="none" stroke="${color}" stroke-width="${stroke}"` +
		` stroke-linecap="round" stroke-linejoin="round"/>` +
		`<circle cx="${(head[0] * k).toFixed(2)}" cy="${(head[1] * k).toFixed(2)}"` +
		` r="${(weight * 0.85 * k).toFixed(2)}" fill="${color}"/>`
	);
}

/**
 * Wraps markup in an SVG whose viewBox matches its pixel size.
 * @param size Edge length, in pixels.
 * @param body Artwork markup, in pixel coordinates.
 * @returns SVG markup.
 */
function svg(size, body) {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"` +
		` viewBox="0 0 ${size} ${size}">${body}</svg>\n`
	);
}

/** A top-to-bottom gradient background filling the canvas. */
function gradient(size, id, from, to) {
	return (
		`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
		`<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
		`</linearGradient></defs>` +
		`<rect width="${size}" height="${size}" fill="url(#${id})"/>`
	);
}

/** The plugin icon, shown on the Marketplace listing and in Stream Deck. */
function pluginIcon(size) {
	const k = size / 24;
	return svg(
		size,
		gradient(size, "bg", "#23232B", "#101014") +
			// A faint rule gives the mark something to sit on.
			`<rect x="${(3.6 * k).toFixed(2)}" y="${(BASELINE * k).toFixed(2)}"` +
			` width="${(15 * k).toFixed(2)}" height="${Math.max(1, 0.22 * k).toFixed(2)}"` +
			` fill="#FFFFFF" opacity="0.16"/>` +
			mark(size, MINT, { weight: 2.1, area: true }),
	);
}

/** Action and category icons: monochrome white on transparent, per the guidelines. */
function monochromeIcon(size) {
	return svg(size, mark(size, "#FFFFFF", { weight: 2.4 }));
}

/** The key's default image, shown before a key has been configured. */
function keyImage(size) {
	return svg(size, gradient(size, "key", "#1C1C21", "#121216") + mark(size, MINT, { weight: 2.1, area: true }));
}

/**
 * Rasterises an SVG, checking that the rasteriser filled the canvas rather
 * than padding it.
 * @param source SVG markup at that size.
 * @param size Edge length the SVG declares; must be at least 512.
 * @returns The decoded image.
 */
function rasterise(source, size) {
	const scratch = mkdtempSync(join(tmpdir(), "sd-artwork-"));
	try {
		const svgPath = join(scratch, "icon.svg");
		writeFileSync(svgPath, source);
		execFileSync("qlmanage", ["-t", "-s", String(size), "-o", scratch, svgPath], { stdio: "ignore" });

		const image = decode(readFileSync(join(scratch, "icon.svg.png")));
		if (image.width !== size || image.height !== size) {
			throw new Error(`expected ${size}x${size}, rasteriser produced ${image.width}x${image.height}`);
		}
		// The icon is full-bleed, so a white corner means the canvas was padded.
		for (const [x, y] of [
			[1, 1],
			[size - 2, 1],
			[1, size - 2],
			[size - 2, size - 2],
		]) {
			const at = (y * size + x) * 4;
			if (image.rgba[at] > 200 && image.rgba[at + 1] > 200 && image.rgba[at + 2] > 200) {
				throw new Error(`rasteriser padded the canvas: corner ${x},${y} is white`);
			}
		}
		return image;
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

const written = [];

function write(relative, contents) {
	const target = join(IMGS, relative);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, contents);
	written.push(relative);
}

// Vector artwork, used wherever Stream Deck accepts SVG. Authored at the size
// the manifest uses it, so the stroke weights are tuned for that size.
write("plugin/category-icon.svg", monochromeIcon(56));
write("actions/insight/icon.svg", monochromeIcon(40));
write("actions/insight/key.svg", keyImage(144));

// The plugin icon must be PNG, at 256 and 512. Rendered once at 512 and
// reduced, since the rasteriser is only accurate at that size and above.
const rendered = rasterise(pluginIcon(512), 512);
for (const [image, name] of [
	[downscale(rendered, 2), "plugin/marketplace.png"],
	[rendered, "plugin/marketplace@2x.png"],
]) {
	write(name, encode(image.width, image.height, image.rgba));
	written[written.length - 1] = `${name} (${image.width}x${image.height})`;
}

// The Maker Console's listing has its own app-icon upload, separate from the
// icon inside the plugin bundle, and recommends 288x288. Rendered at 576 so
// the rasteriser is accurate, then halved to land exactly on 288.
const listingIcon = downscale(rasterise(pluginIcon(576), 576), 2);
const listingTarget = join(ROOT, "docs", "marketplace", "app-icon.png");
mkdirSync(dirname(listingTarget), { recursive: true });
writeFileSync(listingTarget, encode(listingIcon.width, listingIcon.height, listingIcon.rgba));
written.push(`docs/marketplace/app-icon.png (${listingIcon.width}x${listingIcon.height})`);

// The SVG the PNGs came from, kept as the editable source but outside the
// .sdPlugin directory so it is not shipped inside the plugin.
const source = join(ROOT, "docs", "artwork", "plugin-icon.svg");
mkdirSync(dirname(source), { recursive: true });
writeFileSync(source, pluginIcon(512));
written.push("docs/artwork/plugin-icon.svg");

for (const file of written) {
	console.log(file);
}
