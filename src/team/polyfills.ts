/**
 * Team build: browser APIs newer than some teammates' macOS. WebKit only
 * gained `AbortSignal.any` in Safari 17.4 (macOS 14.4); without it the app
 * stops on start on macOS 14.3 and older.
 */
if (
  typeof AbortSignal !== "undefined" &&
  typeof AbortSignal.any !== "function"
) {
  AbortSignal.any = function any(signals: Iterable<AbortSignal>) {
    const controller = new AbortController();
    const list = [...signals];
    const already = list.find((signal) => signal.aborted);
    if (already) {
      controller.abort(already.reason);
      return controller.signal;
    }
    const forward = (event: Event) => {
      for (const signal of list) signal.removeEventListener("abort", forward);
      controller.abort((event.target as AbortSignal).reason);
    };
    for (const signal of list) signal.addEventListener("abort", forward);
    return controller.signal;
  };
}

export {};
