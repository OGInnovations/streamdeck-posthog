# Live Metrics for PostHog

Show live values from your PostHog insights on Elgato Stream Deck keys.

Not affiliated with or endorsed by PostHog.

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

## Appearance

Each key is drawn by the plugin as an SVG image rather than handed to Stream
Deck as a title, because a title gives one font size and one colour for the
whole thing, which leaves the value and its caption competing for the same
72x72 space. Generating the image allows a hierarchy: a large value, a quiet
caption above it, a trend line beneath.

Per key, the property inspector offers:

| Setting | Notes |
| --- | --- |
| **Theme** | Dark, Light, PostHog orange, Midnight, Mint, or Custom |
| **Custom colours** | Background, value, caption and sparkline, shown when the theme is Custom |
| **Value size** | Automatic (fills the key) or a fixed Small / Medium / Large |
| **Caption** | Your own text, or the insight's series name by default; can be hidden |
| **Trend sparkline** | Plots the insight's series along the bottom of the key |
| **Change vs previous point** | Adds an arrow and a percentage |
| **Falling is good** | Flips the trend colours, for metrics like error rate |
| **Abbreviate / decimals / prefix / suffix** | Number formatting |

The value is scaled to fit the key, so `1,284,553` shrinks rather than
overflowing, and a value with nothing else on the key is drawn larger.

The "change vs previous point" figure compares the last two points of the
series. The final point of a PostHog trend is usually the period still in
progress, so it reads as "today so far versus yesterday" rather than a
like-for-like comparison — which is why it is off by default.

## How often it asks PostHog, and for what

PostHog can either return an insight's cached result or recompute it. Recomputing
is expensive and counts against the project's query capacity, so:

- **Polling** serves whatever PostHog already has cached. A deck of keys
  refreshing every minute costs almost nothing.
- **Pressing a key** asks PostHog to recompute, which is the point of pressing it.
- **Starting the plugin or changing the connection settings** refreshes every
  visible key from PostHog's cache. It deliberately does not recompute:
  otherwise every restart would storm the query engine once per key.
- An insight nobody has opened yet has no cached result, so the plugin asks for
  one recomputation rather than showing an error indefinitely.

Values are also cached in the plugin for ten seconds and shared between keys, so
several keys pointing at one insight make a single request. Polling is floored at
15 seconds.

If PostHog rate-limits the project (HTTP 429), the plugin stops requesting for as
long as the `Retry-After` header asks, or a minute if it gives no hint — for
every key on that project, not just the one that hit the limit. Editing the
connection settings clears the wait.

## Which number does it show?

Insight results are not one shape, so the plugin probes in order of
specificity: `aggregated_value` (what single-value trends provide), then
`count`, then the most recent point of the `data` series. **Series** picks which
series of a multi-series insight to read.

If an insight has no number the plugin recognises, the key shows `⚠` with the
reason — as it does for an invalid key, a missing insight or a rate limit.

## Development

Requires Node 20+ and the Stream Deck app 6.9 or later.

The plugin builds in two variants. Stream Deck identifies a plugin by its UUID
and requires the `.sdPlugin` directory to be named after it, so a locally linked
build and a Marketplace install cannot share one identifier — installing either
would displace the other. The development variant therefore carries its own:

| | Release | Development |
| --- | --- | --- |
| UUID | `io.ogin.streamdeck.posthog` | `io.ogin.streamdeck.posthog.dev` |
| Shown as | PostHog | PostHog (Dev) |
| Directory | committed | generated, not committed |
| Keys marked | no | thin purple stripe along the top edge |

Both can be installed at once, so you can develop against the local build while
running the released one from the Marketplace.

```sh
npm install
npm run dev:link    # build the dev variant and link it to Stream Deck
npm run dev         # rebuild and restart it on every change
npm test
npm run typecheck
npm run validate    # Elgato's marketplace rules, release variant
npm run dev:validate
npm run build       # release bundle
npm run pack        # release .streamDeckPlugin in dist/
npm run dev:unlink  # remove the dev plugin from Stream Deck
```

The first time on a machine, enable developer mode with `npx streamdeck dev`.

The development variant is generated from the release manifest by
`tools/make-variant.mjs`, so there is only ever one manifest to edit; its UUIDs,
names and category are derived. The UUID reaches the bundle through a virtual
`virtual:identity` module supplied by `rollup.config.mjs`, so the action always
registers the identifier matching the manifest it was built for.

Because Stream Deck scopes settings to the plugin UUID, the two variants keep
**separate** API keys and key configurations. That is usually what you want —
point the development build at a test project — but it does mean entering the
connection details in each.

Plugin logs land in `<variant>.sdPlugin/logs/`. Raise the level to `debug` in
`src/plugin.ts` to trace what each key renders and why.

Key designs can be previewed without a Stream Deck: render the SVG for a set of
states and rasterise it with `qlmanage -t -s 288 -o . key.svg`. That is how the
themes were checked.

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

Artwork is generated rather than hand-drawn in a binary editor:

```sh
node tools/make-artwork.mjs             # plugin, category, action and key artwork
node --import tsx tools/make-listing.ts # Marketplace thumbnail and gallery images
```

Both need macOS: the PNGs are rasterised with `qlmanage`. The generated files
are committed, so building the plugin does not need a Mac. Two quirks of that
rasteriser are worth knowing if you edit the tools — it ignores `scale()`
transforms, and it only renders SVG at full size from 512 pixels upwards, so
artwork is authored at absolute coordinates and rendered large before being
reduced or cropped.

## Shipping to the Elgato Marketplace

`npm run pack` produces `dist/io.ogin.streamdeck.posthog.streamDeckPlugin`,
which is what the Marketplace accepts. Listing copy and the required images are
in [`docs/marketplace/`](docs/marketplace/listing.md), including a
pre-submission checklist.

Artwork follows Elgato's guidelines: the plugin icon is PNG at 256 × 256 and
512 × 512, category and action icons are SVG, and the action icon is
monochrome white on a transparent background. Listing images are 1920 × 960.

Two things to know before submitting:

- The Maker console requires `SDKVersion` 3 and a `Software.MinimumVersion` of
  6.9 or later; SDK 3 is only valid from 6.9 up. Anything lower is rejected at
  upload, and also disables Elgato's DRM protection.
- The manifest `URL` must resolve, or `npm run validate` warns that it 404s.
- `Version` in `manifest.json` is four-part (`1.0.0.0`) and must increase for
  each submission; the Marketplace rejects a re-upload of an existing version.
  Keep it in step with `version` in `package.json`.

The plugin's name follows PostHog's brand policy, which permits the "X for PostHog" form but prohibits using their name as a project's main branding, and
prohibits the hedgehog mascot outright. The artwork here uses neither their
logo nor their mascot.

## Privacy

The personal API key is held in Stream Deck's global settings for this plugin,
which Stream Deck persists in the operating system's credential store — on
macOS, a login keychain item named `com.elgato.StreamDeck.<plugin UUID>`. No
plaintext copy is written under Stream Deck's application support directory.
That protects the key at rest; it does not protect it from software already
running as you, and the plugin necessarily holds the key in memory to make its
requests.

The key is sent only to the PostHog host you configure, over HTTPS. The plugin
makes no other network requests, and the property inspector loads no remote
resources — `sdpi-components.js` is vendored rather than fetched from a CDN.
Nothing is logged that contains the key: the debug output records whether each
connection field is set, not its value.

Scope the personal API key to `insight:read` in PostHog. That is all the plugin
uses, and it means a leaked key cannot write to your project. Keys are
revocable from PostHog at any time.

Note that Stream Deck scopes settings per plugin UUID, so the development build
keeps its own key, and renaming a plugin's UUID leaves the old credential
behind in the credential store.

## Licence

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 OG Innovations.
