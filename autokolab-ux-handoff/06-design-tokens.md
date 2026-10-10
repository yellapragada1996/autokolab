# 06 · Design tokens

`tokens.css` is the source of truth. This page explains how to use it.

## Rules
1. Never hard-code a colour in a component; use a variable.
2. **Colour only ever means status.** Amber = needs a person. Green = shipped / done / safe. Blue = live / moving (and links). Coral = failure / heads up. Everything else is neutral grey.
3. Status colour is always paired with a word or an icon, so it works for colour-blind people and in grayscale.
4. Agents are neutral (`--avatar-bg` / `--avatar-fg`). Never give an agent its own colour.
5. 12 px is the minimum text size anywhere, including mono timestamps and shortcut hints.

## Fonts
- **Geist** (UI) and **Geist Mono** (ticket keys, commits, times, shortcuts, code). The `geist` npm package ships both (variable weights); with Next.js use `geist/font/sans` and `geist/font/mono`.
- Weights used: 400 body, 500 headings and emphasis, 600 labels/buttons, 700 avatar initials.

## Type scale

| Use | Size / weight / tracking |
| --- | --- |
| Section label (uppercase) | 12–13 px / 600 / 0.08em, `--text-muted` (or status colour for Needs you, Shipped…) |
| Meta (times, "Captain · 8:40 am") | 12 px / 400, `--text-dim` |
| Secondary text, rows | 13–14 px |
| Conversation body | 15 px / 1.6 line height, `--text-body` |
| Decision question | 17 px / 500 / 1.4 |
| Phone briefing | 21 px / 500 |
| Briefing headline | 26 px / 500 / -0.02em / 1.3 |
| Page titles | 28–30 px / 500 / -0.02em |
| Hero sentences (Results, Heads up) | 36–38 px / 500 / -0.026em |

## Spacing and shape
- 4 px grid. Typical: card padding 18–22 px, row padding 12–14 px, section gap 22–40 px.
- Radius: chips 999, small tiles 7, buttons 9–11, ticket cards 12, cards 16, briefing/slide-over 18, modals 20.
- Touch targets ≥ 44 px on phone; desktop buttons 38–48 px tall.

## Tailwind (optional)
If the app uses Tailwind, map the variables in `tailwind.config`:

```js
theme: {
  extend: {
    colors: {
      bg: 'var(--bg)', sidebar: 'var(--sidebar)', surface: { DEFAULT: 'var(--surface)', sunken: 'var(--surface-sunken)', hover: 'var(--surface-hover)', active: 'var(--surface-active)', raised: 'var(--surface-raised)' },
      line: { subtle: 'var(--border-subtle)', DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
      ink: { DEFAULT: 'var(--text)', body: 'var(--text-body)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)', dim: 'var(--text-dim)' },
      amber: { DEFAULT: 'var(--amber)', ink: 'var(--amber-ink)', bg: 'var(--amber-bg)', border: 'var(--amber-border)' },
      green: { DEFAULT: 'var(--green)', text: 'var(--green-text)', bg: 'var(--green-bg)', border: 'var(--green-border)' },
      blue: { DEFAULT: 'var(--blue)', text: 'var(--blue-text)', bg: 'var(--blue-bg)' },
      coral: { DEFAULT: 'var(--coral)', text: 'var(--coral-text)', bg: 'var(--coral-bg)', border: 'var(--coral-border)' },
    },
    fontFamily: { sans: ['var(--font-geist-sans)', 'system-ui'], mono: ['var(--font-geist-mono)', 'ui-monospace'] },
    transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)' },
  },
}
```

## Light mode
Not designed. The product is dark-only for now ("night shift"). Don't build a light theme until it is designed.
