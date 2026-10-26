import assert from "node:assert/strict";
import { test } from "vitest";

import { createTranslator } from "./domTranslator";

const translate = createTranslator({
  exact: { "Mute channel": "채널 음소거", Save: "저장" },
  patterns: [
    ["Unarchive failed: {0}", "보관 해제 실패: {0}"],
    ["{0} new message{1}", "새 메시지 {0}개"],
    ["Move {0} to {1}", "{0}을(를) {1}(으)로 이동"],
  ],
});

test("exact matches keep surrounding whitespace", () => {
  assert.equal(translate("Mute channel"), "채널 음소거");
  assert.equal(translate("  Save "), "  저장 ");
  assert.equal(translate("Mute   channel"), "채널 음소거");
});

test("patterns substitute placeholders, including reordering and drops", () => {
  assert.equal(
    translate("Unarchive failed: timeout"),
    "보관 해제 실패: timeout",
  );
  assert.equal(translate("3 new messages"), "새 메시지 3개");
  assert.equal(translate("Move #a to Work"), "#a을(를) Work(으)로 이동");
});

test("one-word patterns leave multi-word user text alone unless it is known UI", () => {
  const t = createTranslator({
    exact: {},
    patterns: [
      ["Edit {0}", "{0} 편집"],
      ["New {0}", "새 {0}"],
      ["{0} only", "{0}만"],
      ["Members ({0})", "멤버 ({0})"],
      ["Move {0} to {1}", "{0}을(를) {1}(으)로 이동"],
    ],
  });
  // UI copy with a single-token value still translates.
  assert.equal(t("Edit design-review"), "design-review 편집");
  assert.equal(t("Members (12)"), "멤버 (12)");
  // Ordinary user text (channel names, preview lines) is left alone.
  assert.equal(t("Edit the doc"), null);
  assert.equal(t("New York trip"), null);
  assert.equal(t("Team members only"), null);
  // Known UI (JSX sentence, aria-label) may capture a multi-word value.
  assert.equal(t("Edit My Agent", { ui: true }), "My Agent 편집");
  // App copy missing from the dictionary stays English rather than garbled.
  assert.equal(
    createTranslator({ exact: {}, patterns: [["Search {0}", "{0} 검색"]] })(
      "Search or create a channel",
    ),
    null,
  );
  // Patterns with two or more literal words are unaffected.
  assert.equal(
    t("Move My Channel to Work"),
    "My Channel을(를) Work(으)로 이동",
  );
});

test("unknown text and non-letters are left alone", () => {
  assert.equal(translate("hello world"), null);
  assert.equal(translate("42"), null);
  assert.equal(translate("x"), null);
});

test("DOM: sentence split into adjacent text nodes is translated whole; user content untouched", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(
    `<body><p id="s">Saves kind <!---->44200<!----> turn-metric events.</p><div data-no-translate=""><p>Save</p></div><button>Save</button></body>`,
  );
  const g = globalThis;
  const saved = {
    document: g.document,
    Node: g.Node,
    NodeFilter: g.NodeFilter,
    MutationObserver: g.MutationObserver,
    window: g.window,
  };
  Object.assign(g, {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
  });
  try {
    const p = dom.window.document.getElementById("s");
    assert.ok(p);
    // React renders adjacent text nodes (no comment separators in production).
    p.replaceChildren(
      dom.window.document.createTextNode("Saves kind "),
      dom.window.document.createTextNode("44200"),
      dom.window.document.createTextNode(" turn-metric events."),
    );
    const { startDomTranslator } = await import("./domTranslator");
    const stop = startDomTranslator(
      {
        exact: { Save: "저장" },
        patterns: [
          [
            "Saves kind {0} turn-metric events.",
            "토큰 사용 기록(kind {0})을 저장합니다.",
          ],
        ],
      },
      dom.window.document.body,
    );
    assert.equal(p.textContent, "토큰 사용 기록(kind 44200)을 저장합니다.");
    assert.equal(
      dom.window.document.querySelector("[data-no-translate]").textContent,
      "Save",
    );
    assert.equal(
      dom.window.document.querySelector("button").textContent,
      "저장",
    );
    // React updates the number: sentence re-translates from the new source.
    p.childNodes[1].nodeValue = "24200";
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(p.textContent, "토큰 사용 기록(kind 24200)을 저장합니다.");
    stop();
  } finally {
    Object.assign(g, saved);
  }
});
