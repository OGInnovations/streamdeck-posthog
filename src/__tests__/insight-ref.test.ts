import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseInsightRef } from "../posthog/insight-ref.js";

describe("parseInsightRef", () => {
	it("reads host, project and short ID from a cloud URL", () => {
		assert.deepEqual(parseInsightRef("https://us.posthog.com/project/12345/insights/AbCdEf12"), {
			host: "https://us.posthog.com",
			projectId: "12345",
			shortId: "AbCdEf12",
		});
	});

	it("ignores trailing path segments and query strings", () => {
		assert.deepEqual(parseInsightRef("https://eu.posthog.com/project/7/insights/xY12_ab/edit?tab=1"), {
			host: "https://eu.posthog.com",
			projectId: "7",
			shortId: "xY12_ab",
		});
	});

	it("handles a self-hosted URL without a project segment", () => {
		assert.deepEqual(parseInsightRef("https://ph.internal.example/insights/AbCdEf12"), {
			host: "https://ph.internal.example",
			projectId: undefined,
			shortId: "AbCdEf12",
		});
	});

	it("accepts a bare short ID", () => {
		assert.deepEqual(parseInsightRef("  AbCdEf12  "), { shortId: "AbCdEf12" });
	});

	it("rejects input that is neither", () => {
		assert.equal(parseInsightRef(undefined), undefined);
		assert.equal(parseInsightRef(""), undefined);
		assert.equal(parseInsightRef("https://us.posthog.com/project/12345/dashboard/9"), undefined);
		assert.equal(parseInsightRef("not a short id"), undefined);
	});
});
