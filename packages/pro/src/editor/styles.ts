/** The editor's look, from the calendar's tokens. `EDITOR_CSS`: include it yourself under `injectStyles: false`. */
export const EDITOR_CSS = `
.dz-editor-backdrop[hidden] { display: none; }
.dz-editor-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 1rem; background-color: color-mix(in srgb, CanvasText 35%, transparent); background: color-mix(in srgb, var(--dz-fg, var(--dzc-fg, #000)) 35%, transparent); }
.dz-editor-backdrop {
  /* Outside .dz-cal (on the body): the palette resolved here as .dz-cal does — the page's --tz-* first. */
  --dzc-fg: var(--tz-fg, var(--dzp-fg, CanvasText));
  --dzc-bg: var(--tz-bg, var(--dzp-bg, Canvas));
  --dzc-border: var(--tz-border, var(--dzp-border, GrayText));
  --dzc-radius: var(--tz-radius, var(--dzp-radius, 0.375rem));
  --dzc-accent: var(--tz-accent, var(--dzp-accent, Highlight));
  --dzc-fg-muted: var(--tz-fg-muted, var(--dzp-fg-muted, GrayText));
  --dzc-accent-fg: var(--tz-accent-fg, var(--dzp-accent-fg, HighlightText));
  --dzc-danger: var(--tz-danger, var(--dzp-danger, #b91c1c));
  --dzc-bg-raised: var(--tz-bg-raised, var(--dzp-bg-raised, ButtonFace));
  color-scheme: var(--tz-color-scheme, var(--dzp-color-scheme, light dark));
}
.dz-editor {
  /* A dialog over the page: filled with the page's colour even unstyled (look: 'none'; the theme's, styled). */
  background-color: Canvas;
  color: CanvasText;
  /* …and handed to tzslot's widget, which passes its --tz-* to its pickers (one level down: no cycle). */
  --tz-fg: var(--dz-fg, var(--dzc-fg));
  --tz-bg: var(--dz-bg, var(--dzc-bg));
  --tz-border: var(--dz-border, var(--dzc-border));
  --tz-accent: var(--dz-accent, var(--dzc-accent));
  --tz-accent-fg: var(--dz-accent-fg, var(--dzc-accent-fg));
  --tz-fg-muted: var(--dz-fg-muted, var(--dzc-fg-muted));
  --tz-danger: var(--dz-danger, var(--dzc-danger));
  --tz-bg-raised: var(--dz-bg-raised, var(--dzc-bg-raised));
}
.dz-editor {
  width: min(36rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; box-sizing: border-box; padding: 1.25rem;
  background: var(--dz-bg, var(--dzc-bg, Canvas)); color: var(--dz-fg, var(--dzc-fg, CanvasText));
  border: 1px solid var(--dz-border, var(--dzc-border, GrayText)); border-radius: calc(2 * var(--dz-radius, var(--dzc-radius, 0.375rem)));
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.25); font: inherit;
}
.dz-editor__title { margin: 0 0 1rem; font-size: 1.125rem; }
.dz-editor__form { display: grid; gap: 0.875rem; }
.dz-editor__field { display: grid; gap: 0.25rem; }
.dz-editor__group { margin: 0; padding: 0.625rem 0.75rem; border: 1px solid var(--dz-border, var(--dzc-border, GrayText)); border-radius: var(--dz-radius, var(--dzc-radius, 0.375rem)); display: grid; gap: 0.5rem; min-width: 0; }
.dz-editor__label { font-size: 0.8125rem; font-weight: 600; padding: 0; }
.dz-editor__input { font: inherit; padding: 0.375rem 0.5rem; border: 1px solid var(--dz-border, var(--dzc-border, GrayText)); border-radius: var(--dz-radius, var(--dzc-radius, 0.375rem)); background: var(--dz-bg, var(--dzc-bg, Canvas)); color: inherit; min-width: 0; }
.dz-editor__num { width: 5rem; }
.dz-editor__row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.dz-editor__checks, .dz-editor__radios { display: flex; flex-wrap: wrap; gap: 0.375rem 0.875rem; }
.dz-editor__radios { flex-direction: column; align-items: flex-start; }
.dz-editor__check { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.875rem; }
.dz-editor__note { margin: 0; font-size: 0.8125rem; color: var(--dz-fg-muted, var(--dzc-fg-muted, GrayText)); }
.dz-editor__error { margin: 0; min-height: 1.25em; color: var(--dz-danger, var(--dzc-danger, LinkText)); font-size: 0.875rem; }
.dz-editor__actions { display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }
.dz-editor__btn { font: inherit; padding: 0.4375rem 0.875rem; border-radius: var(--dz-radius, var(--dzc-radius, 0.375rem)); border: 1px solid var(--dz-border, var(--dzc-border, GrayText)); background: var(--dz-bg-raised, var(--dzc-bg-raised, ButtonFace)); color: inherit; cursor: pointer; }
.dz-editor__btn--primary { background: var(--dz-accent, var(--dzc-accent, Highlight)); color: var(--dz-accent-fg, var(--dzc-accent-fg, HighlightText)); border-color: transparent; }
.dz-editor__btn--danger { margin-inline-end: auto; color: var(--dz-danger, var(--dzc-danger, LinkText)); }
.dz-editor :focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent, Highlight)); outline-offset: 2px; }
.dz-editor [hidden] { display: none !important; }
`;
