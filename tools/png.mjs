/**
 * Minimal PNG decode and encode, enough for the artwork pipeline.
 *
 * The plugin's raster images are rasterised from SVG by macOS `qlmanage`,
 * which only produces square thumbnails. Non-square artwork is therefore
 * authored on a square canvas and cropped here, which keeps the geometry
 * deterministic rather than depending on how the rasteriser pads.
 */
import { deflateSync, inflateSync } from "node:zlib";

function crc32(buf) {
	let c = ~0;
	for (const byte of buf) {
		c ^= byte;
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

function chunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

/**
 * Encodes RGBA pixels as a PNG.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @param rgba Pixel data, four bytes per pixel.
 * @returns The PNG file contents.
 */
export function encode(width, height, rgba) {
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

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * Decodes a PNG to RGBA pixels.
 * @param file The PNG file contents.
 * @returns The image's width, height and RGBA pixel data.
 */
export function decode(file) {
	let pos = 8;
	let width, height, colourType;
	const idat = [];

	while (pos < file.length) {
		const length = file.readUInt32BE(pos);
		const type = file.subarray(pos + 4, pos + 8).toString("ascii");
		const body = file.subarray(pos + 8, pos + 8 + length);
		if (type === "IHDR") {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			if (body[8] !== 8) throw new Error(`unsupported bit depth ${body[8]}`);
			colourType = body[9];
			if (body[12] !== 0) throw new Error("interlaced PNGs are not supported");
		} else if (type === "IDAT") {
			idat.push(body);
		}
		pos += 12 + length;
	}

	const channels = CHANNELS[colourType];
	if (!channels) throw new Error(`unsupported colour type ${colourType}`);

	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	const lines = Buffer.alloc(height * stride);
	let previous = Buffer.alloc(stride);
	let read = 0;

	for (let y = 0; y < height; y++) {
		const filter = raw[read++];
		const line = Buffer.from(raw.subarray(read, read + stride));
		read += stride;

		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? line[i - channels] : 0;
			const b = previous[i];
			const c = i >= channels ? previous[i - channels] : 0;
			switch (filter) {
				case 1:
					line[i] = (line[i] + a) & 0xff;
					break;
				case 2:
					line[i] = (line[i] + b) & 0xff;
					break;
				case 3:
					line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
					break;
				case 4: {
					const p = a + b - c;
					const pa = Math.abs(p - a);
					const pb = Math.abs(p - b);
					const pc = Math.abs(p - c);
					line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
					break;
				}
			}
		}
		line.copy(lines, y * stride);
		previous = line;
	}

	// Normalise every colour type to RGBA.
	const rgba = Buffer.alloc(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const source = lines.subarray(i * channels, (i + 1) * channels);
		const target = i * 4;
		if (channels === 4) {
			source.copy(rgba, target);
		} else if (channels === 3) {
			source.copy(rgba, target);
			rgba[target + 3] = 0xff;
		} else if (channels === 2) {
			rgba.fill(source[0], target, target + 3);
			rgba[target + 3] = source[1];
		} else {
			rgba.fill(source[0], target, target + 3);
			rgba[target + 3] = 0xff;
		}
	}
	return { width, height, rgba };
}

/**
 * Crops a horizontal band out of an image.
 * @param image A decoded image.
 * @param top First row to keep.
 * @param height Number of rows to keep.
 * @returns The cropped PNG file contents.
 */
export function cropRows({ width, height: full, rgba }, top, height) {
	if (top < 0 || top + height > full) {
		throw new Error(`crop ${top}..${top + height} outside image of height ${full}`);
	}
	return encode(width, height, rgba.subarray(top * width * 4, (top + height) * width * 4));
}

/**
 * Downscales an image by an integer factor, averaging each block of source
 * pixels. Used because the rasteriser only renders SVG accurately at 512
 * pixels and above, so smaller artwork is rendered large and reduced here.
 * @param image A decoded image.
 * @param factor Integer factor to divide the dimensions by.
 * @returns The reduced image, decoded.
 */
export function downscale({ width, height, rgba }, factor) {
	if (!Number.isInteger(factor) || factor < 1) {
		throw new Error(`factor must be a positive integer, got ${factor}`);
	}
	if (width % factor || height % factor) {
		throw new Error(`${width}x${height} is not divisible by ${factor}`);
	}

	const out = { width: width / factor, height: height / factor };
	out.rgba = Buffer.alloc(out.width * out.height * 4);
	const samples = factor * factor;

	for (let y = 0; y < out.height; y++) {
		for (let x = 0; x < out.width; x++) {
			const totals = [0, 0, 0, 0];
			for (let dy = 0; dy < factor; dy++) {
				for (let dx = 0; dx < factor; dx++) {
					const at = ((y * factor + dy) * width + x * factor + dx) * 4;
					// Premultiplied, so transparent pixels do not darken the edges.
					const alpha = rgba[at + 3] / 255;
					totals[0] += rgba[at] * alpha;
					totals[1] += rgba[at + 1] * alpha;
					totals[2] += rgba[at + 2] * alpha;
					totals[3] += rgba[at + 3];
				}
			}
			const target = (y * out.width + x) * 4;
			const alpha = totals[3] / samples;
			out.rgba[target + 3] = Math.round(alpha);
			for (let c = 0; c < 3; c++) {
				out.rgba[target + c] = alpha > 0 ? Math.round((totals[c] / samples) * (255 / alpha)) : 0;
			}
		}
	}
	return out;
}
