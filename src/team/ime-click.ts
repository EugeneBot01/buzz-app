/**
 * Team build: Korean typing on macOS. While a syllable is still being composed,
 * WebKit hands the mouse press to the input method to finish it, so the page
 * gets the release without its press and the click is lost: a button needs a
 * second click. When a release arrives without its press right after a
 * composition ended, click the control under it, so one click is enough.
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
/** The press is swallowed in the same gesture that ends the composition. */
const AFTER_COMPOSITION_MS = 1000;

export function repairClicksAfterComposition(doc: Document = document) {
  let pressed = false;
  let composedAt = Number.NEGATIVE_INFINITY;
  const onPress = () => {
    pressed = true;
  };
  const onComposed = () => {
    composedAt = performance.now();
  };
  const onRelease = (event: PointerEvent) => {
    const hadPress = pressed;
    pressed = false;
    if (hadPress || event.button !== 0) return;
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (performance.now() - composedAt > AFTER_COMPOSITION_MS) return;
    const target =
      event.target instanceof Element ? event.target.closest(CLICKABLE) : null;
    if (
      !(target instanceof HTMLElement) ||
      target.matches(':disabled, [aria-disabled="true"]')
    )
      return;
    composedAt = Number.NEGATIVE_INFINITY;
    target.click();
  };
  doc.addEventListener("pointerdown", onPress, true);
  doc.addEventListener("compositionend", onComposed, true);
  doc.addEventListener("pointerup", onRelease, true);
  return () => {
    doc.removeEventListener("pointerdown", onPress, true);
    doc.removeEventListener("compositionend", onComposed, true);
    doc.removeEventListener("pointerup", onRelease, true);
  };
}
