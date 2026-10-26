// @ts-nocheck -- ported from the 0.5 team build as plain JS tests
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  MAX_SPAN_DAYS,
  MAX_TEAM_CALENDAR_CONTENT_BYTES,
  addDays,
  combineMonths,
  daysBetween,
  decodeMonth,
  encodeForPublish,
  encodeMonth,
  entriesByDate,
  entriesOnDate,
  hasNewerEntries,
  mergeMonthEvents,
  mergeMonths,
  monthGrid,
  monthsAround,
  shiftMonth,
  teamCalendarDTag,
  validateRange,
  weekSegments,
} from "./teamCalendar";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const entry = (id, overrides = {}) => ({
  id,
  title: `Entry ${id}`,
  date: "2026-10-07",
  updatedAt: 1_000,
  updatedBy: ALICE,
  ...overrides,
});

const monthOf = (...entries) =>
  Object.fromEntries(entries.map((value) => [value.id, value]));

let seq = 0;
const ev = (pubkey, month, createdAt, dTag) => ({
  id: `id-${String(++seq).padStart(6, "0")}`,
  pubkey,
  kind: 30078,
  content: encodeMonth(month),
  created_at: createdAt,
  tags: [["d", dTag]],
  sig: "s",
});

test("the d tag names the community and the month", () => {
  const here = teamCalendarDTag("wss://a.example.com/", "2026-10");
  assert.equal(here, teamCalendarDTag("WSS://A.example.com", "2026-10"));
  assert.notEqual(here, teamCalendarDTag("wss://b.example.com", "2026-10"));
  assert.notEqual(here, teamCalendarDTag("wss://a.example.com", "2026-11"));
});

test("month arithmetic crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-10", 0), "2026-10");
});

test("the month grid is six full weeks starting on Sunday", () => {
  const grid = monthGrid("2026-10");
  assert.equal(grid.length, 42);
  // 2026-10-01 is a Thursday, so the grid starts on Sunday 2026-09-27.
  assert.deepEqual(grid[0], { date: "2026-09-27", day: 27, inMonth: false });
  assert.deepEqual(grid[4], { date: "2026-10-01", day: 1, inMonth: true });
  assert.equal(grid.filter((cell) => cell.inMonth).length, 31);
  assert.equal(grid[41].date, "2026-11-07");
});

test("a document round-trips and malformed entries are dropped", () => {
  const month = monthOf(
    entry("a", { time: "09:30", note: "Bring slides" }),
    entry("b", { deleted: true, title: "" }),
  );
  assert.deepEqual(decodeMonth(encodeMonth(month), "2026-10"), month);

  const raw = JSON.stringify({
    v: 1,
    entries: {
      ok: {
        title: " Trim me ",
        date: "2026-10-01",
        updatedAt: 5,
        updatedBy: BOB,
      },
      wrongMonth: {
        title: "x",
        date: "2026-11-01",
        updatedAt: 5,
        updatedBy: BOB,
      },
      badDate: { title: "x", date: "2026-10-32", updatedAt: 5, updatedBy: BOB },
      noTitle: {
        title: "  ",
        date: "2026-10-01",
        updatedAt: 5,
        updatedBy: BOB,
      },
      badAuthor: {
        title: "x",
        date: "2026-10-01",
        updatedAt: 5,
        updatedBy: "me",
      },
      badTime: {
        title: "x",
        date: "2026-10-01",
        time: "25:00",
        updatedAt: 5,
        updatedBy: BOB,
      },
    },
  });
  const decoded = decodeMonth(raw, "2026-10");
  assert.deepEqual(Object.keys(decoded).sort(), ["badTime", "ok"]);
  assert.equal(decoded.ok.title, "Trim me");
  assert.equal(decoded.badTime.time, undefined);
  assert.deepEqual(decodeMonth("not json", "2026-10"), {});
  assert.deepEqual(decodeMonth("[]", "2026-10"), {});
});

test("the later edit of an entry wins, and a deletion beats an older copy", () => {
  const mine = monthOf(entry("a", { title: "Old", updatedAt: 10 }));
  const theirs = monthOf(
    entry("a", { title: "New", updatedAt: 20, updatedBy: BOB }),
    entry("b", { updatedAt: 5, updatedBy: BOB }),
  );
  const merged = mergeMonths(mine, theirs);
  assert.equal(merged.a.title, "New");
  assert.ok(merged.b);
  assert.equal(mergeMonths(merged, mine), merged, "nothing newer: same object");

  const deleted = monthOf(
    entry("a", { deleted: true, updatedAt: 30, updatedBy: BOB }),
  );
  assert.equal(mergeMonths(merged, deleted).a.deleted, true);
  assert.equal(mergeMonths(deleted, merged).a.deleted, true);
  assert.deepEqual(
    entriesByDate(mergeMonths(merged, deleted))["2026-10-07"].map((e) => e.id),
    ["b"],
  );
});

test("entries are listed by date, timed before all-day", () => {
  const month = monthOf(
    entry("late", { time: "15:00" }),
    entry("allday"),
    entry("early", { time: "09:00" }),
    entry("first", { date: "2026-10-01" }),
  );
  const grouped = entriesByDate(month);
  assert.deepEqual(
    grouped["2026-10-07"].map((e) => e.id),
    ["early", "late", "allday"],
  );
  assert.deepEqual(
    grouped["2026-10-01"].map((e) => e.id),
    ["first"],
  );
});

test("every member's newest event is merged and my own is tracked", () => {
  const dTag = teamCalendarDTag("wss://a.example.com", "2026-10");
  const other = teamCalendarDTag("wss://b.example.com", "2026-10");
  const events = [
    ev(ALICE, monthOf(entry("a", { title: "Stale", updatedAt: 1 })), 100, dTag),
    ev(ALICE, monthOf(entry("a", { title: "Mine", updatedAt: 2 })), 200, dTag),
    ev(BOB, monthOf(entry("b", { updatedBy: BOB })), 150, dTag),
    ev(BOB, monthOf(entry("elsewhere", { updatedBy: BOB })), 999, other),
  ];
  const { merged, own, ownCreatedAt } = mergeMonthEvents(
    events,
    dTag,
    "2026-10",
    ALICE,
  );
  assert.deepEqual(Object.keys(merged).sort(), ["a", "b"]);
  assert.equal(merged.a.title, "Mine");
  assert.equal(ownCreatedAt, 200);
  assert.deepEqual(Object.keys(own), ["a"]);
  // What Alice still has to publish: Bob's entry is not in her own event.
  assert.equal(hasNewerEntries(merged, own), true);
  assert.equal(hasNewerEntries(own, merged), false);
});

test("an oversized month drops its oldest deletions before giving up", () => {
  const note = "n".repeat(900);
  const live = Array.from({ length: 30 }, (_, i) =>
    entry(`live-${i}`, { note, updatedAt: 1_000 + i }),
  );
  const deletions = Array.from({ length: 60 }, (_, i) =>
    entry(`gone-${String(i).padStart(2, "0")}`, {
      deleted: true,
      title: "t".repeat(120),
      note,
      updatedAt: i + 1,
    }),
  );
  const content = encodeForPublish(monthOf(...live, ...deletions));
  assert.ok(content);
  assert.ok(
    new TextEncoder().encode(content).length <= MAX_TEAM_CALENDAR_CONTENT_BYTES,
  );
  const kept = decodeMonth(content, "2026-10");
  assert.equal(Object.values(kept).filter((e) => !e.deleted).length, 30);
  assert.ok(!kept["gone-00"], "oldest deletion dropped first");
  assert.ok(kept["gone-59"], "newest deletion kept");

  const tooMany = Array.from({ length: 80 }, (_, i) =>
    entry(`x-${i}`, { note }),
  );
  assert.equal(encodeForPublish(monthOf(...tooMany)), null);
});

const WEEK = [
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-09",
  "2026-10-10",
];

test("day arithmetic crosses month, year and daylight-saving changes", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2);
  assert.equal(daysBetween("2026-10-05", "2026-10-04"), -1);
  assert.deepEqual(monthsAround("2026-01"), ["2025-12", "2026-01", "2026-02"]);
});

test("range, end time and color survive a round trip", () => {
  const trip = entry("t", {
    time: "14:00",
    endDate: "2026-10-09",
    endTime: "11:30",
    color: "green",
  });
  const back = decodeMonth(encodeMonth(monthOf(trip)), "2026-10").t;
  assert.equal(back.endDate, "2026-10-09");
  assert.equal(back.endTime, "11:30");
  assert.equal(back.color, "green");
});

test("an entry without a range or color reads as before", () => {
  const plain = decodeMonth(encodeMonth(monthOf(entry("p"))), "2026-10").p;
  assert.equal(plain.endDate, undefined);
  assert.equal(plain.endTime, undefined);
  assert.equal(plain.color, undefined);
});

test("a bad range is dropped but the entry stays on its start day", () => {
  const bad = (overrides) =>
    decodeMonth(encodeMonth(monthOf(entry("b", overrides))), "2026-10").b;
  // Ends before it starts, is not a date, is too long, or is the same day.
  for (const endDate of ["2026-10-06", "nope", "2026-12-25", "2026-10-07"]) {
    const read = bad({ endDate });
    assert.ok(read, endDate);
    assert.equal(read.endDate, undefined, endDate);
  }
  assert.equal(
    bad({ endDate: addDays("2026-10-07", MAX_SPAN_DAYS - 1) }).endDate,
    "2026-11-03",
  );
  assert.equal(
    bad({ endDate: addDays("2026-10-07", MAX_SPAN_DAYS) }).endDate,
    undefined,
  );
  // An end time needs a start time; an unknown color is ignored.
  assert.equal(bad({ endTime: "10:00" }).endTime, undefined);
  assert.equal(bad({ color: "chartreuse" }).color, undefined);
});

test("the copy that kept the range wins over a stripped copy of the same edit", () => {
  const full = entry("r", { endDate: "2026-10-09", color: "red" });
  const stripped = entry("r");
  assert.equal(
    mergeMonths(monthOf(stripped), monthOf(full)).r.endDate,
    "2026-10-09",
  );
  assert.equal(
    mergeMonths(monthOf(full), monthOf(stripped)).r.endDate,
    "2026-10-09",
  );
  // A real later edit still wins even without the range.
  const later = entry("r", { updatedAt: 2_000 });
  assert.equal(mergeMonths(monthOf(full), monthOf(later)).r.endDate, undefined);
  assert.equal(hasNewerEntries(monthOf(full), monthOf(stripped)), true);
});

test("a moved entry is not hidden by the deletion left in its old month", () => {
  const moved = entry("m", { date: "2026-11-02", updatedAt: 1_000 });
  const left = {
    id: "m",
    title: "",
    date: "2026-10-30",
    updatedAt: 2_000,
    updatedBy: ALICE,
    deleted: true,
  };
  const listed = combineMonths([monthOf(left), monthOf(moved)]);
  assert.deepEqual(
    listed.map((value) => value.date),
    ["2026-11-02"],
  );
  // An interrupted move leaves two live copies: the newer one is kept.
  const older = entry("d", { date: "2026-10-30", updatedAt: 1_000 });
  const newer = entry("d", { date: "2026-11-02", updatedAt: 2_000 });
  assert.deepEqual(
    combineMonths([monthOf(older), monthOf(newer)]).map((value) => value.date),
    ["2026-11-02"],
  );
});

test("an entry covers every day from its start to its end", () => {
  const trip = entry("t", { date: "2026-10-05", endDate: "2026-10-07" });
  const one = entry("o", { date: "2026-10-06" });
  const all = [trip, one];
  assert.deepEqual(
    entriesOnDate(all, "2026-10-04").map((v) => v.id),
    [],
  );
  assert.deepEqual(
    entriesOnDate(all, "2026-10-05").map((v) => v.id),
    ["t"],
  );
  assert.deepEqual(
    entriesOnDate(all, "2026-10-06").map((v) => v.id),
    ["t", "o"],
  );
  assert.deepEqual(
    entriesOnDate(all, "2026-10-07").map((v) => v.id),
    ["t"],
  );
  assert.deepEqual(
    entriesOnDate(all, "2026-10-08").map((v) => v.id),
    [],
  );
});

test("week bars start in the right column and are cut at the week edges", () => {
  const trip = entry("t", { date: "2026-10-01", endDate: "2026-10-06" });
  const next = entry("n", { date: "2026-10-09", endDate: "2026-10-14" });
  const out = entry("x", { date: "2026-10-20" });
  const bars = weekSegments([trip, next, out], WEEK);
  assert.equal(bars.length, 2);
  const [a, b] = bars;
  assert.deepEqual(
    [a.entry.id, a.startColumn, a.span, a.continuesBefore, a.continuesAfter],
    ["t", 0, 3, true, false],
  );
  assert.deepEqual(
    [b.entry.id, b.startColumn, b.span, b.continuesBefore, b.continuesAfter],
    ["n", 5, 2, false, true],
  );
});

test("overlapping bars take different lanes and a free lane is reused", () => {
  const long = entry("a", { date: "2026-10-04", endDate: "2026-10-08" });
  const mid = entry("b", { date: "2026-10-05", endDate: "2026-10-06" });
  const late = entry("c", { date: "2026-10-09" });
  const lane = Object.fromEntries(
    weekSegments([mid, late, long], WEEK).map((bar) => [
      bar.entry.id,
      bar.lane,
    ]),
  );
  // The longer entry sits on top; the later one slides into the free lane 0.
  assert.deepEqual(lane, { a: 0, b: 1, c: 0 });
});

test("the range is checked before it is saved", () => {
  assert.equal(validateRange({ date: "2026-10-07" }), null);
  assert.equal(
    validateRange({ date: "2026-10-07", endDate: "2026-10-09" }),
    null,
  );
  assert.equal(
    validateRange({
      date: "2026-10-07",
      time: "09:00",
      endDate: "2026-10-09",
      endTime: "08:00",
    }),
    null,
  );
  assert.match(
    validateRange({ date: "2026-10-07", endDate: "2026-10-06" }),
    /빠를 수 없/,
  );
  assert.match(
    validateRange({ date: "2026-10-07", time: "09:00", endTime: "09:00" }),
    /늦어야/,
  );
  assert.match(
    validateRange({ date: "2026-10-07", endTime: "09:00" }),
    /시작 시간/,
  );
  assert.match(
    validateRange({ date: "2026-10-07", endDate: "2026-12-01" }),
    /최대 28일/,
  );
  assert.equal(
    validateRange({ date: "2026-10-07", endDate: "2026-11-03" }),
    null,
  );
});
