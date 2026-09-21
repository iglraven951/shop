# Architecture Overview

## What this is
A static, multi-page forum for second-hand items in Arequipa, Perú. No build
step, no framework, no npm. What is in the repository is exactly what gets
published to GitHub Pages.

## Layers

```
Pages (11 HTML files at the repo root — required by GitHub Pages)
   ↓ each loads the core in a fixed order, then its own page script
UI layer      assets/js/ui/      shell · components · modal · toast
   ↓ never calls fetch; talks only to the data layer
Data layer    assets/js/core/    api · store
   ↓ the only seam; nothing above it knows where data comes from
MockAPI + seed                    persisted in localStorage
```

## Why the data layer matters
There is no server. Every page calls `window.api.*` and never touches `MockAPI`
directly, so the site behaves identically on GitHub Pages, on a local static
server, and opened straight from disk — and `api.js` is the one file a real
server would plug into if one is ever added. See ADR-001 and ADR-008.

## CSS layers
```
tokens.css      design variables, light and dark themes
base.css        reset, utilities, shared animations
components.css  buttons, fields, modals, toasts, badges, steps
layout.css      header, footer, page shell, forum post, comments, pagination
pages/*.css     one file per page, class names prefixed by page
```
Page CSS never redefines what `layout.css` owns; it only adds what is specific
to that page. No page file may contain a raw hex color — everything resolves
through tokens so both themes stay correct.

## Global objects
Scripts are classic IIFEs sharing state on `window`, so load order is part of
the contract and is enforced by `tests/integrity.test.mjs`:

`DiscoverySeed` → `MockAPI` → `DS`/`store` → `api` → `toast` → `modal` → `UI` → `DiscoveryShell`
