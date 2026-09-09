import streamDeck, {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { formatValue } from "../format.js";
import { globalSettings, whenSettingsReady } from "../global-settings.js";
import { fetchInsightValue, PostHogError, type Connection } from "../posthog/client.js";
import { changeFrom } from "../posthog/extract.js";
import { parseInsightRef } from "../posthog/insight-ref.js";
import { renderError, renderSetup, renderValue, type KeyStyle } from "../render/key-image.js";
import type { ThemeName } from "../render/theme.js";
import { refreshInterval, type InsightSettings } from "../settings.js";

/** Per-key state: the key's settings and its poll timer. */
type Instance = {
	settings: InsightSettings;
	timer: NodeJS.Timeout;
};

/**
 * Shows the current value of a PostHog insight on a key, polling on an
 * interval and refreshing immediately when the key is pressed.
 *
 * Settings are tracked from the events that carry them rather than fetched on
 * demand: `getSettings()` is answered by a `didReceiveSettings` event, which
 * this action also listens for, so fetching from inside a handler would loop.
 */
@action({ UUID: "io.ogin.streamdeck.posthog.insight" })
export class InsightValue extends SingletonAction<InsightSettings> {
	readonly #instances = new Map<string, Instance>();

	override onWillAppear(ev: WillAppearEvent<InsightSettings>): Promise<void> {
		return this.#restart(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<InsightSettings>): void {
		this.#stop(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<InsightSettings>): Promise<void> {
		return this.#restart(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<InsightSettings>): Promise<void> {
		// A press means "give me the number now", so skip the cache.
		const settings = this.#instances.get(ev.action.id)?.settings ?? ev.payload.settings;
		if (await this.#render(ev.action, settings, { force: true })) {
			await ev.action.showOk();
		}
	}

	/** Redraws every visible key, e.g. after the connection settings change. */
	async refreshAll(): Promise<void> {
		for (const instance of this.actions) {
			const tracked = this.#instances.get(instance.id);
			if (tracked) {
				await this.#render(instance, tracked.settings, { force: true });
			}
		}
	}

	/** Cancels all timers. */
	dispose(): void {
		for (const id of [...this.#instances.keys()]) {
			this.#stop(id);
		}
	}

	async #restart(target: Target, settings: InsightSettings): Promise<void> {
		this.#stop(target.id);

		const timer = setInterval(
			() => {
				// Rejections here would otherwise be unhandled and kill the plugin.
				this.#render(target, settings).catch((err) => streamDeck.logger.error("Poll failed", err));
			},
			refreshInterval(settings) * 1000,
		);
		// The timer must not keep the plugin process alive on its own.
		timer.unref?.();
		this.#instances.set(target.id, { settings, timer });

		await this.#render(target, settings);
	}

	/**
	 * Draws a rendered image on the key.
	 *
	 * The title is cleared alongside it: Stream Deck composites the title over
	 * the image, so any title left behind would sit on top of the value.
	 * @param target The key to draw on.
	 * @param image Data URI of the rendered image.
	 */
	async #draw(target: Target, image: string): Promise<void> {
		await target.setImage(image);
		await target.setTitle("");
	}

	#stop(id: string): void {
		const instance = this.#instances.get(id);
		if (instance) {
			clearInterval(instance.timer);
			this.#instances.delete(id);
		}
	}

	/**
	 * Fetches and draws the current value.
	 * @param target The key to draw on.
	 * @param settings The key's settings.
	 * @param options.force Bypass the value cache.
	 * @returns `true` when a value was drawn, `false` when the key shows a problem.
	 */
	async #render(target: Target, settings: InsightSettings, options: { force?: boolean } = {}): Promise<boolean> {
		await whenSettingsReady();

		const ref = parseInsightRef(settings.insight);
		const style = keyStyle(settings);
		streamDeck.logger.debug(`Rendering ${target.id}: insight=${ref?.shortId ?? "unset"}`);
		if (!ref) {
			await this.#draw(target, renderSetup("Pick insight", style));
			return false;
		}

		const global = globalSettings();
		const host = ref.host ?? global.host?.trim();
		const projectId = ref.projectId ?? global.projectId?.trim();
		const apiKey = global.apiKey?.trim();

		if (!host || !projectId || !apiKey) {
			// Logged without values: these settings hold the user's API key.
			streamDeck.logger.debug(
				`Incomplete connection: host=${!!host} project=${!!projectId} key=${!!apiKey}`,
			);
			await this.#draw(target, renderSetup("Connect", style));
			return false;
		}

		const connection: Connection = { host, projectId, apiKey };
		const seriesIndex = Math.max(0, Math.round(Number(settings.seriesIndex) || 0));

		try {
			const result = await fetchInsightValue(connection, ref, seriesIndex, options);
			streamDeck.logger.debug(`Insight ${ref.shortId} returned ${result.value}`);
			const caption =
				settings.showCaption === false
					? undefined
					: settings.label?.trim() || result.seriesLabel || result.insightName;

			await this.#draw(
				target,
				renderValue(
					{
						value: formatValue(result.value, settings),
						caption,
						points: settings.showSparkline === false ? undefined : result.points,
						delta: settings.showDelta ? changeFrom(result.points) : undefined,
					},
					style,
				),
			);
			return true;
		} catch (err) {
			const reason = err instanceof PostHogError ? err.message : "Refresh failed";
			streamDeck.logger.error(`Insight ${ref.shortId} failed: ${reason}`, err);
			await this.#draw(target, renderError(reason, style));
			await target.showAlert();
			return false;
		}
	}
}

/** The subset of the action API this class needs, satisfied by key and dial actions alike. */
type Target = {
	readonly id: string;
	setImage(image?: string): Promise<void>;
	setTitle(title?: string): Promise<void>;
	showAlert(): Promise<void>;
};

/**
 * Maps a key's appearance settings onto the renderer's style.
 * @param settings The key's settings.
 * @returns The style to render with.
 */
function keyStyle(settings: InsightSettings): KeyStyle {
	const size = Number(settings.valueSize);
	return {
		theme: (settings.theme as ThemeName) || "dark",
		customTheme: {
			background: settings.bgColor || undefined,
			value: settings.valueColor || undefined,
			caption: settings.captionColor || undefined,
			accent: settings.accentColor || undefined,
		},
		sparkline: settings.showSparkline !== false,
		invertTrend: settings.invertTrend === true,
		maxValueSize: Number.isFinite(size) && size > 0 ? size : undefined,
	};
}
