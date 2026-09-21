# Project: DiscoveryShop

## Overview
A **forum for second-hand items in Arequipa, Perú**. People post things they no
longer use; others react, comment and message them directly. It is deliberately
**not a shop**: no cart, no payments, no orders. The platform only connects people.

## Tech Stack
- HTML5 + CSS3 + vanilla JavaScript (ES2020). No build step, no npm, no server.
- Leaflet 1.9.4 (maps only), loaded from a CDN with a graceful fallback.
- Deploy: GitHub Pages from `main`, via GitHub Actions.

## Quick Commands
- Serve locally: `py -m http.server 8080` → http://localhost:8080
- Tests: `node tests/core.test.mjs` and `node tests/integrity.test.mjs`

## Roles and permissions
| Role | Can |
|---|---|
| Visitor | Browse the feed, search, filter, open posts, view the map |
| Buyer (`role: 'buyer'`) | Plus: like, mark interest, save, comment, message |
| Approved seller (`seller_status: 'approved'`) | Plus: publish posts |
| Admin (`role: 'admin'`) | Approve/reject posts and seller applications |

Registering as a seller creates `seller_status: 'pending'`; the account works as
a buyer until an admin approves it. Every post starts `pending` too — only
approved posts reach the public feed. See ADR-005 and ADR-006.

## Architecture
There is no server. `window.api` (`assets/js/core/api.js`) is the only way the
interface reaches data, and it resolves everything against `MockAPI`
(`assets/js/core/mock-api.js`), which persists to `localStorage` starting from
`assets/js/core/seed.js`.

Pages never touch `MockAPI` directly. That one seam is why the site behaves
identically on GitHub Pages, on a local static server, and opened straight from
disk — and it is where a real server would plug in if one is ever added.
See ADR-001 and ADR-008.

## Layout
```
index.html         feed del foro
publicacion.html   post + comments + district map
mapa.html          every verified seller on a map of Arequipa
admin.html         moderation panel
login.html  registro.html  perfil.html  publicar.html  guardados.html
mensajes.html      direct messages
404.html
assets/
  css/   tokens · base · components · layout · pages/*
  js/
    core/  seed · mock-api · api · store
    ui/    toast · modal · components · shell
    pages/ one script per page
tests/   core.test.mjs · integrity.test.mjs
```

## Demo accounts (all with password `demo1234`)
| Email | Role |
|---|---|
| `admin@discoveryshop.pe` | Administrator |
| `juan@discoveryshop.pe` | Approved seller |
| `miguel@discoveryshop.pe` | Seller under review — cannot publish |
| `patricia@discoveryshop.pe` | Buyer |

## Important Notes
- Never interpolate data into HTML without `DS.escapeHtml()`.
- Location is always district-level, never an exact address (ADR-007).
- Data lives only in the visitor's browser. Clearing site data resets everything;
  the footer has a "Reiniciar datos demo" action that does it deliberately.
- The favicon is an inline SVG data URI whose `href` contains `>`. Keep it on a
  single line; a careless regex edit splits it and breaks the `<head>`.
