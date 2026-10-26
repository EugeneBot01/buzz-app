// @ts-nocheck -- ported from the 0.5 team build as plain JS tests
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  GOOGLE_APPS_SCRIPT,
  MAX_OPS_PER_PUSH,
  isAppsScriptUrl,
  newestVersions,
  parsePushed,
  pendingOps,
} from "./googleSync";

const ME = "a".repeat(64);
const entry = (id, updatedAt, extra = {}) => ({
  id,
  title: id,
  date: "2026-10-14",
  updatedAt,
  updatedBy: ME,
  ...extra,
});

test("a moved entry: the live copy beats its deletion in the old month", () => {
  const moved = newestVersions([
    { x: entry("x", 5, { deleted: true }) },
    { x: entry("x", 5, { date: "2026-11-02" }) },
  ]);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].deleted, undefined);
  const deleted = newestVersions([
    { x: entry("x", 5) },
    { x: entry("x", 6, { deleted: true }) },
  ]);
  assert.equal(deleted[0].deleted, true);
});

test("only changed entries are sent, oldest first, with their fields", () => {
  const { ops, versions } = pendingOps(
    [
      entry("same", 1),
      entry("newer", 9, { time: "15:00", endTime: "16:00", note: "회의실 B" }),
      entry("weekly", 3, { repeat: { every: "weekly", until: "2026-12-31" } }),
    ],
    { same: 1, newer: 2 },
  );
  assert.deepEqual(
    ops.map((op) => op.id),
    ["weekly", "newer"],
  );
  assert.deepEqual(ops[1], {
    op: "upsert",
    id: "newer",
    title: "newer",
    date: "2026-10-14",
    time: "15:00",
    endTime: "16:00",
    note: "회의실 B",
  });
  assert.deepEqual(ops[0].repeat, { every: "weekly", until: "2026-12-31" });
  assert.deepEqual(versions, { weekly: 3, newer: 9 });
});

test("deletions are sent only for entries that were sent", () => {
  const { ops, versions } = pendingOps(
    [entry("sent", 4, { deleted: true }), entry("never", 4, { deleted: true })],
    { sent: 2 },
  );
  assert.deepEqual(ops, [{ op: "delete", id: "sent" }]);
  assert.deepEqual(versions, { sent: 4 });
});

test("a push is capped", () => {
  const many = Array.from({ length: MAX_OPS_PER_PUSH + 5 }, (_, i) =>
    entry(`e${i}`, i + 1),
  );
  assert.equal(pendingOps(many, {}).ops.length, MAX_OPS_PER_PUSH);
});

test("stored record and URL checks", () => {
  assert.deepEqual(parsePushed('{"a":1,"b":"x"}'), { a: 1 });
  assert.deepEqual(parsePushed("nope"), {});
  assert.ok(
    isAppsScriptUrl("https://script.google.com/macros/s/AKfy-cb_12/exec"),
  );
  assert.ok(!isAppsScriptUrl("https://evil.example.com/macros/s/x/exec"));
  assert.ok(!isAppsScriptUrl("http://script.google.com/macros/s/x/exec"));
});

test("the Apps Script parses as JavaScript", () => {
  // Apps Script is V8 JavaScript: a syntax error here would only show in Google.
  assert.doesNotThrow(() => new Function(GOOGLE_APPS_SCRIPT));
});
