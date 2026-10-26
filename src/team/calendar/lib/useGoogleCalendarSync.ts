import * as React from "react";

import {
  type GoogleSyncOp,
  isAppsScriptUrl,
  newestVersions,
  parsePushed,
  pendingOps,
} from "./googleSync";
import { REPEAT_DOC, monthOfDate, shiftMonth, todayKey } from "./teamCalendar";
import { useTeamCalendarMonth } from "./useTeamCalendar";

const CONFIG_PREFIX = "buzz-team-calendar-google.v1";
const PUSHED_PREFIX = "buzz-team-calendar-google-pushed.v1";
const STATUS_PREFIX = "buzz-team-calendar-google-status.v1";
const CHANGED_EVENT = "buzz-team-calendar-google-changed";
const CHECK_INTERVAL_MS = 30_000;

/** This device's Google link: the Apps Script URL and the shared secret. */
export type GoogleSyncConfig = { url: string; secret: string };
/** The outcome of the last push, for the settings panel. */
export type GoogleSyncStatus = {
  at: number;
  /** "ok": the script answered; "sent": sent, but the answer was unreadable. */
  result: "ok" | "sent" | "error";
  message?: string | undefined;
  count: number;
};

const keyOf = (prefix: string, pubkey: string, relayUrl: string) =>
  `${prefix}:${pubkey}:${relayUrl}`;

function read<T>(key: string, parse: (raw: string) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the link lasts until the app restarts at most.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function parseConfig(raw: string): GoogleSyncConfig | null {
  try {
    const value = JSON.parse(raw) as Partial<GoogleSyncConfig>;
    return typeof value.url === "string" &&
      isAppsScriptUrl(value.url) &&
      typeof value.secret === "string"
      ? { url: value.url, secret: value.secret }
      : null;
  } catch {
    return null;
  }
}

function parseStatus(raw: string): GoogleSyncStatus | null {
  try {
    return JSON.parse(raw) as GoogleSyncStatus;
  } catch {
    return null;
  }
}

/** This device's Google link settings and last result. */
export function useGoogleSyncSettings(pubkey: string, relayUrl: string) {
  const configKey = keyOf(CONFIG_PREFIX, pubkey, relayUrl);
  const statusKey = keyOf(STATUS_PREFIX, pubkey, relayUrl);
  const snapshot = React.useCallback(
    () => ({
      config: read(configKey, parseConfig),
      status: read(statusKey, parseStatus),
    }),
    [configKey, statusKey],
  );
  const [state, setState] = React.useState(snapshot);
  React.useEffect(() => {
    const refresh = () => setState(snapshot());
    refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHANGED_EVENT, refresh);
  }, [snapshot]);

  const save = React.useCallback(
    (config: GoogleSyncConfig | null) => {
      if (config && !isAppsScriptUrl(config.url))
        throw new Error(
          "Apps Script 웹 앱 주소(https://script.google.com/macros/s/…/exec)를 넣으세요.",
        );
      write(
        configKey,
        config && { url: config.url.trim(), secret: config.secret },
      );
    },
    [configKey],
  );
  /** Sends every entry again on the next check (after fixing the script). */
  const resendAll = React.useCallback(
    () => write(keyOf(PUSHED_PREFIX, pubkey, relayUrl), null),
    [pubkey, relayUrl],
  );

  return { ...state, save, resendAll };
}

async function send(
  config: GoogleSyncConfig,
  ops: GoogleSyncOp[],
): Promise<"ok" | "sent"> {
  // text/plain keeps this a simple request (no CORS preflight), which Apps
  // Script web apps accept.
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: config.secret, ops }),
  };
  let response: Response;
  try {
    response = await fetch(config.url, init);
  } catch {
    // The answer could not be read (cross-origin redirect). Send it blind:
    // every operation replaces the event, so sending twice is harmless.
    await fetch(config.url, { ...init, mode: "no-cors" });
    return "sent";
  }
  const answer = (await response.json().catch(() => null)) as {
    ok?: boolean | undefined;
    error?: string | undefined;
  } | null;
  if (!response.ok || !answer?.ok)
    throw new Error(
      answer?.error === "secret"
        ? "비밀문구가 스크립트와 다릅니다."
        : `구글 스크립트가 거절했습니다 (${response.status}).`,
    );
  return "ok";
}

/**
 * Copies team calendar changes to Google while the app runs (team patch).
 * Does nothing on devices without a Google link. Covers last month to three
 * months ahead plus repeating entries.
 */
export function useGoogleCalendarSync(pubkey: string, relayUrl: string) {
  const { config } = useGoogleSyncSettings(pubkey, relayUrl);
  const [month, setMonth] = React.useState(() => monthOfDate(todayKey()));
  const docs = [
    useTeamCalendarMonth(pubkey, relayUrl, shiftMonth(month, -1)),
    useTeamCalendarMonth(pubkey, relayUrl, month),
    useTeamCalendarMonth(pubkey, relayUrl, shiftMonth(month, 1)),
    useTeamCalendarMonth(pubkey, relayUrl, shiftMonth(month, 2)),
    useTeamCalendarMonth(pubkey, relayUrl, shiftMonth(month, 3)),
    useTeamCalendarMonth(pubkey, relayUrl, REPEAT_DOC),
  ];
  const latest = React.useRef({
    config,
    ready: false,
    entries: newestVersions([]),
  });
  latest.current = {
    config,
    ready: docs.every((doc) => doc.status === "ready"),
    entries: newestVersions(docs.map((doc) => doc.entries)),
  };

  React.useEffect(() => {
    const pushedKey = keyOf(PUSHED_PREFIX, pubkey, relayUrl);
    const statusKey = keyOf(STATUS_PREFIX, pubkey, relayUrl);
    let busy = false;
    // A failing script is retried with backoff (30 s doubling, up to 30 min).
    let failures = 0;
    let retryAt = 0;

    const check = async () => {
      setMonth(monthOfDate(todayKey()));
      const now = latest.current;
      if (busy || !now.config || !now.ready || Date.now() < retryAt) return;
      const pushed = read(pushedKey, parsePushed) ?? {};
      const { ops, versions } = pendingOps(now.entries, pushed);
      if (ops.length === 0) return;
      busy = true;
      try {
        const result = await send(now.config, ops);
        // Re-read: "다시 보내기" may have cleared the record meanwhile.
        write(pushedKey, {
          ...(read(pushedKey, parsePushed) ?? {}),
          ...versions,
        });
        write(statusKey, { at: Date.now(), result, count: ops.length });
        failures = 0;
        retryAt = 0;
      } catch (error) {
        failures += 1;
        retryAt =
          Date.now() + Math.min(30 * 60_000, CHECK_INTERVAL_MS * 2 ** failures);
        // Not recorded as sent, so the next check tries again.
        write(statusKey, {
          at: Date.now(),
          result: "error",
          count: ops.length,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        busy = false;
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pubkey, relayUrl]);
}
