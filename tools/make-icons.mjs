/**
 * Generates every icon the manifest references, at the exact sizes Stream Deck
 * requires. Re-runnable: `node tools/make-icons.mjs`.
 *
 * The artwork is a simple bar-chart glyph on PostHog orange, drawn pixel by
 * pixel so the repo carries no opaque binaries.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ORANGE = [0xf5, 0x4e, 0x00];
const WHITE = [0xff, 0xff, 0xff];
/** Matches the dark theme the plugin renders keys with. */
const DARK = [0x1c, 0x1c, 0x21];

function crc32(buf) {
	let c = ~0;
	for (const byte of buf) {
		c ^= byte;
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

/** Encodes RGBA pixel data (width * height * 4) as a PNG buffer. */
function encodePng(width, height, rgba) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type: RGBA
	const raw = Buffer.alloc(height * (width * 4 + 1));
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0; // filter: none
		rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/**
 * Draws the glyph. `transparentBackground` is used for action icons, which sit
 * on Stream Deck's own chrome and are expected to be monochrome-on-transparent.
 */
function draw(size, { transparentBackground, dark }) {
	const rgba = Buffer.alloc(size * size * 4);
	const bg = transparentBackground ? [0, 0, 0, 0] : dark ? [...DARK, 0xff] : [...ORANGE, 0xff];
	const fg = dark ? [...ORANGE, 0xff] : [...WHITE, 0xff];

	const set = (x, y, [r, g, b, a]) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return;
		const i = (y * size + x) * 4;
		rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
	};

	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, bg);

	// Three bars of increasing height, inset from the edges.
	const pad = Math.max(1, Math.round(size * 0.22));
	const inner = size - pad * 2;
	const gap = Math.max(1, Math.round(inner * 0.12));
	const barW = Math.max(1, Math.round((inner - gap * 2) / 3));
	const heights = [0.4, 0.7, 1.0];
	for (let b = 0; b < 3; b++) {
		const h = Math.max(1, Math.round(inner * heights[b]));
		const x0 = pad + b * (barW + gap);
		for (let x = x0; x < x0 + barW; x++) {
			for (let y = pad + inner - h; y < pad + inner; y++) set(x, y, fg);
		}
	}
	return encodePng(size, size, rgba);
}

const targets = [
	// Marketplace / plugin icon.
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/plugin/marketplace.png", 288, false],
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/plugin/marketplace@2x.png", 576, false],
	// Category icon in the actions list.
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/plugin/category-icon.png", 28, true],
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/plugin/category-icon@2x.png", 56, true],
	// Action icon in the actions list.
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/actions/insight/icon.png", 20, true],
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/actions/insight/icon@2x.png", 40, true],
	// Default key image, shown before a key is configured; matches the dark theme.
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/actions/insight/key.png", 72, false, true],
	["io.ogin.streamdeck.posthog.sdPlugin/imgs/actions/insight/key@2x.png", 144, false, true],
];

for (const [file, size, transparentBackground, dark = false] of targets) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, draw(size, { transparentBackground, dark }));
	console.log(`${file} (${size}x${size})`);
}
