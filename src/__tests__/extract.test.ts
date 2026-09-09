import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { changeFrom, extractValue } from "../posthog/extract.js";

describe("extractValue", () => {
	it("prefers aggregated_value, as single-value trends provide", () => {
		const result = [{ aggregated_value: 42, count: 7, label: "Signups" }];
		assert.deepEqual(extractValue(result), { value: 42, seriesLabel: "Signups", points: undefined });
	});

	it("falls back to count for a graphed trend", () => {
		const result = [{ count: 1234, data: [1, 2, 3], label: "Pageviews" }];
		assert.deepEqual(extractValue(result), { value: 1234, seriesLabel: "Pageviews", points: [1, 2, 3] });
	});

	it("falls back to the latest data point when no total is given", () => {
		const result = [{ data: [1, 5, 9], label: "Active users" }];
		assert.deepEqual(extractValue(result), { value: 9, seriesLabel: "Active users", points: [1, 5, 9] });
	});

	it("selects the requested series", () => {
		const result = [{ count: 1, label: "A" }, { count: 2, label: "B" }];
		assert.deepEqual(extractValue(result, 1), { value: 2, seriesLabel: "B", points: undefined });
	});

	it("falls back to the first series when the index is out of range", () => {
		const result = [{ count: 1, label: "A" }];
		assert.deepEqual(extractValue(result, 5), { value: 1, seriesLabel: "A", points: undefined });
	});

	it("reads a bare number", () => {
		assert.deepEqual(extractValue(99), { value: 99 });
	});

	it("returns undefined when there is no number to show", () => {
		assert.equal(extractValue([]), undefined);
		assert.equal(extractValue(null), undefined);
		assert.equal(extractValue([{ label: "A" }]), undefined);
	});
});

describe("series points", () => {
	it("carries the data series for the sparkline", () => {
		const result = [{ count: 6, data: [1, 2, 3], label: "A" }];
		assert.deepEqual(extractValue(result)?.points, [1, 2, 3]);
	});

	it("omits a series that is not entirely numeric", () => {
		const result = [{ count: 6, data: [1, null, 3], label: "A" }];
		assert.equal(extractValue(result)?.points, undefined);
	});
});

describe("changeFrom", () => {
	it("compares the last two points", () => {
		assert.equal(changeFrom([100, 125]), 0.25);
		assert.equal(changeFrom([100, 75]), -0.25);
	});

	it("returns undefined when there is nothing to compare", () => {
		assert.equal(changeFrom(undefined), undefined);
		assert.equal(changeFrom([5]), undefined);
		// Dividing by a zero baseline has no meaningful percentage.
		assert.equal(changeFrom([0, 5]), undefined);
	});

	it("keeps the sign correct for negative baselines", () => {
		assert.equal(changeFrom([-10, -5]), 0.5);
	});
});
