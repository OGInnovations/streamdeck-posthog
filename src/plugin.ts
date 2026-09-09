import streamDeck from "@elgato/streamdeck";

import { InsightValue } from "./actions/insight.js";
import { clearCache } from "./posthog/client.js";

streamDeck.logger.setLevel("info");

const insightValue = new InsightValue();
streamDeck.actions.registerAction(insightValue);

// Changing the API key, host or project invalidates every cached value, and
// every visible key needs redrawing against the new connection.
streamDeck.settings.onDidReceiveGlobalSettings(() => {
	clearCache();
	void insightValue.refreshAll();
});

await streamDeck.connect();
