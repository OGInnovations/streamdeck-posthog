import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTitle, formatValue } from "../format.js";
import { refreshInterval } from "../settings.js";

describe("formatValue", () => {
	it("groups thousands by default", () => {
		assert.equal(formatValue(12412, {}), "12,412");
	});

	it("abbreviates when compact", () => {
		assert.equal(formatValue(12412, { compact: true }), "12.4k");
		assert.equal(formatValue(1_240_000, { compact: true }), "1.2M");
		assert.equal(formatValue(230_000, { compact: true }), "230k");
		assert.equal(formatValue(999, { compact: true }), "999");
	});

	it("keeps negatives readable", () => {
		assert.equal(formatValue(-4300, { compact: true }), "-4.3k");
	});

	it("applies decimals and affixes", () => {
		assert.equal(formatValue(0.4267, { decimals: 2, suffix: "%" }), "0.43%");
		assert.equal(formatValue(19.9, { decimals: 2, prefix: "$" }), "$19.90");
	});

	it("clamps nonsense decimal values", () => {
		assert.equal(formatValue(1.23456, { decimals: 99 }), "1.2346");
		assert.equal(formatValue(1.5, { decimals: -3 }), "2");
	});
});

describe("buildTitle", () => {
	it("puts the caption on a second line", () => {
		assert.equal(buildTitle("42", "Signups"), "42\nSignups");
	});

	it("omits an empty caption", () => {
		assert.equal(buildTitle("42", "  "), "42");
		assert.equal(buildTitle("42", undefined), "42");
	});
});

describe("refreshInterval", () => {
	it("defaults to a minute", () => {
		assert.equal(refreshInterval({}), 60);
	});

	it("enforces a floor to respect API rate limits", () => {
		assert.equal(refreshInterval({ refreshSeconds: 1 }), 15);
	});

	it("passes through valid values", () => {
		assert.equal(refreshInterval({ refreshSeconds: 300 }), 300);
	});
});
