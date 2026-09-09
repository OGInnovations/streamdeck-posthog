import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderError, renderSetup, renderValue } from "../render/key-image.js";
import { fitFontSize, measure, truncate } from "../render/text.js";

/** Decodes a rendered data URI back to its SVG source. */
function svgOf(dataUri: string): string {
	assert.match(dataUri, /^data:image\/svg\+xml;base64,/);
	return Buffer.from(dataUri.split(",")[1]!, "base64").toString("utf8");
}

describe("renderValue", () => {
	it("draws the value and caption", () => {
		const svg = svgOf(renderValue({ value: "18.4k", caption: "Signups" }));
		assert.match(svg, /<svg[^>]+viewBox="0 0 144 144"/);
		assert.match(svg, />18\.4k</);
		// Captions are set in caps for a typographic hierarchy against the value.
		assert.match(svg, />SIGNUPS</);
	});

	it("draws a sparkline only when there are points to plot", () => {
		const points = [1, 4, 2, 8];
		assert.match(svgOf(renderValue({ value: "8", points })), /stroke-width="2\.6"/);
		assert.doesNotMatch(svgOf(renderValue({ value: "8", points }, { sparkline: false })), /stroke-width="2\.6"/);
		assert.doesNotMatch(svgOf(renderValue({ value: "8", points: [3] })), /stroke-width="2\.6"/);
	});

	it("plots a flat series through the middle rather than dividing by zero", () => {
		const svg = svgOf(renderValue({ value: "5", points: [5, 5, 5] }));
		assert.doesNotMatch(svg, /NaN/);
	});

	it("colours a rise green and a fall red", () => {
		assert.match(svgOf(renderValue({ value: "1", delta: 0.2 })), /#34D399/);
		assert.match(svgOf(renderValue({ value: "1", delta: -0.2 })), /#F87171/);
	});

	it("flips the trend colours when falling is the good direction", () => {
		const svg = svgOf(renderValue({ value: "1", delta: -0.2 }, { invertTrend: true }));
		assert.match(svg, /#34D399/);
		assert.doesNotMatch(svg, /#F87171/);
	});

	it("shrinks a long value to fit the key", () => {
		const short = svgOf(renderValue({ value: "42" }));
		const long = svgOf(renderValue({ value: "1,284,553,901" }));
		const sizeOf = (svg: string) => Number(/font-weight="700"[^>]*/.exec(svg) && /font-size="(\d+)" font-weight="700"/.exec(svg)![1]);
		assert.ok(sizeOf(long) < sizeOf(short), `${sizeOf(long)} should be smaller than ${sizeOf(short)}`);
	});

	it("applies custom colours", () => {
		const svg = svgOf(
			renderValue(
				{ value: "1", caption: "c", points: [1, 2] },
				{ theme: "custom", customTheme: { background: "#123456", value: "#ABCDEF", accent: "#FEDCBA" } },
			),
		);
		assert.match(svg, /#123456/);
		assert.match(svg, /#ABCDEF/);
		assert.match(svg, /#FEDCBA/);
	});

	it("escapes text so a caption cannot break the markup", () => {
		const svg = svgOf(renderValue({ value: "1", caption: '<script>&"' }));
		assert.doesNotMatch(svg, /<script>/);
		assert.match(svg, /&lt;SCRIPT&gt;&amp;&quot;/);
	});
});

describe("renderSetup and renderError", () => {
	it("renders the setup message", () => {
		assert.match(svgOf(renderSetup("Pick insight")), /Pick/);
	});

	it("wraps a long error onto two lines", () => {
		const svg = svgOf(renderError("Rate limited by PostHog"));
		assert.equal(svg.match(/<text/g)?.length, 2);
	});

	it("uses no emoji or glyph fonts for the warning mark", () => {
		const svg = svgOf(renderError("Nope"));
		assert.match(svg, /<path d="M72 26/);
		assert.doesNotMatch(svg, /[\u{1F300}-\u{1FAFF}⚠]/u);
	});
});

describe("text measurement", () => {
	it("measures wider strings as wider", () => {
		assert.ok(measure("1,284,553", 40) > measure("42", 40));
	});

	it("keeps a preferred size when the text already fits", () => {
		assert.equal(fitFontSize("42", 124, 58, 20), 58);
	});

	it("never shrinks below the legible minimum", () => {
		assert.equal(fitFontSize("1234567890123456789", 124, 58, 20), 20);
	});

	it("truncates with an ellipsis", () => {
		const result = truncate("Total pageviews all time", 124, 17, 1.1);
		assert.ok(result.endsWith("…"));
		assert.ok(result.length < "Total pageviews all time".length);
	});
});

describe("development build marker", () => {
	// The development plugin runs alongside the Marketplace install under its
	// own UUID, and would otherwise be indistinguishable on the deck.
	const STRIPE = /#A78BFA/;

	it("marks a value key", () => {
		assert.match(svgOf(renderValue({ value: "1" }, { devBadge: true })), STRIPE);
	});

	it("marks the setup and error states too", () => {
		assert.match(svgOf(renderSetup("Connect", { devBadge: true })), STRIPE);
		assert.match(svgOf(renderError("Nope", { devBadge: true })), STRIPE);
	});

	it("leaves the release build unmarked", () => {
		assert.doesNotMatch(svgOf(renderValue({ value: "1" })), STRIPE);
		assert.doesNotMatch(svgOf(renderSetup("Connect")), STRIPE);
		assert.doesNotMatch(svgOf(renderError("Nope")), STRIPE);
	});
});
