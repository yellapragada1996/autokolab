AK-190: Draw the whole app in the Needle shell, dark and light

The selected Needle study contained a placeholder command entry and no real tab content. This gallery applies its 168px open rail, 48px rows and right-edge marker to the current app screens, with all nine destinations visible and a permanent 3×3 phone grid. The only new control is the requested System / Light / Dark preference in the rail footer.

Open `docs/research/ui-polish/needle-wireframes/index.html` directly: it embeds its font, artwork, styles and small script. It includes the 1440/1024/390/320 shell, every requested tab at 1440/390, approved Overview v5, dark/light shell and Overview comparisons, style sheet, existing shared states, annotations and a source map. Current top-bar Search actions and Work's board search remain; there is no invented command entry, extra search, shortcut hint or key gutter. Text, fields, options and controls are audited against the current app, with only the explicitly forbidden shortcut hints omitted.

The ticket overrides older dark-only and hidden-phone-nav handoff guidance. Current app content overrides unbuilt screen-spec features. Approved v5 composition remains intact. Only `docs/research/ui-polish/needle-wireframes/` changes.

Validation:

- Generation and static audit pass: 36 frames, nine links each, current screen text/controls/tables, actual New ticket dialog, real Overview top-bar actions, exact v5 subtree, single-file resources, links/IDs, minimum type, reduced motion and Needle rules.
- Both themes pass 28 displayed contrast pairs, every tested semantic surface pair and 96 explicit generated text/background pairs.
- JavaScript syntax and `npm run typecheck` pass.
- `npm test` exits 1: site 436 passed; helper 520 passed, 28 failed, 18 skipped, with one unhandled socket error. Failures include blocked Git subprocesses/sockets, read-only helper state and process-output/assertion failures. Database policy tests were not reached.
- All four system/bundled Chromium launches fail with `Operation not permitted` / `SIGTRAP`. No screenshots or rendered checks were possible. Layout, wrapping, targets, focus, both themes and comparisons remain unverified; see `browser-check.json`.
- Website build is not required for this docs-only scope. No app files, settings, dependencies or migrations change.

Publication note: the builder could not stage because the shared Git directory is read-only (`index.lock`). The authorised runner must commit/push this folder on `ak-190-full-wireframes-of-the-whole-app`, open this PR against `main`, and confirm green checks. Do not merge it from the builder session.
