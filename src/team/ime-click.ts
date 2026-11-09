/**
 * Team build: Korean typing on macOS. While a syllable is still being composed,
 * WebKit hands the whole mouse click to the input method to finish it, so the
 * page sees only the composition ending and the button needs a second click.
 * When a composition ends without a key that ended it and no click follows,
 * click the control under the pointer, so one click is enough.
 */
const CLICKABLE = [
  "button",
  "a[href]",
  "summary",
  "label",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(",");
/** A key that ends a syllable (space, return, a letter) comes just before. */
const KEY_ENDED_MS = 150;
/** If the click does reach the page, it arrives within this time. */
const CLICK_GRACE_MS = 250;

export function repairClicksAfterComposition(doc: Document = document) {
  let pointer: { x: number; y: number } | undefined;
  let keyAt = Number.NEGATIVE_INFINITY;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (pending !== undefined) clearTimeout(pending);
    pending = undefined;
  };
  const onMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  const onKey = () => {
    keyAt = performance.now();
  };
  const onComposed = () => {
    cancel();
    if (!pointer || performance.now() - keyAt < KEY_ENDED_MS) return;
    const at = pointer;
    pending = setTimeout(() => {
      pending = undefined;
      const hit = doc.elementFromPoint(at.x, at.y)?.closest(CLICKABLE);
      if (
        !(hit instanceof HTMLElement) ||
        hit.matches(':disabled, [aria-disabled="true"]')
      )
        return;
      hit.click();
    }, CLICK_GRACE_MS);
  };
  doc.addEventListener("pointermove", onMove, true);
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("compositionend", onComposed, true);
  // The click reached the page after all: leave it alone.
  doc.addEventListener("pointerdown", cancel, true);
  doc.addEventListener("click", cancel, true);
  return () => {
    cancel();
    doc.removeEventListener("pointermove", onMove, true);
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("compositionend", onComposed, true);
    doc.removeEventListener("pointerdown", cancel, true);
    doc.removeEventListener("click", cancel, true);
  };
}
