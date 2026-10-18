# Needle shell

Open `index.html` directly. Only two 1440 × 900 windows: dark, then light.
Keep the bundled original croc SVG and Geist font beside it.
AK-193 adds a Light / Dark switch beside the account name in each window's footer.

Rail, footer, content and theme rules and markup are copied from option 03 in
`../shell-options-2/index.html`, including its croc plus live-text wordmark.
AK-192 moves the single page title into the existing top bar and removes the
placeholder label. AK-191 removes the command entry and shortcut hints.
Each window has one project selector and all nine navigation rows.

Source-derived measurements in CSS pixels, relative to the window origin:

| Measurement | Option 03 | This page |
| --- | --- | --- |
| Croc size; left / top | 32 × 32; 10 / 16 | 32 × 32; 10 / 16 |
| Wordmark size / weight; croc gap | 15 / 600; 5 | 15 / 600; 5 |
| Brand padding, vertical / horizontal | 14 / 10 | 14 / 10 |
| Rail width | 168 | 168 |
| Brand / project / top bar heights | 64 / 64 / 64 | 64 / 64 / 64 |
| Croc bottom → project box top | 16 | 16 |
| Project box bottom → first row | 4 | 4 |
| First row top; row height; row gap | 132; 48; 3 | 132; 48; 3 |
| Row left padding; selected right border | 18; 2 | 18; 2 |
| Rail hairline position / width | 167 / 1 | 167 / 1 |
| Footer height; padding; gap; text size | 88; 12; 6; 12 | 88; 12; 6; 12 |
| Sign out left margin; avatar size | 34; 26 × 26 | 34; 26 × 26 |
| Content padding, all sides; left edge | 48; 216 | 48; 216 |
| Placeholder heights; gap; radius | 100 / 172; 16; 0 | 100 / 172; 16; 0 |
| Window at requested comparison size | 1440 × 900* | 1440 × 900 |

*Option 03's native frame is 1280 × 800; compare at 1440 × 900 with only its
frame dimensions changed. Its remaining measurements above stay unchanged.
Moving the title into the top bar removes the old heading's space: the first
block starts at y=112 rather than y=186.5. Captions are outside both windows.

Checks: copied CSS declarations, original asset bytes, both window structures,
allowed controls and theme text contrast verified from source. Browser preview
and screenshots unavailable: system Chromium failed with `setsockopt: Operation
not permitted`; Playwright Chromium failed with `shutdown: Operation not
permitted`. Rendered appearance remains for the reviewer to check.
