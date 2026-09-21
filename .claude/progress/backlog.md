# Backlog

## Open questions for the user
- [ ] Confirm that "pedidos" in the admin panel meant **publicaciones**
      (post approval), which is how it was built.
- [ ] Confirm district-level location is acceptable, or switch to
      seller-chosen public meeting points for more precision.
- [ ] Decide whether to keep the Flask backend (`backend/`, `alembic/`,
      `scripts/`) or retire it along with live mode.
- [ ] Set Settings → Pages → Source to "GitHub Actions" so the workflow is
      authoritative and gates deploys behind the tests.

## Known gaps
- [ ] "Guardados recientes" sorts by publication date: the API records no
      `saved_at`. Add the field to sort truthfully.
- [ ] Notifications are written by the backend (`interest`, `comment`,
      `post_approved`…) but nothing surfaces them in the interface yet.
- [ ] Post images are generated SVGs. Real uploads need a storage story that a
      static site cannot provide on its own.
- [ ] The Flask backend still exposes cart and order routes the interface no
      longer calls.

## Nice to have
- [ ] Visual pass at 360 / 768 / 1440 px in both themes.
- [ ] Untrack `backend/discovery_shop.db` (schema only, no data, but it does not
      belong in version control).
- [ ] Seller reputation based on completed deals rather than a seeded number.
