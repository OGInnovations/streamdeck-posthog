import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractValue } from "../posthog/extract.js";

describe("extractValue", () => {
	it("prefers aggregated_value, as single-value trends provide", () => {
		const result = [{ aggregated_value: 42, count: 7, label: "Signups" }];
		assert.deepEqual(extractValue(result), { value: 42, seriesLabel: "Signups" });
	});

	it("falls back to count for a graphed trend", () => {
		const result = [{ count: 1234, data: [1, 2, 3], label: "Pageviews" }];
		assert.deepEqual(extractValue(result), { value: 1234, seriesLabel: "Pageviews" });
	});

	it("falls back to the latest data point when no total is given", () => {
		const result = [{ data: [1, 5, 9], label: "Active users" }];
		assert.deepEqual(extractValue(result), { value: 9, seriesLabel: "Active users" });
	});

	it("selects the requested series", () => {
		const result = [{ count: 1, label: "A" }, { count: 2, label: "B" }];
		assert.deepEqual(extractValue(result, 1), { value: 2, seriesLabel: "B" });
	});

	it("falls back to the first series when the index is out of range", () => {
		const result = [{ count: 1, label: "A" }];
		assert.deepEqual(extractValue(result, 5), { value: 1, seriesLabel: "A" });
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
