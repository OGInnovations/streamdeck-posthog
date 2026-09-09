/** Colour palettes for the key renderer. */

export type Theme = {
	/** Background, either a flat colour or a top-to-bottom gradient. */
	background: string | [string, string];
	/** Colour of the value. */
	value: string;
	/** Colour of the caption. */
	caption: string;
	/** Colour of the sparkline and other accents. */
	accent: string;
};

export const THEMES = {
	dark: {
		background: ["#1C1C21", "#121216"],
		value: "#FFFFFF",
		caption: "#8E8E9A",
		accent: "#F54E00",
	},
	light: {
		background: ["#FFFFFF", "#EDEDF2"],
		value: "#17171C",
		caption: "#6E6E7A",
		accent: "#F54E00",
	},
	posthog: {
		background: ["#FF7A2F", "#E84A00"],
		value: "#FFFFFF",
		caption: "#FFE0CD",
		accent: "#FFFFFF",
	},
	midnight: {
		background: ["#1E293B", "#0B1220"],
		value: "#F8FAFC",
		caption: "#94A3B8",
		accent: "#38BDF8",
	},
	mint: {
		background: ["#0F2A24", "#071812"],
		value: "#ECFDF5",
		caption: "#7FB8A4",
		accent: "#34D399",
	},
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES | "custom";

/** Colour of a rising value, and of a falling one. */
export const TREND_COLORS = { up: "#34D399", down: "#F87171", flat: "#9CA3AF" } as const;

/** Colour used for the error state, kept readable on every theme background. */
export const WARNING_COLOR = "#FBBF24";

/**
 * Resolves the palette a key should render with.
 * @param name Theme chosen in the property inspector.
 * @param custom Colour overrides, used when `name` is `custom`; blank entries fall back to the dark theme.
 * @returns The palette to render with.
 */
export function resolveTheme(name: ThemeName | undefined, custom: Partial<Theme> = {}): Theme {
	if (name === "custom") {
		return {
			background: custom.background ?? THEMES.dark.background,
			value: custom.value ?? THEMES.dark.value,
			caption: custom.caption ?? THEMES.dark.caption,
			accent: custom.accent ?? THEMES.dark.accent,
		};
	}
	return THEMES[name ?? "dark"] ?? THEMES.dark;
}
