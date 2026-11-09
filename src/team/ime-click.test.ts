// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { repairClicksAfterComposition } from "./ime-click";

const release = (target: Element) =>
  target.dispatchEvent(
    new MouseEvent("pointerup", { bubbles: true, button: 0 }),
  );
const press = (target: Element) =>
  target.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
  );

describe("clicks after Korean composition", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    document.body.innerHTML = "";
  });

  const setup = () => {
    document.body.innerHTML =
      '<input id="field"><button id="go"><span id="label">보내기</span></button>';
    const clicked = vi.fn();
    document.getElementById("go")?.addEventListener("click", clicked);
    stop = repairClicksAfterComposition();
    const field = document.getElementById("field") as HTMLElement;
    const label = document.getElementById("label") as HTMLElement;
    return { clicked, field, label };
  };

  it("clicks the button when the press went to the input method", () => {
    const { clicked, field, label } = setup();
    field.dispatchEvent(new Event("compositionend", { bubbles: true }));
    release(label);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("leaves ordinary clicks alone", () => {
    const { clicked, field, label } = setup();
    field.dispatchEvent(new Event("compositionend", { bubbles: true }));
    press(label);
    release(label);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("does nothing without a recent composition", () => {
    const { clicked, label } = setup();
    release(label);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("repairs only the first release after a composition", () => {
    const { clicked, field, label } = setup();
    field.dispatchEvent(new Event("compositionend", { bubbles: true }));
    release(label);
    release(label);
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
