# Troubleshooting

## The feed comes back empty for no reason
Check the URL for `max_price=0`. A helper once returned `0` for a blank price
field because `Number('') === 0` passes `Number.isFinite(v) && v >= 0`, and the
filter `p.price <= 0` then excluded everything. `positiveNumber()` in `feed.js`
now rejects the empty string before converting. If you copy that helper, copy
the guard with it.

## A page renders but the header is broken
The favicon is an inline SVG inside a data URI, so its `href` contains `>`.
A regex like `(<link rel="icon"[^>]*>)` matches the first `>` **inside the SVG**
and splits the attribute across two lines, which breaks the whole `<head>`.
Keep that link on one line. `tests/integrity.test.mjs` validates the data URI
end to end and will catch it.

## The map is blank or cut off
Leaflet measures its container on creation. If the container was hidden (a
closed tab, a collapsed panel) it computes a size of zero. Call
`map.invalidateSize()` after the container becomes visible — both map pages do
this via `IntersectionObserver` and on resize.

## Leaflet panes cover the sticky header
Leaflet's panes use z-index 400–800. Give the map's wrapper `z-index: 0` so it
creates its own stacking context and stays under the header.

## An element ignores the `hidden` attribute
`hidden` only carries user-agent specificity, so any rule with its own
`display` silently overrides it. `base.css` now has a global
`[hidden] { display: none !important; }`. If you see an element that will not
hide, confirm that rule survived.

## Changes do not show up on the published site
Hard-refresh first. If it persists, check the Actions tab: the workflow runs
both test suites and refuses to publish a failing commit, which is intentional.
Also confirm Settings → Pages → Source is "GitHub Actions"; with "Deploy from a
branch" the workflow reports a red X even though the branch still publishes.

## `python` hangs in Git Bash
On Windows, bare `python` is the Microsoft Store stub and waits on input
forever. Use `py` instead.

## Demo data is in a strange state
Footer → "Reiniciar datos demo", or clear `localStorage` for the origin. The key
is `discoveryshop:db:v2`; bumping `SCHEMA_VERSION` in `mock-api.js` also forces
a rebuild from seed on next load.
