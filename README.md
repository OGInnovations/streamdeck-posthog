# PostHog for Stream Deck

Show live values from your PostHog insights on Elgato Stream Deck keys.

The **Insight Value** action polls a saved PostHog insight and draws its current
number on the key, with an optional caption. Pressing the key refreshes it
immediately.

## Setup

1. In PostHog, go to **Settings → Personal API keys** and create a key scoped to
   `insight:read`.
2. Drop **PostHog → Insight Value** onto a key.
3. Open the insight in PostHog and paste its address into **Insight**, e.g.
   `https://us.posthog.com/project/12345/insights/AbCdEf12`. The URL carries the
   host, project and insight, so no other field is strictly required.
4. Expand **PostHog connection** and paste your personal API key.

The host and project ID under **PostHog connection** are shared by every key, so
they only need entering once. A pasted insight URL always wins over them, which
is how a single Stream Deck can mix Cloud US, Cloud EU and self-hosted projects.

## Which number does it show?

Insight results are not one shape, so the plugin probes in order of
specificity: `aggregated_value` (what single-value trends provide), then
`count`, then the most recent point of the `data` series. **Series** picks which
series of a multi-series insight to read.

If an insight has no number the plugin recognises, the key shows `⚠` with the
reason — as it does for an invalid key, a missing insight or a rate limit.

## Development

Requires Node 20+ and the Stream Deck app 6.5 or later.

```sh
npm install
npm run build      # bundle to io.ogin.streamdeck.posthog.sdPlugin/bin
npm run watch      # rebuild and restart the plugin on change
npm test           # unit tests (node:test)
npm run typecheck
npm run validate   # Elgato's marketplace validation rules
```

To run it against your own Stream Deck for the first time:

```sh
npx streamdeck dev                                    # enable developer mode
npx streamdeck link io.ogin.streamdeck.posthog.sdPlugin
npx streamdeck restart io.ogin.streamdeck.posthog
```

Plugin logs land in `io.ogin.streamdeck.posthog.sdPlugin/logs/`. The log level
is currently `debug` for development; lower it to `info` in `src/plugin.ts`
before packaging for the Marketplace.

### Settings and event loops

Stream Deck answers `getGlobalSettings` and `getSettings` with the same
`didReceiveGlobalSettings` / `didReceiveSettings` events that listeners
receive, and the reply cannot be told apart from the user editing a value.
Reading settings from inside one of those handlers therefore requests them
again, which arrives as another event, and the plugin floods the websocket
until the Stream Deck application stops responding. Global settings are read
once at startup and cached in `src/global-settings.ts`; per-key settings are
tracked from the events that carry them. Nothing outside startup calls
`getGlobalSettings` or `getSettings`.

Icons are generated rather than committed as opaque binaries — regenerate with
`node tools/make-icons.mjs` after editing that script.

## Shipping to the Elgato Marketplace

`npm run pack` produces `dist/io.ogin.streamdeck.posthog.streamDeckPlugin`,
which is what the Marketplace accepts. Before submitting:

- `npm run validate` must pass with no errors or warnings.
- Register for a Maker account at <https://marketplace.elgato.com/maker> and
  create the plugin listing under the UUID `io.ogin.streamdeck.posthog`. **The
  UUID is permanent once published**, so it must stay on a domain you control.
- Replace the generated placeholder artwork in `imgs/` with real artwork. The
  Marketplace listing additionally wants screenshots and a plugin description
  beyond what `manifest.json` carries.
- Add the `URL` field back to `manifest.json` pointing at the public repository
  or a support page. It was left out here because validation flags a URL that
  does not resolve.
- Bump `Version` in `manifest.json` (four-part, e.g. `0.2.0.0`) for each
  submission; the Marketplace rejects a re-upload of an existing version.

## Privacy

The personal API key is stored by Stream Deck in the plugin's global settings on
this machine and is sent only to the PostHog host you configure. The plugin
makes no other network requests, and the property inspector loads no remote
resources.
