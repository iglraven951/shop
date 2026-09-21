# Review: Static rebuild, then pivot to a second-hand forum

## Metadata
- **Completed**: 2026-09-20
- **Total Sessions**: 1 (two phases)
- **Final Status**: SUCCESS (uncommitted — the user is reviewing first)

## Summary
Phase 1 replaced a broken published site with a static multi-page application
that works with no backend. Phase 2 followed the user's redefinition of the
product: DiscoveryShop is not a shop but a forum for second-hand items in
Arequipa, so cart, checkout, orders and reviews were removed and replaced with
social posts, moderation, roles and real district maps.

## Results vs Plan
| Requested | Delivered | Match? |
|---|---|---|
| Better filter design | Collapsible groups showing the active value per group | Yes |
| Remove "Explora por categoría" | Carousel deleted, no horizontal replacement | Yes |
| Facebook-style forum posts | Like, interest, save, comments on every post | Yes |
| No cart — promotion only | Cart, checkout and orders removed end to end | Yes |
| Real map per post | Leaflet, Arequipa districts, ~800 m approximate radius | Yes |
| Admin panel accepting submissions | Two queues: posts and seller applications | Yes |
| Map page with located sellers | `mapa.html`, clustering by district under zoom 13 | Yes |
| Buyer/seller roles, seller approved | Two-step registration, publishing gated | Yes |

## Verification Results
- Core data suite: **122/122 PASS**
- Integrity suite: **765/765 PASS**
- Syntax: **17/17 JavaScript files clean**; every CSS file balanced
- No remnant of the store model anywhere in the site
- Published payload: 43 files, 904 KB

## Files
| Area | Files | Lines |
|------|-------|-------|
| Pages (HTML) | 11 | ~2,370 |
| Core JavaScript | 4 | ~2,100 |
| UI JavaScript | 4 | ~1,400 |
| Page JavaScript | 9 | ~7,770 |
| CSS | 12 | ~8,200 |
| Tests | 2 | ~800 |

## Lessons Learned
1. **A bulk regex edit broke eight pages and the suite did not catch it.**
   Inserting a tag with `(<link rel="icon"[^>]*>)` matched the first `>` inside
   the favicon's inline-SVG data URI. Three agents found it before the tests
   did. The integrity suite now validates the data URI end to end, and that
   check was regression-tested by reintroducing the damage.
   Takeaway: never write a regex that stops at `>` when the attribute value can
   itself contain markup.
2. **`Number('') === 0` emptied the whole feed.** A price helper returned `0`
   for a blank field, so `max_price=0` filtered everything out. Found during the
   rewrite; the fix rejects the empty string before converting.
3. **Spelling checks need to exclude identifiers.** `publicacion.html` is a
   filename and `publicaciones` correctly carries no accent; the first version
   of the check flagged both. Lint rules over human language must understand
   where human language actually is.
4. **Parallel agents caught foundation gaps.** Several reported that the project
   had no global `[hidden]` reset, so any rule with its own `display` silently
   overrode the attribute. Fixed once in `base.css`.

## Follow-up Actions
- [ ] Commit and push once the user has reviewed
- [ ] Confirm Settings → Pages → Source is set to "GitHub Actions"
- [ ] Visual pass at 360 / 768 / 1440 px in both themes
- [ ] Consider untracking `backend/discovery_shop.db` (schema only, no data)
- [ ] The Flask backend still exposes cart/order routes the UI no longer calls;
      decide whether to retire them or leave them dormant
