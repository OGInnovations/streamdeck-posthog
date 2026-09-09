# Marketplace listing

Copy and assets for the Elgato Maker Console submission. Generated assets live
alongside this file; regenerate them with `node --import tsx tools/make-listing.ts`.

## Product name

    Live Metrics for PostHog

PostHog's brand policy permits the "*X* for PostHog" form and prohibits their
name as the main branding for a third-party project, so the name must keep this
shape. Elgato's plugin guidelines separately require that names not infringe
trademarks.

## Summary

    Your PostHog insights, live on every key.

## Description

Paste a PostHog insight's address onto a Stream Deck key, and the key shows its
current value — refreshed on its own, and on demand when you press it.

The key draws the number large enough to read across a room, with the insight's
name above it, its own series as a sparkline beneath, and optionally the change
against the previous point. Values are abbreviated if you want them to be, and
scale to fit whatever the number turns out to be.

Point as many keys as you like at as many insights as you like. Keys watching
the same insight share one request, and polling serves PostHog's cached results,
so a full deck costs your project almost nothing. Pressing a key is the only
thing that asks PostHog to recompute.

Five themes — Dark, Light, Orange, Midnight and Mint — or your own colours for
the background, value, caption and sparkline. Metrics where falling is the good
direction, like error rate, can flip the trend colours.

Works with PostHog Cloud US, Cloud EU and self-hosted deployments. Your personal
API key is kept in your operating system's credential store and sent only to the
PostHog host you configure. Scope it to insight:read and the plugin can do
nothing but read the numbers it shows.

Not affiliated with or endorsed by PostHog.

## Release notes — 1.0.0

First release.

- Insight Value action: shows a PostHog insight's current value on a key
- Automatic refresh from 15 seconds to hourly, plus refresh on press
- Trend sparkline drawn from the insight's own series
- Optional change indicator, with an inverted mode for metrics where falling is good
- Five themes plus custom colours, and per-element visibility
- PostHog Cloud US, Cloud EU and self-hosted support

## Tags

    posthog, analytics, metrics, dashboard, insights, product analytics,
    monitoring, kpi, developer tools

## Support

- Repository and issues: https://github.com/OGInnovations/streamdeck-posthog

## Assets

| Slot | File | Size |
| --- | --- | --- |
| Thumbnail | `thumbnail.png` | 1920 × 960 |
| Gallery 1 | `gallery-1-anatomy.png` | 1920 × 960 |
| Gallery 2 | `gallery-2-themes.png` | 1920 × 960 |
| Gallery 3 | `gallery-3-setup.png` | 1920 × 960 |
| App icon | `app-icon.png` | 288 × 288 |

The listing's app icon is a separate upload from the icon inside the plugin
bundle, and takes PNG or JPG up to 2 MB at a recommended 288 × 288. The bundle's
own icon — 256 × 256 and 512 × 512 per Elgato's plugin guidelines — is already
inside the uploaded `.streamDeckPlugin` and needs no separate upload.

Elgato requires one thumbnail and at least three gallery items. An optional
video would be 1920 × 1080 MP4 under 50 MB.

## Before submitting

- [ ] Make the GitHub repository public, so the manifest `URL` resolves and
      `npm run validate` passes with no warnings.
- [ ] `npm run validate` — no errors, no warnings.
- [ ] `npm run pack` — upload `dist/io.ogin.streamdeck.posthog.streamDeckPlugin`.
- [ ] Register at https://marketplace.elgato.com/maker and create the listing
      under UUID `io.ogin.streamdeck.posthog`. The UUID cannot change once
      published.
- [ ] Consider emailing marketing@posthog.com about the name. Their policy
      permits this form without asking, but a courtesy note costs nothing and
      pre-empts a takedown request.
