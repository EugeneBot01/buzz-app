// @ts-nocheck -- ported from the 0.5 team build as plain JS tests
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  MAX_AVAILABILITY_CONTENT_BYTES,
  availabilityOn,
  busyCountOn,
  decodePeople,
  encodePeople,
  encodePeopleForPublish,
  hasNewerPeople,
  livePeople,
  mergePeople,
  mergePeopleEvents,
  minuteLabel,
  parseMinute,
  ruleAppliesOn,
  ruleWhenLabel,
  teamAvailabilityDTag,
  validateRule,
} from "./teamAvailability";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const rule = (id, overrides = {}) => ({
  id,
  kind: "busy",
  startDate: "2026-10-20",
  endDate: "2026-12-08",
  weekday: 2,
  start: 0,
  end: 1260,
  title: "~21:00 (21시 이후 가능)",
  exclude: [],
  ...overrides,
});

const person = (id, overrides = {}) => ({
  id,
  name: id,
  rules: [],
  updatedAt: 1,
  updatedBy: ALICE,
  ...overrides,
});

test("a weekly rule applies on its weekday inside the period, not on excluded days", () => {
  const weekly = rule("r1", { exclude: ["2026-10-27"] });
  assert.equal(ruleAppliesOn(weekly, "2026-10-20"), true); // Tuesday
  assert.equal(ruleAppliesOn(weekly, "2026-10-21"), false); // Wednesday
  assert.equal(ruleAppliesOn(weekly, "2026-10-27"), false); // excluded
  assert.equal(ruleAppliesOn(weekly, "2026-12-08"), true); // last Tuesday
  assert.equal(ruleAppliesOn(weekly, "2026-12-15"), false); // after
  const daily = rule("r2", {
    weekday: null,
    startDate: "2026-11-07",
    endDate: "2026-11-07",
  });
  assert.equal(ruleAppliesOn(daily, "2026-11-07"), true);
  assert.equal(ruleAppliesOn(daily, "2026-11-08"), false);
});

test("validateRule checks dates, times and title", () => {
  assert.equal(validateRule(rule("r")), null);
  assert.match(validateRule(rule("r", { title: " " })), /적어/);
  assert.match(validateRule(rule("r", { end: 0 })), /늦어야/);
  assert.match(validateRule(rule("r", { end: 1441 })), /시간/);
  assert.match(
    validateRule(rule("r", { endDate: "2026-10-01" })),
    /빠를 수 없습니다/,
  );
  assert.match(validateRule(rule("r", { weekday: 7 })), /요일/);
  assert.match(validateRule(rule("r", { endDate: "2028-01-01" })), /1년/);
});

test("minutes and HH:MM convert both ways, including 24:00", () => {
  assert.equal(minuteLabel(0), "00:00");
  assert.equal(minuteLabel(870), "14:30");
  assert.equal(minuteLabel(1440), "24:00");
  assert.equal(parseMinute("24:00"), 1440);
  assert.equal(parseMinute("9:05"), 545);
  assert.equal(parseMinute("24:30"), null);
  assert.equal(parseMinute("12:60"), null);
  assert.equal(parseMinute("noon"), null);
});

test("ruleWhenLabel reads like the scheduling page", () => {
  assert.equal(
    ruleWhenLabel(rule("r")),
    "매주 화요일 · 10/20~12/8 · 00:00~21:00",
  );
  assert.equal(
    ruleWhenLabel(
      rule("r", {
        weekday: null,
        startDate: "2026-11-07",
        endDate: "2026-11-07",
        end: 1440,
      }),
    ),
    "11/7 · 종일",
  );
  assert.match(
    ruleWhenLabel(rule("r", { exclude: ["2026-11-08"] })),
    /제외 11\/8$/,
  );
});

test("people round-trip; malformed rules and people are dropped", () => {
  const people = {
    p1: person("p1", { role: "PD", pubkey: BOB, rules: [rule("r1")] }),
  };
  assert.deepEqual(decodePeople(encodePeople(people)), people);
  const decoded = decodePeople(
    JSON.stringify({
      v: 1,
      people: {
        p1: {
          ...people.p1,
          rules: [
            rule("r1"),
            rule("r1"),
            { ...rule("r2"), kind: "maybe" },
            rule("r3", { end: 0 }),
          ],
        },
        "bad id!": person("x"),
        p2: { ...person("p2"), updatedBy: "nope" },
        p3: { ...person("p3"), name: "" },
      },
    }),
  );
  assert.deepEqual(Object.keys(decoded), ["p1"]);
  assert.deepEqual(
    decoded.p1.rules.map((item) => item.id),
    ["r1"],
  );
  assert.deepEqual(decodePeople("nope"), {});
});

test("people merge person by person, last writer wins, deletions stick", () => {
  const base = { p1: person("p1", { name: "old", updatedAt: 1 }) };
  const newer = { p1: person("p1", { name: "new", updatedAt: 2 }) };
  assert.equal(mergePeople(base, newer).p1.name, "new");
  assert.equal(mergePeople(newer, base).p1.name, "new");
  assert.equal(mergePeople(newer, base), newer);
  const gone = { p1: person("p1", { name: "", updatedAt: 3, deleted: true }) };
  const merged = mergePeople(newer, gone);
  assert.equal(merged.p1.deleted, true);
  assert.deepEqual(livePeople(merged), []);
  assert.equal(hasNewerPeople(merged, newer), true);
  assert.equal(hasNewerPeople(newer, merged), false);
});

test("mergePeopleEvents keeps each member's newest event", () => {
  const dTag = teamAvailabilityDTag("wss://paratkd.communities.buzz.xyz");
  const event = (pubkey, people, createdAt) => ({
    id: `${pubkey[0]}${createdAt}`,
    pubkey,
    created_at: createdAt,
    kind: 30078,
    tags: [["d", dTag]],
    content: encodePeople(people),
    sig: "",
  });
  const result = mergePeopleEvents(
    [
      event(ALICE, { p1: person("p1", { updatedAt: 1 }) }, 10),
      event(ALICE, { p1: person("p1", { updatedAt: 5, name: "alice2" }) }, 20),
      event(BOB, { p2: person("p2", { updatedBy: BOB }) }, 15),
    ],
    dTag,
    ALICE,
  );
  assert.equal(result.merged.p1.name, "alice2");
  assert.ok(result.merged.p2);
  assert.equal(result.ownCreatedAt, 20);
  assert.deepEqual(Object.keys(result.own), ["p1"]);
});

test("availabilityOn lists who has something that day, busiest first", () => {
  const people = livePeople({
    a: person("a", {
      name: "강은서",
      rules: [rule("r1", { weekday: 5, start: 360, end: 780, title: "촬영" })],
    }),
    b: person("b", {
      name: "류인성",
      rules: [
        rule("r1"),
        rule("r2", {
          kind: "available",
          start: 1260,
          end: 1440,
          title: "21시 이후",
        }),
      ],
    }),
    c: person("c", {
      name: "김준식",
      rules: [
        rule("r1", {
          kind: "tentative",
          weekday: null,
          startDate: "2026-10-23",
          endDate: "2026-10-23",
          end: 1440,
        }),
      ],
    }),
  });
  const friday = availabilityOn(people, "2026-10-23");
  assert.deepEqual(
    friday.map((item) => [item.person.name, item.status]),
    [
      ["강은서", "busy"],
      ["김준식", "tentative"],
    ],
  );
  const tuesday = availabilityOn(people, "2026-10-20");
  assert.equal(tuesday[0].person.name, "류인성");
  assert.equal(tuesday[0].rules.length, 2);
  assert.equal(tuesday[0].allDayBusy, false);
  // Only whole-day busy counts for the badge.
  assert.equal(busyCountOn(people, "2026-10-23"), 0);
  const allDay = livePeople({
    d: person("d", {
      rules: [
        rule("r1", {
          weekday: null,
          startDate: "2026-11-07",
          endDate: "2026-11-07",
          end: 1440,
        }),
      ],
    }),
  });
  assert.equal(busyCountOn(allDay, "2026-11-07"), 1);
  assert.equal(busyCountOn(allDay, "2026-11-08"), 0);
});

test("a too-big list sheds the oldest deletions, then refuses", () => {
  const many = {};
  for (let index = 0; index < 60; index++) {
    many[`p${index}`] = person(`p${index}`, {
      rules: Array.from({ length: 20 }, (_, at) =>
        rule(`r${at}`, { title: "x".repeat(40) }),
      ),
    });
  }
  assert.equal(encodePeopleForPublish(many), null);
  const small = {
    p1: person("p1"),
    gone: person("gone", { name: "", deleted: true }),
  };
  const content = encodePeopleForPublish(small);
  assert.ok(
    content &&
      new TextEncoder().encode(content).length <=
        MAX_AVAILABILITY_CONTENT_BYTES,
  );
});
