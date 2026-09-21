# Dependencies

## Frontend — one, and it is optional
| Dependency | Version | Where | If it fails |
|---|---|---|---|
| Leaflet | 1.9.4 (unpkg CDN) | `publicacion.html`, `mapa.html` | Both pages check `typeof L === 'undefined'` and fall back: a static district card, and a list grouped by district |

Nothing else. No npm, no bundler, no font CDN, no icon library — icons are
inline SVG and product images are generated SVG data URIs, so the site works
offline and from `file://`.

Map tiles come from OpenStreetMap. Their attribution is required by licence and
is asserted by the test suite.

## Tooling (development only)
| Tool | Used for |
|---|---|
| Node.js 22+ | Running the two test suites; `node --check` for syntax |
| Python 3.13 | `py -m http.server` to serve the site locally |

## Runtime
None. There is no server, no database and no API to deploy. What is in the
repository is the whole application.
