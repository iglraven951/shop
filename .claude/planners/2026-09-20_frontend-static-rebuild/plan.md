# Plan: Static frontend rebuild

## Metadata
- **Created**: 2026-09-20
- **Status**: IN_PROGRESS
- **Priority**: CRITICAL
- **Complexity**: LARGE (30+ files)

## Context
The published site at https://iglraven951.github.io/shop/ was broken. Concretely:

1. `frontend/js/productos-forum.js` rendered `p.reviews`, `p.messages`,
   `p.location.city`, `product.stock`, `product.seller.total_sales` and
   `product.location.country` — none of which existed in its own mock data, so
   the page printed `undefined` in the seller line, the footer and the detail panel.
2. It called `http://localhost:5000/api/products` from an HTTPS page. Browsers
   block that as mixed content, so every load stalled for the full 3-second
   AbortController timeout before falling back.
3. `mostrarVacio()` set `display: none` on the grid and nothing ever restored it,
   so a filter with no matches broke the page until a reload.
4. The map and messages modals existed in `index.html` but no script bound them —
   the buttons were dead.
5. `frontend/js/auth.js` hardcoded `http://localhost:5000/api`, so login and
   registration could not work on the published site.
6. All images pointed at `via.placeholder.com`, offline since 2024.

## Requirements
### Functional
1. Every feature works with no backend running: browse, filter, sort, paginate,
   search, register, log in, cart, checkout, orders, reviews, publish a listing,
   favorites, seller chat.
2. When a Flask backend is reachable, use it automatically instead.
3. `git push` must be the whole deploy pipeline.

### Non-Functional
1. No build step, no npm, no framework.
2. Responsive from 360 px to 1440 px, no horizontal scroll.
3. Light and dark themes.
4. All user data escaped before reaching innerHTML.
5. Keyboard accessible: focus trapping in modals, roving tabindex in tabs,
   visible focus rings, 44 px touch targets.

### Out of Scope
- Real payments, real shipping integration, real-time WebSockets.
- Migrating or modifying the Flask backend.
- Removing the legacy `frontend/` directory (kept for reference).

## Architecture Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data source | Dual-mode ApiClient | Published site must work with zero infra (ADR-001) |
| Images | Generated SVG data URIs | Placeholder host is dead; no network dependency (ADR-002) |
| Build | None, static MPA | Push is the deploy; no build can break it (ADR-003) |
| Header/footer | Injected by shell.js | Nine pages, one source of truth (ADR-004) |

## Implementation Strategy
### Phase 1: Foundations (done, by the main session)
- [x] Design tokens, base, components, layout CSS
- [x] Seed catalog with generated images
- [x] MockAPI mirroring the Flask contract
- [x] ApiClient with live/demo detection
- [x] Store, toast, modal, shared components, app shell
- [x] Core test suite — 85 assertions

### Phase 2: Pages (8 parallel agents)
- [ ] Catalog, product detail, cart/checkout, auth, profile, sell, chat,
      favorites + 404 + CI

### Phase 3: Integration
- [ ] Cross-page link audit, script-order audit, syntax check
- [ ] Responsive and theme verification
- [ ] Commit and push

## Verification Checklist
- [ ] `node tests/core.test.mjs` passes
- [ ] `node --check` clean on every JS file
- [ ] Every internal link resolves to a file that exists
- [ ] No page references `frontend/` or `localhost:5000` directly
- [ ] No `console.log` left in page scripts
