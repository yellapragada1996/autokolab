# AK-152 briefing size check

The reproducible test is `packages/autokolab/test/decisions-read.test.ts` ("keeps the AK-152 build briefing under 24 KB"). It uses AK-152's ticket description and done means supplied to the runner. The repository's `GUIDE.md` stands in for the live project guide because the live guide cannot be read from this workspace. The old side is a **lower bound**: it includes that guide and the rendered AK-152 ticket, but omits the old board and active-decision list. The new side uses `buildBrief()` with the same ticket.

| Bytes, UTF-8 | Old lower bound | Focused briefing |
|---|---:|---:|
| Briefing payload | 59,986 | 1,604 |
| Complete initial prompt in the test | 65,808 | 7,402 |

The initial prompt uses the same runner configuration on both sides. AK-151's `promptSections()` attributes the old prompt to `prompt_guide` 58,591, `prompt_ticket` 1,394, `prompt_comments` 36 and `prompt_other` 5,787 bytes. The focused prompt is 75, 1,394, 36 and 5,897 bytes in those sections, respectively. The extra 110 bytes in `prompt_other` identify the smaller project context and the on-demand tools. The result is a prompt-size comparison, not a token or live Supabase measurement. Actual tickets, comments, decisions and board size vary.
