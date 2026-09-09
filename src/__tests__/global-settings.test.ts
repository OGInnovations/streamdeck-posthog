import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { connectionChanged } from "../global-settings.js";

describe("connectionChanged", () => {
	it("reports a change when the host, key or project differs", () => {
		assert.equal(connectionChanged({}, { host: "https://eu.posthog.com" }), true);
		assert.equal(connectionChanged({ apiKey: "a" }, { apiKey: "b" }), true);
		assert.equal(connectionChanged({ projectId: "1" }, { projectId: "2" }), true);
	});

	it("reports no change for identical settings", () => {
		const settings = { host: "https://eu.posthog.com", apiKey: "phx", projectId: "1" };
		assert.equal(connectionChanged(settings, { ...settings }), false);
		assert.equal(connectionChanged({}, {}), false);
	});
});

describe("initGlobalSettings", () => {
	it("reads the settings from Stream Deck exactly once", async (t) => {
		// Stream Deck answers getGlobalSettings with the same didReceiveGlobalSettings
		// event that listeners see. Reading the settings from inside the listener
		// would request them again and loop until the app stops responding, so the
		// contract under test is that exactly one request is ever made.
		const listeners: ((ev: { settings: Record<string, unknown> }) => void)[] = [];
		let requests = 0;

		const stub = {
			default: {
				logger: { error: () => {}, setLevel: () => {} },
				settings: {
					onDidReceiveGlobalSettings: (listener: (typeof listeners)[number]) => {
						listeners.push(listener);
					},
					getGlobalSettings: async () => {
						requests++;
						const settings = { host: "https://eu.posthog.com", apiKey: "phx", projectId: "7" };
						// Mirror the real behaviour: the reply reaches listeners too.
						for (const listener of listeners) {
							listener({ settings });
						}
						return settings;
					},
				},
			},
		};

		mock.module("@elgato/streamdeck", { namedExports: {}, defaultExport: stub.default });
		t.after(() => mock.reset());

		const { initGlobalSettings, globalSettings, onConnectionChange } = await import(
			`../global-settings.js?loop-test=${Date.now()}`
		);

		let refreshes = 0;
		onConnectionChange(() => refreshes++);
		await initGlobalSettings();

		assert.equal(requests, 1, "settings must be requested only once");
		assert.equal(refreshes, 1, "listeners run once for the initial settings");
		assert.equal(globalSettings().host, "https://eu.posthog.com");
	});
});
