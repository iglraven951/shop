# Patterns Used

## Escape at the boundary
Every value that reaches `innerHTML` passes through `DS.escapeHtml` (or
`escapeAttr` inside an attribute). Comments and chat messages are user-authored,
so this is a security rule, not a style preference. When markup must be added to
user text — newlines to `<br>`, for instance — escape first, then add markup.
`tests/integrity.test.mjs` fails the build if a page script interpolates into a
template that reaches `innerHTML` without escaping.

## Normalize before rendering
`UI.normalizePost` fills the holes a real backend can return as null (`author`,
`category`, `location`). Templates then render unconditionally instead of
guarding every field. Added after the live-mode serializer was found to emit
`seller: null`.

## Reversible empty states
Empty states live in a container **beside** the list, never on top of it. The
list is emptied and refilled, never hidden with `display: none`. The original
site had a bug where one filter with no matches hid the grid permanently.

## Delegated actions
`UI.bindPostActions(container)` attaches one listener to the container and reads
`data-action`, so re-rendering cards never loses their behaviour and never
double-binds. It is idempotent by a `data-actions-bound` flag.

## Session is resolved per page, not awaited from the shell
`shell.js` populates `store.user` asynchronously. Pages that need the user call
`api.getCurrentUser()` themselves when `store.get('user')` is still empty,
rather than depending on the shell winning the race.

## Gate by not rendering
`publicar.html` keeps its form inside a `<template>` and clones it only for an
approved seller. Content inside a template is not in the document: it cannot be
focused, read by assistive technology, or revealed by editing CSS. Hiding a
privileged form with a class is not a gate.

## Deterministic fake data
`DiscoverySeed` derives colors, ratings and review counts from a hash of the
title, so the same catalog always looks the same. Screenshots and manual checks
stay comparable across reloads.
