# Test Commands

## Frontend core (data layer)
Runs the data layer outside the browser against a minimal DOM shim and
asserts the full contract: feed, filters, sorting, pagination, auth, roles and
permissions, post moderation, seller approval, forum interactions (like,
interest, save), comments, the seller map, messaging and persistence.

It also asserts that the retired endpoints stay gone: `/api/cart` and
`/api/orders` must answer 404.

```bash
node tests/core.test.mjs
```

Expected: `122 correctas, 0 fallidas`. Exit code 1 on any failure.

## Site integrity
Checks what unit tests cannot see: internal links resolve, script load order,
IDs referenced in JS exist in the HTML, output is escaped, Spanish diacritics,
the favicon data URI is intact, and no page links a retired page.

```bash
node tests/integrity.test.mjs
```

Expected: `765 comprobaciones correctas, 0 problemas`.

## JavaScript syntax check
```bash
for f in assets/js/core/*.js assets/js/ui/*.js assets/js/pages/*.js; do node --check "$f"; done
```

## Manual browser pass
Serve statically and click through every page:
```bash
python -m http.server 8080
```
Then walk the four roles, because most of the behaviour is permission-dependent:

| Account (password `demo1234`) | What to verify |
|---|---|
| no session | Feed, filters, post detail, map all work; reacting prompts to log in |
| `patricia@discoveryshop.pe` | Like, interest, save, comment, messages; publishing is blocked with the option to apply |
| `miguel@discoveryshop.pe` | Seller under review — still cannot publish |
| `juan@discoveryshop.pe` | Can publish; the new post lands in review, not in the feed |
| `admin@discoveryshop.pe` | Approve and reject in `admin.html`; the approved post then appears in the feed |

Pages: index → publicacion → mapa → guardados → mensajes → perfil → publicar →
admin → login → registro → 404. Verify at 360 px, 768 px and 1440 px, and in
both light and dark themes.
