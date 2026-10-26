import { addDays, dateKey, daysBetween, todayKey } from "./teamCalendar";

/**
 * Finds a date and a time in a chat message written in Korean ("10월 12일
 * 오후 3시", "내일 14:00", "다음 주 화요일 3시~5시"). It is a best guess the
 * person confirms before anything is saved, so it prefers the common reading
 * over being exact.
 */
export type ParsedSchedule = {
  date: string;
  time?: string | undefined;
  endTime?: string | undefined;
  /** False when the message named no day and today was assumed. */
  hasDate: boolean;
};

const WEEKDAY_INDEX: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};
const RELATIVE_DAYS: Record<string, number> = {
  오늘: 0,
  내일: 1,
  모레: 2,
  글피: 3,
};

const pad = (value: number) => String(value).padStart(2, "0");

const isRealDate = (date: string) => addDays(date, 0) === date;

function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function findDate(text: string, today: string): string | null {
  const full = text.match(
    /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/,
  );
  if (full) {
    const date = dateKey(Number(full[1]), Number(full[2]), Number(full[3]));
    if (isRealDate(date)) return date;
  }
  const monthDay =
    text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) ??
    text.match(/(?<![\d/.])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (monthDay) {
    const year = Number(today.slice(0, 4));
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let date = dateKey(year, month, day);
      // A day long past was meant for next year ("1월 5일" said in December).
      if (isRealDate(date) && daysBetween(date, today) > 60)
        date = dateKey(year + 1, month, day);
      if (isRealDate(date)) return date;
    }
  }
  const relative = text.match(/오늘|내일|모레|글피/);
  if (relative) return addDays(today, RELATIVE_DAYS[relative[0]] as number);
  const weekday = text.match(
    /(이번|다음|다다음)?\s*주?\s*([월화수목금토일])요일/,
  );
  if (weekday) {
    const target = WEEKDAY_INDEX[weekday[2] as string] as number;
    const current = weekdayOf(today);
    if (weekday[1]) {
      // Weeks run Monday to Sunday here, as people say "다음 주".
      const monday = addDays(today, -((current + 6) % 7));
      const weeks = { 이번: 0, 다음: 1, 다다음: 2 }[weekday[1]] as number;
      return addDays(monday, weeks * 7 + ((target + 6) % 7));
    }
    return addDays(today, (target - current + 7) % 7);
  }
  const dayOnly = text.match(
    /(?<![\d월])(\d{1,2})\s*일(?!\s*(전|후|간|동안|째))/,
  );
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    if (day >= 1 && day <= 31) {
      let date = dateKey(year, month, day);
      // "15일" said on the 20th means next month's 15th.
      if (date < today)
        date =
          month === 12
            ? dateKey(year + 1, 1, day)
            : dateKey(year, month + 1, day);
      if (isRealDate(date)) return date;
    }
  }
  return null;
}

type FoundTime = { time: string; index: number; end: number };

function findTimes(text: string): FoundTime[] {
  const found: FoundTime[] = [];
  const pattern =
    /(오전|오후|아침|저녁|밤|낮|새벽)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?!간)\s*(반|(\d{1,2})\s*분)?)|(\d{1,2})\s*(am|pm)\b/gi;
  let inherited: string | undefined;
  for (const match of text.matchAll(pattern)) {
    let hour: number;
    let minute = 0;
    let marker: string | undefined;
    if (match[6] !== undefined) {
      hour = Number(match[6]);
      marker = (match[7] as string).toLowerCase() === "pm" ? "오후" : "오전";
    } else {
      hour = Number(match[2]);
      marker = match[1] ?? undefined;
      if (match[3] !== undefined) minute = Number(match[3]);
      else if (match[4] === "반") minute = 30;
      else if (match[5] !== undefined) minute = Number(match[5]);
    }
    if (hour > 24 || minute > 59) continue;
    // "오후 3시~5시": the second time takes the first one's half of the day.
    marker ??= inherited;
    if (
      marker === "오후" ||
      marker === "저녁" ||
      marker === "밤" ||
      marker === "낮"
    ) {
      if (hour < 12 && !(marker === "낮" && hour >= 11)) hour += 12;
    } else if (marker === "오전" || marker === "아침" || marker === "새벽") {
      if (hour === 12) hour = 0;
    } else if (match[3] === undefined && hour >= 1 && hour <= 6) {
      // "3시" with nothing else almost always means the afternoon.
      hour += 12;
    }
    if (hour >= 24) continue;
    inherited = marker;
    const index = match.index ?? 0;
    found.push({
      time: `${pad(hour)}:${pad(minute)}`,
      index,
      end: index + match[0].length,
    });
  }
  return found;
}

/** The schedule a message talks about, or `null` when it names none. */
export function parseSchedule(
  text: string,
  now: Date = new Date(),
): ParsedSchedule | null {
  const today = todayKey(now);
  const date = findDate(text, today);
  const times = findTimes(text);
  const first = times[0];
  if (!date && !first) return null;
  const result: ParsedSchedule = {
    date: date ?? today,
    hasDate: date !== null,
  };
  if (first) {
    result.time = first.time;
    const second = times[1];
    // An end time follows the start closely: "3시~5시", "3시부터 5시까지".
    if (
      second &&
      second.time > first.time &&
      /^\s*(~|-|–|부터|에서)\s*$/.test(text.slice(first.end, second.index))
    )
      result.endTime = second.time;
  }
  return result;
}

/** A short title for an entry made from a message: its first line, trimmed. */
export function titleFromMessage(text: string, limit = 60): string {
  const line =
    text
      .split("\n")
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? "";
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}
