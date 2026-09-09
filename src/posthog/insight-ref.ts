/**
 * Resolving what the user pasted into a key's "Insight" field.
 *
 * PostHog insight URLs look like:
 *   https://us.posthog.com/project/12345/insights/AbCdEf12
 *   https://eu.posthog.com/project/12345/insights/AbCdEf12/edit?foo=bar
 *
 * A URL therefore carries the host, project and short ID all at once, so
 * pasting one is enough even before the connection settings are filled in. A
 * bare short ID is also accepted, in which case the host and project come from
 * the plugin's global settings.
 */
export type InsightRef = {
	/** Host parsed from a pasted URL, if any. */
	host?: string;
	/** Project ID parsed from a pasted URL, if any. */
	projectId?: string;
	/** The insight's short ID. */
	shortId: string;
};

const SHORT_ID = /^[A-Za-z0-9_-]{4,32}$/;

/**
 * Parses an insight URL or short ID.
 * @param input Raw value from the property inspector.
 * @returns The parsed reference, or `undefined` when nothing usable was given.
 */
export function parseInsightRef(input: string | undefined): InsightRef | undefined {
	const value = input?.trim();
	if (!value) {
		return undefined;
	}

	if (/^https?:\/\//i.test(value)) {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			return undefined;
		}

		// Path is /project/<id>/insights/<shortId>[/...], optionally behind a
		// sub-path on self-hosted deployments.
		const parts = url.pathname.split("/").filter(Boolean);
		const insightsAt = parts.lastIndexOf("insights");
		const shortId = insightsAt >= 0 ? parts[insightsAt + 1] : undefined;
		if (!shortId || !SHORT_ID.test(shortId)) {
			return undefined;
		}

		const projectAt = parts.indexOf("project");
		const projectId = projectAt >= 0 ? parts[projectAt + 1] : undefined;

		return {
			host: `${url.protocol}//${url.host}`,
			projectId: projectId && /^\d+$/.test(projectId) ? projectId : undefined,
			shortId,
		};
	}

	return SHORT_ID.test(value) ? { shortId: value } : undefined;
}
