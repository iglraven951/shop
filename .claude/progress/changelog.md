# Changelog

## 2026-09-20 (2) — Pivot from storefront to second-hand forum

The user redefined the product mid-build: DiscoveryShop is not a shop. It exists
to promote used items so people can reach each other directly.

### Removed
- Cart, checkout and orders — endpoints, pages, badges and every UI affordance
- Product reviews and star ratings
- The "Explora por categoría" carousel (explicitly requested)
- Pages: `carrito.html`, `producto.html`, `vender.html`, `favoritos.html`
  (backed up to the session scratchpad before deletion)

### Added
- **Forum posts** rendered like a social feed, with four distinct interactions:
  ❤️ like, 🙋 interest (notifies the seller), 🔖 save (private) and 💬 comments
- **Roles**: buyer (instant) / seller (needs approval) / admin
- **Moderation**: every post starts `pending`; editing an approved post returns
  it to review; rejections require a reason, stored and shown to the author
- **Arequipa by district**: 18 districts with real coordinates; a Leaflet map on
  every post showing an ~800 m approximate radius
- **`mapa.html`**: every verified seller located, clustering by district below
  zoom 13, implemented without markercluster
- **`admin.html`**: two moderation queues, batch actions, keyboard shortcuts and
  an audit log
- **Two-step registration** choosing buyer or seller
- **`publicar.html`** with four gate states, and **`guardados.html`**

### Fixed
- A helper inherited from the old feed returned `0` for an empty price field, so
  `max_price=0` in the URL emptied the entire feed. Found by an agent during the
  rewrite.
- A bulk regex edit had split the favicon data URI across eight pages, breaking
  their `<head>`. Repaired, and the integrity suite now checks the data URI end
  to end (regression-tested by reintroducing the damage).

### Verification
- Core suite rewritten for the new model: **122/122**
- Integrity suite updated to the new page map: **765/765**
- 17 JavaScript files syntax-clean; every CSS file balanced
- Published payload: 43 files, 904 KB, nothing extraneous
