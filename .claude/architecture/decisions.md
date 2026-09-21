# Architecture Decision Records

## ADR-001: Dual-mode data layer (live API with automatic demo fallback)
- **Date**: 2026-09-20
- **Status**: Accepted
- **Context**: The site is published on GitHub Pages, which serves static files
  over HTTPS only. The legacy frontend called `http://localhost:5000` directly,
  so every request was blocked as mixed content and the page rendered empty
  after a 3-second stall. The user's hard requirement is that the published page
  must always work without running `py app.py`.
- **Decision**: Introduce `ApiClient` (`assets/js/core/api.js`) as the single data
  entry point. On startup it probes `/api/products/health` with a 1.2 s timeout
  and caches the verdict in `sessionStorage`. If the page is HTTPS and the base
  URL is HTTP, it skips the probe entirely and goes straight to demo mode, since
  the browser would block it anyway. In demo mode all requests are served by
  `MockAPI`, an in-browser implementation of the same contract backed by
  `localStorage`. If a live backend dies mid-session, requests degrade to demo
  instead of failing.
- **Consequences**: The UI never branches on data source — it calls the same
  methods either way. The published site is fully functional (auth, cart,
  orders, reviews, chat, favorites) with zero infrastructure. The cost is that
  `MockAPI` must be kept in sync with `backend/routes/*.py` whenever the real
  contract changes.

## ADR-002: Procedurally generated SVG data-URI images
- **Date**: 2026-09-20
- **Status**: Accepted
- **Context**: Every product image pointed at `via.placeholder.com`, which has
  been offline since 2024, so the catalog showed broken images everywhere.
- **Decision**: `DiscoverySeed.createImage(label, emoji)` builds a gradient SVG
  with the product's emoji and returns it as a data URI. Colors derive from a
  stable hash of the title, so a product always looks the same.
- **Consequences**: Images never 404, need no network, and work offline and from
  `file://`. They are illustrative rather than photographic — acceptable for a
  demo catalog, and real `image_url` values from the live API take precedence.

## ADR-003: Static multi-page site, no build step
- **Date**: 2026-09-20
- **Status**: Accepted
- **Context**: The project has no `package.json` and the user deploys by pushing
  to `main`. Any bundler would add a build step that can fail silently and leave
  a broken published site.
- **Decision**: Plain HTML pages at the repo root, vanilla ES2020 in IIFEs loaded
  with ordered `<script>` tags, CSS split into tokens / base / components /
  layout / per-page. No modules, no npm, no transpilation.
- **Consequences**: `git push` is the entire deploy pipeline and the published
  output is exactly what is in the repo. Shared state lives on `window`
  (`api`, `store`, `DS`, `UI`, `toast`, `modal`), which requires discipline about
  script order — documented in the page template.

## ADR-004: Shell injected from JavaScript
- **Date**: 2026-09-20
- **Status**: Accepted
- **Context**: Nine pages need an identical header (search, cart badge, session
  menu, theme toggle) and footer. Duplicating that markup guarantees drift.
- **Decision**: `assets/js/ui/shell.js` renders both into `#app-header` and
  `#app-footer` placeholders on `DOMContentLoaded`.
- **Consequences**: Navigation and session UI are consistent everywhere and fixed
  in one place. The header is not in the initial HTML, so its height is reserved
  via `--header-height` to avoid layout shift.

## ADR-005: Forum model replaces the storefront
- **Date**: 2026-09-20
- **Status**: Accepted (supersedes the commerce parts of ADR-001)
- **Context**: The user clarified that DiscoveryShop is not a shop. It exists to
  promote second-hand items so buyers and sellers can find each other; no money
  moves through the platform. A cart, a checkout and orders were modelling a
  transaction that never happens.
- **Decision**: Drop cart, orders and reviews entirely. Model each listing as a
  forum post with the social affordances people already understand from
  Facebook: like (❤️), interest (🙋, which notifies the seller), save (🔖,
  private) and public comments. Sorting by `popular`, `interest` and `commented`
  replaces sorting by discount and stock.
- **Consequences**: `MockAPI` no longer mirrors the Flask cart/order routes, so
  those endpoints exist only in the backend and are unreachable from the UI. The
  three reaction types are deliberately distinct — collapsing like and save into
  one control was tried in the old design and lost the "notify the seller"
  signal, which is the point of the forum.

## ADR-006: Every post is moderated before it is visible
- **Date**: 2026-09-20
- **Status**: Accepted
- **Context**: The user asked for an admin panel deciding which submissions are
  accepted, and for sellers to be approved before they can publish.
- **Decision**: Two gates. (1) A user registers as buyer or seller; choosing
  seller creates `seller_status: 'pending'` while `role` stays `buyer`, so they
  can use the forum fully but `requireApprovedSeller` blocks publishing with an
  explanatory 403. (2) Every post is created with `status: 'pending'` and only
  `approved` posts appear in the public feed; the author and admins can still
  see their own. Editing an approved post sends it back to review. Rejections
  require a reason of at least 8 characters, which is stored on the post and
  shown to its author.
- **Consequences**: The feed is trustworthy but not instant, so the publish form
  and the profile both state plainly that a review comes first. Moderation
  decisions are appended to `moderation_log` for an audit trail. The demo seeds
  a few pending posts and pending seller applications so the panel is not empty
  on first visit.

## ADR-007: District-level location, never an exact address
- **Date**: 2026-09-20
- **Status**: Accepted
- **Context**: Posts and sellers must appear on a real map of Arequipa by
  district. Publishing a precise home address for private individuals selling
  used goods would be unsafe.
- **Decision**: Location resolves to one of 18 Arequipa districts with real
  centre coordinates in `DiscoverySeed.DISTRICTS`. Seller markers get a small
  deterministic jitter so several sellers in one district do not stack on the
  same pixel. The post map draws an ~800 m circle and states in the interface
  that the location is approximate to the district.
- **Consequences**: The map is useful for "is this near me?" without exposing
  anyone. Leaflet loads from a CDN, so both map views must degrade to a readable
  list when it is unavailable — the site still has to work offline.

## ADR-008: The Flask backend is retired; the site is purely client-side
- **Date**: 2026-09-20
- **Status**: Accepted (supersedes the live-mode half of ADR-001)
- **Context**: ADR-001 gave the frontend two modes so it could use a real API
  when one was running. In practice the published site always ran in demo mode,
  the backend still modelled carts and orders that ADR-005 removed, and 162
  Python files sat in the repository that nothing reached. The user asked for
  the project to be cleaned up and chose to delete it.
- **Decision**: Remove `backend/`, `alembic/` and `scripts/`. Collapse
  `ApiClient` to a single path that resolves against `MockAPI`: no environment
  detection, no health probe, no `fetch`, no mid-session degradation. `ready()`
  stays and resolves immediately so pages keep their existing shape. The footer
  indicator no longer reports a mode; it states plainly that data is stored in
  the visitor's browser, which is the fact that actually matters to them.
- **Consequences**: `api.js` went from 416 to 331 lines and the repository from
  about 5 MB to 800 KB. The seam survives: pages still call only `window.api.*`,
  so adding a server later means changing one file rather than every page. The
  cost is that data is per-browser and per-device — no accounts or posts are
  shared between visitors, which is correct for a demonstration but would need a
  real backend to become a working product.
- **Recovery**: the deleted trees remain in git history at `f87dc69`:
  `git checkout f87dc69 -- backend alembic scripts`.
