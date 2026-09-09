import streamDeck from "@elgato/streamdeck";

import { InsightValue } from "./actions/insight.js";
import { initGlobalSettings, onConnectionChange } from "./global-settings.js";
import { clearCache } from "./posthog/client.js";

streamDeck.logger.setLevel("info");

const insightValue = new InsightValue();
streamDeck.actions.registerAction(insightValue);

// Changing the API key, host or project invalidates every cached value, and
// every visible key needs redrawing against the new connection.
onConnectionChange(() => {
	clearCache();
	insightValue.refreshAll().catch((err) => streamDeck.logger.error("Refresh after settings change failed", err));
});

// A rejection anywhere fire-and-forget would take the whole plugin down, which
// looks to the user like the plugin silently dying mid-session.
process.on("unhandledRejection", (reason) => {
	streamDeck.logger.error("Unhandled rejection", reason);
});

await streamDeck.connect();
await initGlobalSettings();
