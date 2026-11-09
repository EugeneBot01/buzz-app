// @ts-nocheck -- ported from the 0.5 team build as plain JS tests
import assert from "node:assert/strict";
import { test } from "vitest";

import { assignMonthSlots } from "./monthSlots";
import {
  UNASSIGNED_ROW,
  dDayLabel,
  decodePlan,
  defaultPlan,
  encodePlan,
  mergePlan,
  mergePlanEvents,
  mondayOf,
  phaseOfWeeks,
  planEnd,
  planMonths,
  readPlan,
  sprintCells,
  sprintItemLabel,
  sprintRows,
  sprintWeeks,
  teamSprintDTag,
  validatePlan,
  weekIndexOf,
} from "./teamSprint";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const plan = (overrides = {}) => ({
  title: "PARATKD 스프린트 보드",
  start: "2026-09-14",
  weeks: 16,
  phases: [
    { label: "PRE-PRODUCTION", weeks: 12, tone: "pre" },
    { label: "PRODUCTION", weeks: 1, tone: "prod" },
    { label: "POST-PRODUCTION", weeks: 3, tone: "post" },
  ],
  depts: [
    { key: "ALL", label: "전 부서", color: "red" },
    { key: "POST", label: "포스트" },
    { key: "MEET", label: "정기회의" },
  ],
  keyDates: [{ label: "납품", date: "2026-12-28" }],
  updatedAt: 1,
  updatedBy: ALICE,
  ...overrides,
});

const entry = (id, overrides = {}) => ({
  id,
  title: id,
  date: "2026-09-14",
  updatedAt: 1,
  updatedBy: ALICE,
  ...overrides,
});

test("weeks run Monday to Sunday from the start", () => {
  const weeks = sprintWeeks(plan());
  assert.equal(weeks.length, 16);
  assert.deepEqual(weeks[0], {
    index: 0,
    id: "W01",
    start: "2026-09-14",
    end: "2026-09-20",
  });
  assert.equal(weeks[12].id, "W13");
  assert.equal(weeks[12].start, "2026-12-07");
  assert.equal(weeks[15].end, "2027-01-03");
  assert.equal(planEnd(plan()), "2027-01-03");
});

test("weekIndexOf finds the sprint of a day, -1 outside", () => {
  const p = plan();
  assert.equal(weekIndexOf(p, "2026-09-14"), 0);
  assert.equal(weekIndexOf(p, "2026-09-20"), 0);
  assert.equal(weekIndexOf(p, "2026-09-21"), 1);
  assert.equal(weekIndexOf(p, "2026-11-06"), 7);
  assert.equal(weekIndexOf(p, "2027-01-03"), 15);
  assert.equal(weekIndexOf(p, "2027-01-04"), -1);
  assert.equal(weekIndexOf(p, "2026-09-13"), -1);
});

test("planMonths covers the month before through the last month", () => {
  assert.deepEqual(planMonths(plan()), [
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
    "2026-12",
    "2027-01",
  ]);
  // The longest plan still fits the dialog's month slots with a 3-month view.
  const longest = planMonths({ start: "2026-01-31", weeks: 26 });
  assert.ok(longest.length + 3 <= 12, `${longest.length} months`);
});

test("phaseOfWeeks spreads phases over weeks and leaves the rest empty", () => {
  const phases = phaseOfWeeks(
    plan({ weeks: 5, phases: [{ label: "A", weeks: 3, tone: "pre" }] }),
  );
  assert.deepEqual(
    phases.map((phase) => phase?.label ?? null),
    ["A", "A", "A", null, null],
  );
  assert.equal(phaseOfWeeks(plan())[12].tone, "prod");
});

test("item labels follow the master plan style", () => {
  const week = { start: "2026-12-14", end: "2026-12-20" };
  assert.equal(
    sprintItemLabel(
      entry("a", {
        title: "부서별 정산서 취합",
        date: "2026-12-14",
        endDate: "2026-12-20",
      }),
      week,
    ),
    "부서별 정산서 취합",
  );
  assert.equal(
    sprintItemLabel(
      entry("b", {
        title: "편집 1차",
        date: "2026-12-14",
        endDate: "2026-12-17",
      }),
      week,
    ),
    "편집 1차 (12/14–12/17)",
  );
  assert.equal(
    sprintItemLabel(
      entry("c", { title: "최종 수정", date: "2026-12-23", milestone: true }),
      {
        start: "2026-12-21",
        end: "2026-12-27",
      },
    ),
    "12/23 최종 수정",
  );
  assert.equal(
    sprintItemLabel(
      entry("d", {
        title: "기획",
        date: "2026-12-14",
        time: "14:30",
        repeat: { every: "weekly" },
      }),
      week,
    ),
    "월 14:30 기획",
  );
});

test("an entry shows in every week it covers, in its department's row", () => {
  const cells = sprintCells(plan(), [
    entry("edit2", {
      title: "편집 2차",
      date: "2026-12-20",
      endDate: "2026-12-22",
      dept: "POST",
    }),
  ]);
  const post = cells.get("POST");
  assert.equal(post[13].length, 1); // W14 12/14–12/20
  assert.equal(post[14].length, 1); // W15 12/21–12/27
  assert.equal(post[13][0].label, "편집 2차 (12/20–12/22)");
  assert.equal(post[12].length, 0);
});

test("repeating entries fill every week until their end", () => {
  const cells = sprintCells(plan(), [
    entry("meet", {
      title: "기획",
      date: "2026-09-21",
      time: "14:30",
      dept: "MEET",
      repeat: { every: "weekly", until: "2026-12-28" },
    }),
  ]);
  const meet = cells.get("MEET");
  assert.equal(meet[0].length, 0);
  for (let week = 1; week < 16; week++)
    assert.equal(meet[week].length, 1, `week ${week + 1}`);
  assert.equal(meet[1][0].label, "월 14:30 기획");
});

test("entries without a known department go to the 부서 미지정 row", () => {
  const entries = [
    entry("loose", { date: "2026-10-01" }),
    entry("gone", { date: "2026-10-02", dept: "OLD" }),
    entry("outside", { date: "2027-03-01" }),
  ];
  const rows = sprintRows(plan(), entries);
  assert.equal(rows[rows.length - 1].key, UNASSIGNED_ROW);
  const cells = sprintCells(plan(), entries);
  assert.equal(cells.get(UNASSIGNED_ROW)[2].length, 2);
  // No row when every entry has a department (or is outside the plan).
  assert.equal(
    sprintRows(plan(), [entry("x", { dept: "ALL" }), entries[2]]).some(
      (row) => row.key === UNASSIGNED_ROW,
    ),
    false,
  );
});

test("validatePlan explains what is wrong", () => {
  const base = plan();
  assert.equal(validatePlan(base), null);
  assert.match(validatePlan({ ...base, title: " " }), /이름/);
  assert.match(validatePlan({ ...base, weeks: 0 }), /1~26주/);
  assert.match(validatePlan({ ...base, weeks: 27 }), /1~26주/);
  assert.match(validatePlan({ ...base, weeks: 10 }), /단계 주 수의 합/);
  assert.match(
    validatePlan({
      ...base,
      depts: [...base.depts, { key: "ALL", label: "x" }],
    }),
    /겹칩니다/,
  );
  assert.match(
    validatePlan({ ...base, depts: [{ key: "all", label: "x" }] }),
    /영문 대문자/,
  );
  assert.match(validatePlan({ ...base, depts: [] }), /하나 이상/);
});

test("plans round-trip and bad fields are dropped on read", () => {
  const p = plan({ note: "10/22 변경" });
  assert.deepEqual(decodePlan(encodePlan(p)), p);
  assert.equal(decodePlan("not json"), null);
  assert.equal(readPlan({ ...p, updatedBy: "nope" }), null);
  assert.equal(readPlan({ ...p, weeks: 99 }), null);
  const cleaned = readPlan({
    ...p,
    depts: [
      ...p.depts,
      { key: "bad key", label: "x" },
      { key: "ALL", label: "dup" },
      { key: "X", label: "" },
    ],
    phases: [...p.phases, { label: "over", weeks: 3, tone: "nope" }],
  });
  assert.deepEqual(
    cleaned.depts.map((dept) => dept.key),
    ["ALL", "POST", "MEET"],
  );
  assert.equal(cleaned.phases.length, 3);
});

test("the newest plan wins, ties go to the higher pubkey", () => {
  const old = plan({ updatedAt: 1, updatedBy: ALICE });
  const newer = plan({ updatedAt: 2, updatedBy: ALICE, title: "new" });
  const tie = plan({ updatedAt: 1, updatedBy: BOB, title: "bob" });
  assert.equal(mergePlan(old, newer), newer);
  assert.equal(mergePlan(newer, old), newer);
  assert.equal(mergePlan(old, tie), tie);
  assert.equal(mergePlan(null, old), old);
  assert.equal(mergePlan(old, null), old);
});

test("mergePlanEvents picks the newest plan and tracks the own event", () => {
  const dTag = teamSprintDTag("wss://paratkd.communities.buzz.xyz");
  const event = (pubkey, p, createdAt, d = dTag) => ({
    id: `${pubkey[0]}${createdAt}`,
    pubkey,
    created_at: createdAt,
    kind: 30078,
    tags: [["d", d]],
    content: encodePlan(p),
    sig: "",
  });
  const result = mergePlanEvents(
    [
      event(ALICE, plan({ updatedAt: 5 }), 10),
      event(BOB, plan({ updatedAt: 9, updatedBy: BOB, title: "bob" }), 11),
      event(BOB, plan({ updatedAt: 99, updatedBy: BOB }), 12, "other"),
    ],
    dTag,
    ALICE,
  );
  assert.equal(result.merged.title, "bob");
  assert.equal(result.own.updatedAt, 5);
  assert.equal(result.ownCreatedAt, 10);
});

test("defaultPlan starts on this week's Monday", () => {
  assert.equal(mondayOf("2026-11-06"), "2026-11-02");
  assert.equal(mondayOf("2026-11-02"), "2026-11-02");
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");
  const p = defaultPlan("2026-11-06", ALICE);
  assert.equal(p.start, "2026-11-02");
  assert.equal(validatePlan(p), null);
});

test("dDayLabel counts down and up", () => {
  assert.equal(dDayLabel("2026-12-12", "2026-11-06"), "D-36");
  assert.equal(dDayLabel("2026-12-28", "2026-11-06"), "D-52");
  assert.equal(dDayLabel("2026-11-06", "2026-11-06"), "D-DAY");
  assert.equal(dDayLabel("2026-11-01", "2026-11-06"), "D+5");
});

test("month slots keep their place and reuse freed slots", () => {
  const first = assignMonthSlots([], ["2026-10", "2026-11", "repeat"]);
  assert.equal(first.length, 12);
  assert.deepEqual(first.slice(0, 3), ["2026-10", "2026-11", "repeat"]);
  const next = assignMonthSlots(first, ["2026-11", "2026-12"]);
  assert.equal(next[1], "2026-11");
  assert.equal(next[0], "2026-12");
  assert.equal(next.filter(Boolean).length, 2);
  const many = assignMonthSlots(
    [],
    Array.from(
      { length: 20 },
      (_, index) =>
        `2026-${String((index % 12) + 1).padStart(2, "0")}-${index}`,
    ),
  );
  assert.equal(many.filter(Boolean).length, 12);
});
