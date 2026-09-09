/**
 * Generates the Marketplace listing images.
 *
 * Elgato asks for a 1920x960 PNG thumbnail and at least three gallery images
 * at the same size. The keys shown are produced by the plugin's own renderer
 * rather than mocked up, so the listing shows exactly what a key looks like.
 *
 * Two rasteriser quirks shape the approach: it only renders SVG at full size
 * from 512 pixels upwards, and it pads non-square artwork onto a square
 * canvas. Each image is therefore authored as a 1920x1920 square with the
 * design in the centre band, rendered, then cropped back to 1920x960.
 *
 * Usage: node --import tsx tools/make-listing.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cropRows, decode } from "./png.mjs";
import { renderSetup, renderValue, type KeyContent, type KeyStyle } from "../src/render/key-image.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "marketplace");

const WIDTH = 1920;
const HEIGHT = 960;
/** The design sits in the centre band of a square canvas; see the note above. */
const TOP = (WIDTH - HEIGHT) / 2;

const FONTS = "-apple-system, 'SF Pro Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const INK = "#F5F5F7";
const MUTED = "#9A9AA6";
const GROUND = "#0E0E11";

let keyCounter = 0;

/**
 * Places a rendered key on the canvas.
 *
 * The renderer returns a complete SVG document, which is inlined as a nested
 * `<svg>`. Its gradient identifiers are made unique first, because several
 * keys on one canvas would otherwise all resolve to the first key's gradient.
 * @param dataUri A data URI from the renderer.
 * @param x Left edge, in canvas units.
 * @param y Top edge, in canvas units.
 * @param size Rendered edge length, in canvas units.
 * @returns SVG markup.
 */
function key(dataUri: string, x: number, y: number, size: number): string {
	const svg = Buffer.from(dataUri.split(",")[1]!, "base64").toString("utf8");
	const suffix = `k${keyCounter++}`;
	const scoped = svg
		.replace(/id="([\w-]+)"/g, (_, id: string) => `id="${id}-${suffix}"`)
		.replace(/url\(#([\w-]+)\)/g, (_, id: string) => `url(#${id}-${suffix})`);

	const inner = scoped.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
	// Rounded to read as a physical key, with a hairline to lift it off the ground.
	return (
		`<g><clipPath id="clip-${suffix}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.14}"/></clipPath>` +
		`<g clip-path="url(#clip-${suffix})">` +
		`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 144 144">${inner}</svg>` +
		`</g>` +
		`<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.14}" fill="none"` +
		` stroke="#FFFFFF" stroke-opacity="0.09" stroke-width="2"/></g>`
	);
}

function text(
	content: string,
	x: number,
	y: number,
	{ size = 40, weight = 600, fill = INK, anchor = "start", spacing = 0 } = {},
): string {
	const escaped = content
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return (
		`<text x="${x}" y="${y}" fill="${fill}" font-family="${FONTS}" font-size="${size}"` +
		` font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}">${escaped}</text>`
	);
}

/** Wraps a design into the square canvas the rasteriser needs. */
function canvas(body: string): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${WIDTH}" viewBox="0 0 ${WIDTH} ${WIDTH}">` +
		`<rect width="${WIDTH}" height="${WIDTH}" fill="${GROUND}"/>` +
		`<g transform="translate(0 ${TOP})">${body}</g>` +
		`</svg>\n`
	);
}

const TREND = [14, 19, 17, 26, 24, 33, 30, 39, 36, 48];
const FALLING = [48, 44, 46, 37, 39, 31, 33, 24, 26, 18];

function valueKey(content: KeyContent, style: KeyStyle = {}): string {
	return renderValue(content, { theme: "dark", ...style });
}

/** The thumbnail: what the plugin is, and what it looks like. */
function thumbnail(): string {
	const keys = [
		valueKey({ value: "18.4k", caption: "Signups", points: TREND, delta: 0.124 }),
		valueKey({ value: "1,284", caption: "Sessions", points: TREND }, { theme: "midnight" }),
		valueKey({ value: "0.4%", caption: "Error rate", points: FALLING, delta: -0.33 }, { theme: "mint", invertTrend: true }),
		valueKey({ value: "99.98%", caption: "Uptime", points: TREND }, { theme: "light" }),
	];
	const size = 258;
	const gap = 36;
	const total = keys.length * size + (keys.length - 1) * gap;
	const left = (WIDTH - total) / 2;

	return (
		text("Live Metrics for PostHog", WIDTH / 2, 240, { size: 82, weight: 700, anchor: "middle" }) +
		text("Your PostHog insights, live on every key", WIDTH / 2, 312, {
			size: 40,
			weight: 500,
			fill: MUTED,
			anchor: "middle",
		}) +
		keys.map((k, i) => key(k, left + i * (size + gap), 420, size)).join("") +
		text("Refreshes automatically · Press a key to update now", WIDTH / 2, 800, {
			size: 32,
			weight: 500,
			fill: MUTED,
			anchor: "middle",
		})
	);
}

/** Gallery: what a single key shows. */
function anatomy(): string {
	const size = 420;
	const x = 190;
	const y = 270;
	const rows: [string, string][] = [
		["Caption", "the insight's name, or your own label"],
		["Value", "scaled to fill the key, abbreviated if you like"],
		["Change", "against the previous point, with direction"],
		["Sparkline", "the insight's own series over time"],
	];

	return (
		text("Everything a glance needs", 190, 150, { size: 64, weight: 700 }) +
		key(valueKey({ value: "18.4k", caption: "Signups", points: TREND, delta: 0.124 }), x, y, size) +
		rows
			.map(
				([label, detail], i) =>
					text(label, 740, 330 + i * 118, { size: 40, weight: 700 }) +
					text(detail, 740, 378 + i * 118, { size: 32, weight: 500, fill: MUTED }),
			)
			.join("")
	);
}

/** Gallery: the themes. */
function themes(): string {
	const entries: [string, KeyStyle][] = [
		["Dark", { theme: "dark" }],
		["Light", { theme: "light" }],
		["Orange", { theme: "posthog" }],
		["Midnight", { theme: "midnight" }],
		["Mint", { theme: "mint" }],
	];
	const size = 240;
	const gap = 42;
	const total = entries.length * size + (entries.length - 1) * gap;
	const left = (WIDTH - total) / 2;

	return (
		text("Five themes, or your own colours", WIDTH / 2, 190, { size: 64, weight: 700, anchor: "middle" }) +
		entries
			.map(([label, style], i) => {
				const x = left + i * (size + gap);
				return (
					key(valueKey({ value: "18.4k", caption: "Signups", points: TREND, delta: 0.124 }, style), x, 320, size) +
					text(label, x + size / 2, 660, { size: 34, weight: 600, fill: MUTED, anchor: "middle" })
				);
			})
			.join("") +
		text("Sparkline, caption and change indicator can each be turned off", WIDTH / 2, 790, {
			size: 32,
			weight: 500,
			fill: MUTED,
			anchor: "middle",
		})
	);
}

/** Gallery: how a key is set up. */
function setup(): string {
	const size = 260;
	const steps: [string, string, string][] = [
		["1", "Paste an insight's address", "It carries the host, project and insight"],
		["2", "Add a personal API key", "Entered once, shared by every key"],
		["3", "Watch it update", "Automatically, or on a press"],
	];

	return (
		text("Set up in three steps", WIDTH / 2, 170, { size: 64, weight: 700, anchor: "middle" }) +
		steps
			.map(([number, title, detail], i) => {
				const x = 150 + i * 560;
				return (
					text(number, x, 320, { size: 44, weight: 700, fill: "#34D399" }) +
					text(title, x, 392, { size: 38, weight: 700 }) +
					text(detail, x, 444, { size: 28, weight: 500, fill: MUTED })
				);
			})
			.join("") +
		key(renderSetup("Pick insight", { theme: "dark" }), 400, 540, size) +
		text("→", 730, 700, { size: 60, weight: 400, fill: MUTED, anchor: "middle" }) +
		key(valueKey({ value: "18.4k", caption: "Signups", points: TREND, delta: 0.124 }), 830, 540, size) +
		text("Not affiliated with or endorsed by PostHog", WIDTH / 2, 900, {
			size: 26,
			weight: 500,
			fill: "#6E6E7A",
			anchor: "middle",
		})
	);
}

/**
 * Rasterises a design and crops it to the listing size.
 * @param name Output file name, without extension.
 * @param body The design's markup.
 */
function render(name: string, body: string): void {
	const scratch = mkdtempSync(join(tmpdir(), "sd-listing-"));
	try {
		const svgPath = join(scratch, `${name}.svg`);
		writeFileSync(svgPath, canvas(body));
		execFileSync("qlmanage", ["-t", "-s", String(WIDTH), "-o", scratch, svgPath], { stdio: "ignore" });

		const image = decode(readFileSync(join(scratch, `${name}.svg.png`)));
		if (image.width !== WIDTH || image.height !== WIDTH) {
			throw new Error(`expected ${WIDTH}x${WIDTH}, rasteriser produced ${image.width}x${image.height}`);
		}
		mkdirSync(OUT, { recursive: true });
		writeFileSync(join(OUT, `${name}.png`), cropRows(image, TOP, HEIGHT));
		console.log(`docs/marketplace/${name}.png (${WIDTH}x${HEIGHT})`);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

render("thumbnail", thumbnail());
render("gallery-1-anatomy", anatomy());
render("gallery-2-themes", themes());
render("gallery-3-setup", setup());
