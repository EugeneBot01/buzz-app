// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { repairClicksAfterComposition } from "./ime-click";

describe("clicks after Korean composition", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  const setup = () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<input id="field"><button id="go"><span id="label">보내기</span></button>';
    const clicked = vi.fn();
    const button = document.getElementById("go") as HTMLElement;
    button.addEventListener("click", clicked);
    const label = document.getElementById("label") as HTMLElement;
    document.elementFromPoint = () => label;
    stop = repairClicksAfterComposition();
    const field = document.getElementById("field") as HTMLElement;
    document.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 5, clientY: 5 }),
    );
    const compose = () =>
      field.dispatchEvent(new Event("compositionend", { bubbles: true }));
    return { clicked, button, field, compose };
  };

  it("clicks the button when the input method took the click", () => {
    const { clicked, compose } = setup();
    compose();
    vi.advanceTimersByTime(300);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("leaves clicks that reached the page alone", () => {
    const { clicked, button, compose } = setup();
    compose();
    button.click();
    vi.advanceTimersByTime(300);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("does nothing when a key ended the syllable", () => {
    const { clicked, field, compose } = setup();
    field.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    compose();
    vi.advanceTimersByTime(300);
    expect(clicked).not.toHaveBeenCalled();
  });
});
