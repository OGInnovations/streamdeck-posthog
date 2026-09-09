/**
 * Cached access to the plugin's global settings.
 *
 * Stream Deck answers every `getGlobalSettings` request with a
 * `didReceiveGlobalSettings` event, and that event is delivered to
 * `onDidReceiveGlobalSettings` listeners too — it is not distinguishable from
 * the user editing the settings. Reading the settings from inside such a
 * listener therefore requests them again, which arrives as another event, and
 * the plugin floods the websocket until the Stream Deck application stops
 * responding. So the settings are read from Stream Deck exactly once, at
 * startup, and kept in memory from then on; everything else reads the cache.
 */
import streamDeck from "@elgato/streamdeck";

import type { GlobalSettings } from "./settings.js";

let cached: GlobalSettings = {};
const listeners = new Set<() => void>();

let markReady: () => void;
const ready = new Promise<void>((resolve) => {
	markReady = resolve;
});

/** How long a key waits for the settings before drawing without them. */
const READY_TIMEOUT_MS = 3000;

/**
 * Resolves once the settings have been read, so a key appearing during startup
 * does not draw "Connect" for a moment before its value arrives.
 *
 * Resolves anyway after a short wait: a key that renders without settings shows
 * a prompt to connect, which is far better than a key that never renders.
 * @returns A promise that always resolves.
 */
export function whenSettingsReady(): Promise<void> {
	return Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS).unref?.())]);
}

/**
 * Determines whether two sets of settings differ in a way that affects
 * requests. Used to avoid redundant refreshes when Stream Deck re-sends
 * settings that have not actually changed.
 * @param a Previous settings.
 * @param b Next settings.
 * @returns `true` when the host, key or project differs.
 */
export function connectionChanged(a: GlobalSettings, b: GlobalSettings): boolean {
	return a.host !== b.host || a.apiKey !== b.apiKey || a.projectId !== b.projectId;
}

/** The most recently received global settings. Never triggers a request. */
export function globalSettings(): GlobalSettings {
	return cached;
}

/**
 * Registers a listener invoked when the connection settings change.
 * @param listener Function to invoke; must not read settings from Stream Deck.
 */
export function onConnectionChange(listener: () => void): void {
	listeners.add(listener);
}

/** Subscribes to global settings and primes the cache. Call once, after connecting. */
export async function initGlobalSettings(): Promise<void> {
	streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
		const next = ev.settings ?? {};
		const changed = connectionChanged(cached, next);
		cached = next;
		if (!changed) {
			return;
		}
		for (const listener of listeners) {
			try {
				listener();
			} catch (err) {
				streamDeck.logger.error("Global settings listener failed", err);
			}
		}
	});

	cached = (await streamDeck.settings.getGlobalSettings<GlobalSettings>()) ?? {};
	markReady();
}
