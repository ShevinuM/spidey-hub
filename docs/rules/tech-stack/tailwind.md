# Tailwind CSS (v4)

CSS-first configuration and utility-class discipline.

## CSS-first configuration

- [ ] **R001** Theme customization (colors, breakpoints, fonts, easing curves) lives in an `@theme` block in CSS, not a `tailwind.config.js` — v4's config is CSS-first; don't reintroduce a JS config file out of v3 habit.
- [ ] **R002** A theme value defined in `@theme` is a real CSS custom property, usable directly in arbitrary values and by non-Tailwind tooling (e.g. a UI library reading a CSS variable) — reach for the variable directly instead of duplicating the raw value at a second site.
- [ ] **R003** Overriding a default token (e.g. a breakpoint) redefines that one `--<token>-<name>` variable in `@theme`; replacing a whole token category (e.g. dropping all default breakpoints in favor of custom names) sets the category to `initial` first, then defines only the wanted set.

## Utility class discipline

- [ ] **R004** An arbitrary value (`bg-[#316ff6]`, `grid-cols-[24rem_2.5rem_minmax(0,1fr)]`) is for a one-off value with no reasonable place in the shared theme — a value used more than once earns a named `@theme` token instead of being repeated as an arbitrary literal at every call site.
- [ ] **R005** Reach for a plain inline `style` attribute, not an ever-more-elaborate arbitrary-value utility class, once the expression is complex enough that the utility-class spelling is harder to read than CSS would be (a multi-term `calc()`/`grid-template-columns` expression is the canonical case).
- [ ] **R006** When the same run of utility classes repeats across several markup sites for one component's look, extract the component (Svelte component boundary), not a hand-rolled `@apply` class — the framework's own component model is the intended de-duplication mechanism here, not a CSS abstraction layer running parallel to it.
