import { expect, it } from "vitest";

it("fills in AbortSignal.any where WebKit lacks it", async () => {
  const native = AbortSignal.any;
  // @ts-expect-error -- simulate macOS 14.3 WebKit
  AbortSignal.any = undefined;
  try {
    await import("./polyfills");
    const a = new AbortController();
    const b = new AbortController();
    const both = AbortSignal.any([a.signal, b.signal]);
    expect(both.aborted).toBe(false);
    b.abort("stop");
    expect(both.aborted).toBe(true);
    expect(both.reason).toBe("stop");
    const done = new AbortController();
    done.abort("early");
    expect(AbortSignal.any([done.signal]).reason).toBe("early");
  } finally {
    AbortSignal.any = native;
  }
});
