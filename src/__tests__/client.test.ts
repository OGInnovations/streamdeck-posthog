import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import { clearCache, fetchInsightValue, PostHogError, type Connection } from "../posthog/client.js";
import type { InsightRef } from "../posthog/insight-ref.js";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** A stub PostHog that records the paths it was asked for. */
async function stubPostHog(handler: Handler): Promise<{
	connection: Connection;
	paths: string[];
	close: () => void;
}> {
	const paths: string[] = [];
	const server = http.createServer((req, res) => {
		paths.push(req.url ?? "");
		handler(req, res);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
	const { port } = server.address() as AddressInfo;

	return {
		connection: { host: `http://127.0.0.1:${port}`, projectId: "999", apiKey: "phx_test" },
		paths,
		close: () => server.close(),
	};
}

/** Responds like PostHog's insights list endpoint. */
function insight(result: unknown, name = "Weekly signups"): Handler {
	return (_req, res) => {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ results: [{ name, result }] }));
	};
}

const REF: InsightRef = { shortId: "AbCdEf12" };
const SERIES = [{ aggregated_value: 18432, label: "Signups", data: [1, 2, 3] }];

afterEach(() => clearCache());

describe("fetchInsightValue", () => {
	it("reads the value, label and insight name", async () => {
		const stub = await stubPostHog(insight(SERIES));
		try {
			const result = await fetchInsightValue(stub.connection, REF, 0);
			assert.equal(result.value, 18432);
			assert.equal(result.seriesLabel, "Signups");
			assert.equal(result.insightName, "Weekly signups");
		} finally {
			stub.close();
		}
	});

	it("sends the personal API key as a bearer token", async () => {
		let auth: string | undefined;
		const stub = await stubPostHog((req, res) => {
			auth = req.headers.authorization;
			insight(SERIES)(req, res);
		});
		try {
			await fetchInsightValue(stub.connection, REF, 0);
			assert.equal(auth, "Bearer phx_test");
		} finally {
			stub.close();
		}
	});

	it("does not ask PostHog to recalculate when polling", async () => {
		// Recalculation is expensive and counts against the project's query
		// capacity, so a poll must serve whatever PostHog already has cached.
		const stub = await stubPostHog(insight(SERIES));
		try {
			await fetchInsightValue(stub.connection, REF, 0);
			assert.equal(stub.paths.length, 1);
			assert.doesNotMatch(stub.paths[0]!, /refresh/);
		} finally {
			stub.close();
		}
	});

	it("asks PostHog to recalculate only when the key is pressed", async () => {
		const stub = await stubPostHog(insight(SERIES));
		try {
			await fetchInsightValue(stub.connection, REF, 0, { recalculate: true });
			assert.match(stub.paths[0]!, /refresh=true/);
		} finally {
			stub.close();
		}
	});

	it("recalculates once when the cached result is empty", async () => {
		// A saved insight nobody has opened yet has no cached result.
		const stub = await stubPostHog((req, res) => {
			insight(req.url?.includes("refresh=true") ? SERIES : [])(req, res);
		});
		try {
			const result = await fetchInsightValue(stub.connection, REF, 0);
			assert.equal(result.value, 18432);
			assert.equal(stub.paths.length, 2);
			assert.doesNotMatch(stub.paths[0]!, /refresh/);
			assert.match(stub.paths[1]!, /refresh=true/);
		} finally {
			stub.close();
		}
	});

	it("falls back to /api/environments/ when /api/projects/ is gone", async () => {
		const stub = await stubPostHog((req, res) => {
			if (req.url?.startsWith("/api/projects/")) {
				res.writeHead(404).end("{}");
				return;
			}
			insight(SERIES)(req, res);
		});
		try {
			assert.equal((await fetchInsightValue(stub.connection, REF, 0)).value, 18432);
			assert.match(stub.paths[1]!, /^\/api\/environments\/999\//);
		} finally {
			stub.close();
		}
	});

	it("serves repeat reads from cache, and refetches when told to bypass it", async () => {
		const stub = await stubPostHog(insight(SERIES));
		try {
			await fetchInsightValue(stub.connection, REF, 0);
			await fetchInsightValue(stub.connection, REF, 0);
			assert.equal(stub.paths.length, 1, "second read should be cached");

			await fetchInsightValue(stub.connection, REF, 0, { recalculate: true });
			assert.equal(stub.paths.length, 2, "force should refetch");
		} finally {
			stub.close();
		}
	});

	it("makes one request when several keys read the same insight at once", async () => {
		// Multiple keys can point at one insight; they must not multiply the load.
		const stub = await stubPostHog(insight(SERIES));
		try {
			const results = await Promise.all([
				fetchInsightValue(stub.connection, REF, 0),
				fetchInsightValue(stub.connection, REF, 0),
				fetchInsightValue(stub.connection, REF, 0),
			]);
			assert.equal(stub.paths.length, 1);
			assert.deepEqual(
				results.map((r) => r.value),
				[18432, 18432, 18432],
			);
		} finally {
			stub.close();
		}
	});
});

describe("error handling", () => {
	const cases: [number, string][] = [
		[401, "Invalid API key"],
		[403, "API key lacks insight:read"],
		[429, "Rate limited by PostHog"],
		[500, "PostHog error 500"],
	];

	for (const [status, message] of cases) {
		it(`reports ${status} as "${message}"`, async () => {
			const stub = await stubPostHog((_req, res) => {
				res.writeHead(status).end("{}");
			});
			try {
				await assert.rejects(fetchInsightValue(stub.connection, REF, 0), (err: PostHogError) => {
					assert.equal(err.message, message);
					assert.equal(err.status, status);
					return true;
				});
			} finally {
				stub.close();
			}
		});
	}

	it("reports an unreachable host", async () => {
		await assert.rejects(
			// Port 1 refuses connections.
			fetchInsightValue({ host: "http://127.0.0.1:1", projectId: "1", apiKey: "x" }, REF, 0),
			(err: PostHogError) => {
				assert.equal(err.message, "PostHog unreachable");
				return true;
			},
		);
	});

	it("reports an insight with no numeric value", async () => {
		const stub = await stubPostHog(insight([{ label: "no numbers here" }]));
		try {
			await assert.rejects(fetchInsightValue(stub.connection, REF, 0), /No numeric value in insight/);
		} finally {
			stub.close();
		}
	});

	it("reports a missing insight", async () => {
		const stub = await stubPostHog((_req, res) => {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ results: [] }));
		});
		try {
			await assert.rejects(fetchInsightValue(stub.connection, REF, 0), /Insight not found/);
		} finally {
			stub.close();
		}
	});

	it("stops requesting after a rate limit, across every insight in the project", async () => {
		const stub = await stubPostHog((_req, res) => {
			res.writeHead(429, { "retry-after": "120" }).end("{}");
		});
		try {
			await assert.rejects(fetchInsightValue(stub.connection, REF, 0), /Rate limited/);
			assert.equal(stub.paths.length, 1);

			// The wait is served from memory, for this and any other insight.
			await assert.rejects(fetchInsightValue(stub.connection, REF, 0), /Rate limited/);
			await assert.rejects(fetchInsightValue(stub.connection, { shortId: "Other123" }, 0), /Rate limited/);
			assert.equal(stub.paths.length, 1, "no further requests while rate limited");
		} finally {
			stub.close();
		}
	});

	it("resumes requesting once the connection settings change", async () => {
		const stub = await stubPostHog((_req, res) => {
			res.writeHead(429).end("{}");
		});
		try {
			await assert.rejects(fetchInsightValue(stub.connection, REF, 0), /Rate limited/);
			clearCache();
			await assert.rejects(fetchInsightValue(stub.connection, REF, 0), /Rate limited/);
			assert.equal(stub.paths.length, 2, "a settings change should retry");
		} finally {
			stub.close();
		}
	});
});

describe("recalculation is reserved for key presses", () => {
	it("does not recalculate when refreshing after a settings change", async () => {
		// Every plugin start and every settings edit refreshes all visible keys.
		// If that recalculated, a deck full of keys would storm PostHog's query
		// engine on each restart.
		const stub = await stubPostHog(insight(SERIES));
		try {
			await fetchInsightValue(stub.connection, REF, 0, { bypassCache: true });
			assert.doesNotMatch(stub.paths[0]!, /refresh/);
		} finally {
			stub.close();
		}
	});
});
