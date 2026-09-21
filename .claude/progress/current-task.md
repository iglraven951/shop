# Current Task

## What
Forum pivot complete and verified. Awaiting the user's review before committing.

## Why
The user redefined the product: DiscoveryShop promotes second-hand items so
people can contact each other. It never handles money.

## Progress
- [x] Core rewritten: seed, mock-api, api, store, shell, components, forum CSS
- [x] Cart, checkout, orders and reviews removed end to end
- [x] "Explora por categoría" carousel removed as requested
- [x] Eleven pages built by eight parallel agents
- [x] Core suite: 122/122
- [x] Integrity suite: 765/765
- [x] Syntax clean on all 17 JavaScript files; all CSS balanced
- [x] No remnant of the store model anywhere in the site
- [ ] Commit and push — the user is reviewing first

## Open questions for the user
1. "Pedidos" in the admin panel was read as **publicaciones** (post approval),
   since purchase orders no longer exist. Confirm this matches their intent.
2. Location is district-level, never an exact address, because private
   individuals sell from home. Confirm this is acceptable, or switch to
   seller-chosen public meeting points.
3. GitHub Pages source setting is still unknown; the Actions workflow needs
   Settings → Pages → Source set to "GitHub Actions".

## Blockers
None
