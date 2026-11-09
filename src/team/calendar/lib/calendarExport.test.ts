// @ts-nocheck -- ported from the 0.5 team build as plain JS tests
import assert from "node:assert/strict";
import { test } from "vitest";

import { buildCalendarBackup, parseCalendarImport } from "./calendarImport";
import {
  buildDocx,
  buildPdf,
  crc32,
  fileSafe,
  xmlText,
  zipStore,
} from "./exportFormats";
import { calendarPages, entriesCsv, sprintPages } from "./exportModel";

const ALICE = "a".repeat(64);

const plan = {
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
    { key: "POST", label: "포스트", color: "indigo" },
  ],
  keyDates: [{ label: "프로덕션", date: "2026-12-12" }],
  note: "10/22 변경",
};

const entries = [
  {
    id: "mp-all-w16-1",
    title: "납품",
    date: "2026-12-28",
    dept: "ALL",
    milestone: true,
    color: "red",
    updatedAt: 1,
    updatedBy: ALICE,
  },
  {
    id: "mp-post-w14-1",
    title: "편집 1차",
    date: "2026-12-14",
    endDate: "2026-12-17",
    dept: "POST",
    updatedAt: 1,
    updatedBy: ALICE,
  },
  {
    id: "loose",
    title: '회식, "송년"',
    date: "2026-12-18",
    time: "19:00",
    updatedAt: 1,
    updatedBy: ALICE,
  },
];

const importFile = (overrides = {}) =>
  JSON.stringify({
    format: "buzz-team-calendar",
    version: 1,
    plan,
    entries: entries.map(({ updatedAt, updatedBy, ...rest }) => rest),
    people: [
      {
        id: "crew-01",
        name: "강은서",
        role: "PD",
        rules: [
          {
            id: "r001",
            kind: "busy",
            startDate: "2026-10-23",
            endDate: "2026-12-11",
            weekday: 5,
            start: 360,
            end: 780,
            title: "06:00~13:00 촬영",
            exclude: [],
          },
        ],
      },
    ],
    ...overrides,
  });

test("an import file is read with its plan, entries and people", () => {
  const data = parseCalendarImport(`﻿${importFile()}`);
  assert.equal(data.plan.title, plan.title);
  assert.equal(data.entries.length, 3);
  assert.equal(data.entries[0].milestone, true);
  assert.equal(data.entries[1].endDate, "2026-12-17");
  assert.equal(data.people[0].rules[0].weekday, 5);
});

test("import errors say what is wrong, in Korean", () => {
  assert.throws(() => parseCalendarImport("{"), /JSON/);
  assert.throws(() => parseCalendarImport(importFile({ format: "x" })), /형식/);
  assert.throws(() => parseCalendarImport(importFile({ version: 9 })), /버전/);
  assert.throws(
    () =>
      parseCalendarImport(
        importFile({ entries: [{ id: "a", title: "x", date: "2026-13-01" }] }),
      ),
    /날짜/,
  );
  assert.throws(
    () =>
      parseCalendarImport(
        importFile({
          entries: [
            { id: "a", title: "x", date: "2026-10-01" },
            { id: "a", title: "y", date: "2026-10-02" },
          ],
        }),
      ),
    /겹칩니다/,
  );
  assert.throws(
    () =>
      parseCalendarImport(
        importFile({
          entries: [
            { id: "a", title: "x", date: "2026-10-01", endDate: "2026-12-01" },
          ],
        }),
      ),
    /최대 28일/,
  );
  assert.throws(
    () => parseCalendarImport(importFile({ plan: { ...plan, weeks: 2 } })),
    /스프린트 설정/,
  );
  assert.throws(
    () =>
      parseCalendarImport(
        JSON.stringify({ format: "buzz-team-calendar", version: 1 }),
      ),
    /가져올 내용이 없습니다/,
  );
});

test("a backup imports back to the same data", () => {
  const backup = buildCalendarBackup({
    plan,
    entries,
    people: [
      {
        id: "crew-01",
        name: "강은서",
        role: "PD",
        rules: [],
        updatedAt: 1,
        updatedBy: ALICE,
      },
    ],
  });
  const data = parseCalendarImport(backup);
  assert.deepEqual(
    data.entries.map((entry) => entry.id),
    entries.map((entry) => entry.id),
  );
  assert.equal(data.plan.weeks, 16);
  assert.equal(data.people[0].name, "강은서");
});

test("sprint pages split into 8-week pages for paper", () => {
  const pages = sprintPages({
    plan,
    entries,
    fromWeek: 0,
    toWeek: 15,
    today: "2026-11-06",
    paginate: true,
  });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].columns.length, 8);
  assert.equal(pages[1].columns[0].label, "W09");
  assert.match(pages[0].title, /\(1\/2\)$/);
  assert.equal(pages[0].columns[7].highlight, true); // W08 holds 11/6
  // Rows: the two departments plus 기타 for the entry without one.
  assert.deepEqual(
    pages[1].rows.map((row) => row.label),
    ["ALL", "POST", "기타"],
  );
  const post = pages[1].rows[1];
  assert.equal(post.cells[5].items[0].text, "편집 1차 (12/14–12/17)");
  assert.equal(post.cells[5].items[0].color, "indigo");
  assert.equal(pages[1].rows[0].cells[7].items[0].text, "12/28 납품");
  assert.equal(pages[1].rows[0].cells[7].items[0].milestone, true);
  assert.deepEqual(
    pages[1].bands.map((band) => [band.label, band.span]),
    [
      ["PRE-PRODUCTION", 4],
      ["PRODUCTION", 1],
      ["POST-PRODUCTION", 3],
    ],
  );
  assert.equal(pages[0].counters[0].value, "D-36");
  const single = sprintPages({
    plan,
    entries,
    fromWeek: 12,
    toWeek: 13,
    today: "2026-11-06",
    paginate: false,
  });
  assert.equal(single.length, 1);
  assert.equal(single[0].columns.length, 2);
});

test("calendar pages are month grids with items on their days", () => {
  const [december] = calendarPages({
    title: "팀 캘린더",
    months: ["2026-12"],
    entries: [
      ...entries,
      {
        id: "weekend",
        title: "촬영",
        date: "2026-12-19",
        endDate: "2026-12-21",
        updatedAt: 1,
        updatedBy: ALICE,
      },
    ],
    today: "2026-12-15",
    deptLabel: (key) => ({ POST: "포스트" })[key],
  });
  assert.equal(december.title, "2026년 12월");
  assert.equal(december.columns.length, 7);
  assert.equal(december.rows.length, 5); // Dec 2026: 11/29 ~ 1/2
  const cells = december.rows.flatMap((row) => row.cells);
  const day = (value, inMonth = true) =>
    cells.find((cell) => cell.day === value && cell.muted !== inMonth);
  // A multi-day entry is written once per week row, with its range.
  assert.equal(day("14").items[0].text, "편집 1차 (12/14–12/17) [포스트]");
  assert.equal(day("15").items.length, 0);
  assert.equal(day("15").today, true);
  assert.equal(day("19").items[0].text, "촬영 (12/19–12/21)");
  assert.equal(day("20").items[0].text, "↳ 촬영 (12/19–12/21)");
  assert.equal(day("21").items.length, 0);
  assert.equal(day("18").items[0].text, '19:00 회식, "송년"');
});

test("CSV has a BOM, a header and quoted fields", () => {
  const csv = entriesCsv({
    entries,
    from: "2026-12-01",
    to: "2026-12-31",
    deptLabel: (key) => ({ POST: "포스트", ALL: "전 부서" })[key],
  });
  assert.ok(csv.startsWith("﻿시작 날짜,"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 4);
  assert.ok(
    lines.includes('2026-12-18,2026-12-18,19:00,,"회식, ""송년""",,작업,'),
  );
  assert.ok(
    lines.includes("2026-12-28,2026-12-28,,,납품,전 부서,마감·이벤트,"),
  );
});

test("crc32 matches the reference value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("zipStore writes a readable archive", () => {
  const data = new TextEncoder().encode("안녕");
  const zip = zipStore([{ name: "a/한글.txt", data }]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 1);
  const centralAt = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(centralAt, true), 0x02014b50);
  assert.equal(view.getUint32(centralAt + 16, true), crc32(data));
});

test("the Word file is a zip with the document and escaped text", () => {
  const pages = sprintPages({
    plan,
    entries,
    fromWeek: 12,
    toWeek: 15,
    today: "2026-11-06",
    paginate: true,
  });
  const docx = buildDocx(pages);
  const text = new TextDecoder().decode(docx);
  assert.ok(text.startsWith("PK"));
  assert.ok(text.includes("word/document.xml"));
  assert.ok(text.includes("[Content_Types].xml"));
  assert.ok(text.includes("편집 1차 (12/14–12/17)"));
  assert.ok(text.includes("회식, &quot;송년&quot;"));
  assert.ok(text.includes('w:orient="landscape"'));
  assert.equal(xmlText("a<b>&\u0001"), "a&lt;b&gt;&amp;");
});

test("the PDF has one page per image and a valid xref", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildPdf([
    { jpeg, width: 100, height: 50 },
    { jpeg, width: 50, height: 100 },
  ]);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.includes("/Count 2"));
  assert.equal(text.match(/\/Type \/Page /g).length, 2);
  const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
  // Every xref offset points at "N 0 obj".
  const offsets = [
    ...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm),
  ].map((match) => Number(match[1]));
  assert.equal(offsets.length, 8);
  offsets.forEach((offset, index) => {
    assert.ok(
      text.slice(offset).startsWith(`${index + 1} 0 obj`),
      `object ${index + 1}`,
    );
  });
});

test("fileSafe removes path and control characters", () => {
  assert.equal(fileSafe("a/b:c*?\u0001 d"), "a b c d");
  assert.equal(fileSafe("   "), "calendar");
});
