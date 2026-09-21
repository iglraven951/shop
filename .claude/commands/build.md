# Build Commands

## There is no build step
The frontend is plain HTML, CSS and vanilla JavaScript loaded with ordered
`<script>` tags. What is in the repository is exactly what is published — this
is deliberate (see ADR-003), so a broken build can never produce a broken site.

## Deploy
```bash
git add -A && git commit -m "feat: ..." && git push
```
GitHub Actions (`.github/workflows/pages.yml`) publishes the repository root to
GitHub Pages on every push to `main`.

## Pre-push checklist
```bash
node tests/core.test.mjs
for f in assets/js/core/*.js assets/js/ui/*.js assets/js/pages/*.js; do node --check "$f"; done
```
