/**
 * Team build, temporary: shows which mouse and typing events the page gets,
 * to find out what WebKit does with a click while Korean is being composed.
 * Ctrl+Option+Shift+D shows or hides the list.
 */
const EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "keydown",
  "compositionstart",
  "compositionend",
  "focusin",
  "focusout",
] as const;

export function watchInputEvents(doc: Document = document) {
  const lines: string[] = [];
  let box: HTMLPreElement | undefined;
  const start = performance.now();
  const describe = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return "";
    const label =
      target.getAttribute("aria-label") ?? target.textContent?.slice(0, 12);
    return `${target.tagName.toLowerCase()}${label ? ` "${label}"` : ""}`;
  };
  const record = (event: Event) => {
    const at = ((performance.now() - start) / 1000).toFixed(2);
    const key = event instanceof KeyboardEvent ? ` ${event.key}` : "";
    lines.push(`${at} ${event.type}${key} ${describe(event.target)}`);
    if (lines.length > 40) lines.shift();
    if (box) box.textContent = lines.join("\n");
  };
  for (const type of EVENTS) doc.addEventListener(type, record, true);
  let moved = 0;
  doc.addEventListener(
    "pointermove",
    (event) => {
      // One in ten is enough to see that the pointer moves.
      if (++moved % 10 === 0) record(event);
    },
    true,
  );
  doc.addEventListener(
    "keydown",
    (event) => {
      if (!(event.ctrlKey && event.altKey && event.shiftKey)) return;
      if (event.code !== "KeyD") return;
      if (box) {
        box.remove();
        box = undefined;
        return;
      }
      box = doc.createElement("pre");
      box.setAttribute("data-no-translate", "");
      Object.assign(box.style, {
        position: "fixed",
        right: "8px",
        bottom: "8px",
        zIndex: "2147483647",
        maxHeight: "60vh",
        width: "360px",
        overflow: "auto",
        margin: "0",
        padding: "8px",
        font: "11px/1.4 monospace",
        color: "#fff",
        background: "#000c",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
      });
      box.textContent = lines.join("\n");
      doc.body.append(box);
    },
    true,
  );
}
