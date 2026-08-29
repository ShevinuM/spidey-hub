// Shared cross-component layout constant. StatusBar.svelte's own inline
// `height:30px` and GrepOverlay.svelte's backdrop clip (the grep overlay's
// dim/blur backdrop must NOT cover the status bar) both need the exact same
// pixel value — a single source avoids the
// two ever drifting apart (the backdrop's `bottom` offset is only correct
// while it matches the bar's real rendered height).
export const STATUS_BAR_HEIGHT_PX = 30;
