/** Inline-style declarations that fade the bottom 16px of a clipped or scrolling element.
 *
 * Apply it once per list, to the element that clips or scrolls it, never to a row and never to a
 * `PaneFrame` box, whose own border the mask would fade too. It carries no leading or trailing
 * semicolon, so callers join it with ";". */
export const FADE_BOTTOM_STYLE =
  "mask-image:linear-gradient(180deg,#000 calc(100% - 16px),transparent);-webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 16px),transparent)";
