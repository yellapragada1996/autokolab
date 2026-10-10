# 07 · Interaction, motion and accessibility

"Butter-smooth" is mostly speed, predictability and never losing your place. These are requirements, not suggestions.

## Speed budgets

| What | Budget | How |
| --- | --- | --- |
| Any click, toggle, tab, answer | visible response < 100 ms | Optimistic update, then reconcile with the server |
| Captain acknowledges a message | < 400 ms | Show the person's bubble instantly and Captain's first live step ("Reading…") from a streamed event |
| Composer intent hint | < 150 ms after a typing pause | Local heuristics first, server classifier refines |
| ⌘K results | < 50 ms per keystroke | Client-side index of commands, tickets, decisions, people |
| Live updates (board, steps, briefing) | < 1 s from the event | Realtime subscription (e.g. Supabase Realtime), never polling for UI |
| Page navigation | < 200 ms to first meaningful content | Prefetch on hover; skeletons only after 300 ms |

**Never show a bare spinner.** If something takes time, say what's happening ("Reading the auth module…").

## Optimistic UI and undo
- Every person action applies immediately in the UI and is sent in the background.
- If the server rejects it, roll back with an inline message where the action was ("That didn't go through. Try again."), never a modal.
- **Undo** is offered right next to the result, for as long as the action can be cleanly reversed: merges (until something depends on it), merge mode changes (toast, 6 s), effort changes (until the next run), Pause everyone (toast). When undo is no longer possible, say why.

## Motion

| Motion | Duration / curve | Used for |
| --- | --- | --- |
| Hover | 160 ms ease | background, border |
| Press | 140 ms, scale .98 | buttons |
| Lift | translateY(-1px) on hover (buttons), -2px + shadow (ticket cards) | affordance |
| Enter / change | fade-up 6 px, 380 ms `--ease-out` | new messages, resolved cards, expanding sections |
| Sheet | slide from right 24 px + fade, 420 ms | Show the work |
| Modal | 8 px drop + .985 scale + fade, 280–320 ms | ⌘K, Look first |
| Live dot | pulse ring, 2.2 s loop | working agents, Captain, briefing kicker |
| In-progress bars | shimmer, 1.1 s loop | building tickets, running tests |
| Board | layout animation 250 ms | cards changing column |
| Switch | 220 ms knob slide | switches |
| Disclosure chevron | rotate 90°/180°, 200 ms | folds |

All looping and decorative motion stops under `prefers-reduced-motion: reduce`; transitions become instant. Content never depends on motion.

## Keyboard map (desktop)

| Keys | Action |
| --- | --- |
| ⌘K / Ctrl K | Command bar |
| ⌘L / Ctrl L | Captain slide-over |
| G then W / R / P / D / S | Go to Work / Room / People / Decisions / Results |
| C | New goal (opens the composer with "New goal: ") |
| ⏎ / ⇧⏎ | Send / new line |
| ⏎ (empty composer) | Focus the newest unanswered decision's primary button |
| 1, 2, 3 | Pick a decision card's buttons / Look first answers |
| J / K | Next / previous card (board), message (conversation) |
| Esc | Close the top overlay; return focus to its opener |
| ⌘⇧P | Pause every agent (with undo toast) |

Shortcuts are shown in ⌘K and tooltips, never printed on nav items.

## Focus and scroll
- Opening Captain scrolls to the first unread message; the briefing stays pinned.
- Every overlay returns focus to the element that opened it.
- New messages arriving while the person is scrolled up do **not** move the view; a small "2 new ↓" pill appears at the bottom of the column.
- Expanding a section never pushes the thing the person clicked off screen.

## Responsive
| Width | Behaviour |
| --- | --- |
| ≥ 1100 px | Sidebar on the left; two-column pages (Ticket, Plan, Decisions, Heads up) side by side |
| 640–1099 px | Sidebar becomes one horizontal row across the top (logo + items, scrolls sideways if needed; project name, divider, clocks and user hidden). Side columns wrap below main content. Sheets become bottom sheets |
| < 640 px | Phone layout: 16 px side padding, briefing headline 21 px, page titles 28 px, decision primary buttons full width |

Wide tables and the board scroll horizontally inside their own container, never the page.

## Accessibility
- Real elements: `<button>`, `<a href>`, `<input>` with `<label>`; never click handlers on divs.
- Icon-only buttons have `aria-label` ("Send", "Record a voice note", "Close").
- Decorative SVG `aria-hidden="true"`; charts have a text `aria-label` with the values.
- Live regions: new Captain messages and typing indicators `aria-live="polite"`; decision cards `role="region"` labelled by their question.
- Radios, switches, tabs and pressed states use proper roles (`radiogroup`, `switch`, `tablist`, `aria-pressed`, `aria-expanded`).
- Contrast: all text tokens meet 4.5:1 on the backgrounds they're used on; never use `--text-dim` on `--surface-raised`.
- Status is never colour alone (always a word or icon).
- Touch targets ≥ 44 px on phone.
