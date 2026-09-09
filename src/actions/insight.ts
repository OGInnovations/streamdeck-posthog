import streamDeck, {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { buildTitle, formatValue } from "../format.js";
import { fetchInsightValue, PostHogError, type Connection } from "../posthog/client.js";
import { parseInsightRef } from "../posthog/insight-ref.js";
import { refreshInterval, type GlobalSettings, type InsightSettings } from "../settings.js";

/**
 * Shows the current value of a PostHog insight on a key, polling on an
 * interval and refreshing immediately when the key is pressed.
 */
@action({ UUID: "io.ogin.streamdeck.posthog.insight" })
export class InsightValue extends SingletonAction<InsightSettings> {
	/** One poll timer per visible key, keyed by action instance ID. */
	readonly #timers = new Map<string, NodeJS.Timeout>();

	override onWillAppear(ev: WillAppearEvent<InsightSettings>): Promise<void> {
		return this.#restart(ev.action.id, ev.payload.settings, ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<InsightSettings>): void {
		this.#stop(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<InsightSettings>): Promise<void> {
		return this.#restart(ev.action.id, ev.payload.settings, ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent<InsightSettings>): Promise<void> {
		// A press is an explicit "give me the current number", so skip the cache.
		const ok = await this.#render(ev.action, ev.payload.settings, { force: true });
		if (ok) {
			await ev.action.showOk();
		}
	}

	/** Refreshes every visible key, e.g. after the connection settings change. */
	async refreshAll(): Promise<void> {
		for (const instance of this.actions) {
			const settings = await instance.getSettings();
			await this.#restart(instance.id, settings, instance);
		}
	}

	/** Cancels all timers; called when the plugin shuts down. */
	dispose(): void {
		for (const id of [...this.#timers.keys()]) {
			this.#stop(id);
		}
	}

	async #restart(id: string, settings: InsightSettings, target: Target): Promise<void> {
		this.#stop(id);
		await this.#render(target, settings);

		const interval = refreshInterval(settings) * 1000;
		const timer = setInterval(() => {
			void target.getSettings().then((current) => this.#render(target, current));
		}, interval);
		// The timer must not hold the plugin process open on its own.
		timer.unref?.();
		this.#timers.set(id, timer);
	}

	#stop(id: string): void {
		const timer = this.#timers.get(id);
		if (timer) {
			clearInterval(timer);
			this.#timers.delete(id);
		}
	}

	/**
	 * Fetches and draws the current value.
	 * @returns `true` when a value was drawn, `false` when the key shows an error.
	 */
	async #render(target: Target, settings: InsightSettings, options: { force?: boolean } = {}): Promise<boolean> {
		const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		const ref = parseInsightRef(settings.insight);

		if (!ref) {
			await target.setTitle(buildTitle("⚙", "Pick insight"));
			return false;
		}

		const host = ref.host ?? global.host?.trim();
		const projectId = ref.projectId ?? global.projectId?.trim();
		const apiKey = global.apiKey?.trim();

		if (!host || !projectId || !apiKey) {
			await target.setTitle(buildTitle("⚙", "Connect"));
			return false;
		}

		const connection: Connection = { host, projectId, apiKey };
		const seriesIndex = Math.max(0, Math.round(Number(settings.seriesIndex) || 0));

		try {
			const result = await fetchInsightValue(connection, ref, seriesIndex, options);
			const label = settings.label?.trim() || result.seriesLabel || result.insightName;
			await target.setTitle(buildTitle(formatValue(result.value, settings), label));
			return true;
		} catch (err) {
			const reason = err instanceof PostHogError ? err.message : "Refresh failed";
			streamDeck.logger.error(`Insight ${ref.shortId} failed: ${reason}`, err);
			await target.setTitle(buildTitle("⚠", reason));
			await target.showAlert();
			return false;
		}
	}
}

/** The subset of the action API this class needs, satisfied by both key and dial actions. */
type Target = {
	getSettings(): Promise<InsightSettings>;
	setTitle(title?: string): Promise<void>;
	showAlert(): Promise<void>;
};
