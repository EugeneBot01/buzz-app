/**
 * Default channels (Buzz Team): the channels a community's owners and admins
 * choose for every newcomer. Stored as one plaintext kind-30078 document per
 * admin; readers keep the newest one written by a current owner or admin, so
 * an ordinary member's document never changes anyone's defaults.
 */
export const ONBOARDING_TAG = "team-onboarding";
export const MAX_DEFAULT_CHANNELS = 30;

export const onboardingDTag = (relayUrl: string) =>
  `${ONBOARDING_TAG}:${relayUrl}`;

export type DefaultChannel = Readonly<{ id: string; name: string }>;
export type OnboardingDoc = Readonly<{
  version: 1;
  channels: readonly DefaultChannel[];
  updatedAt: number;
}>;

export function encodeOnboarding(
  channels: readonly DefaultChannel[],
  now = Date.now(),
): string {
  const doc: OnboardingDoc = {
    version: 1,
    channels: channels.slice(0, MAX_DEFAULT_CHANNELS),
    updatedAt: now,
  };
  return JSON.stringify(doc);
}

export function decodeOnboarding(content: string): OnboardingDoc | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { version, channels, updatedAt } = raw as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(channels)) return null;
  const seen = new Set<string>();
  const valid: DefaultChannel[] = [];
  for (const entry of channels) {
    if (!entry || typeof entry !== "object") continue;
    const { id, name } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 128 || seen.has(id))
      continue;
    seen.add(id);
    valid.push({
      id,
      name: typeof name === "string" ? name.slice(0, 120) : id,
    });
    if (valid.length === MAX_DEFAULT_CHANNELS) break;
  }
  return {
    version: 1,
    channels: valid,
    updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
  };
}

/** The newest readable document written by a current owner or admin. */
export function latestOnboarding(
  events: readonly { pubkey: string; content: string; created_at: number }[],
  managers: ReadonlySet<string>,
): OnboardingDoc | null {
  let best: { at: number; doc: OnboardingDoc } | undefined;
  for (const event of events) {
    if (!managers.has(event.pubkey)) continue;
    const doc = decodeOnboarding(event.content);
    if (!doc) continue;
    if (!best || event.created_at > best.at)
      best = { at: event.created_at, doc };
  }
  return best?.doc ?? null;
}

/** Defaults still to join: not already joined and never tried before, so a
 * channel someone left on purpose is not forced back on them. */
export function pendingDefaults(
  doc: OnboardingDoc | null,
  joined: ReadonlySet<string>,
  attempted: ReadonlySet<string>,
): DefaultChannel[] {
  return (doc?.channels ?? []).filter(
    ({ id }) => !joined.has(id) && !attempted.has(id),
  );
}

type Progress = { welcomed: boolean; attempted: string[] };
const progressKey = (viewer: string, community: string) =>
  `buzz-team-onboarding.v1:${viewer}:${community}`;

export function readProgress(viewer: string, community: string): Progress {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(progressKey(viewer, community)) ?? "null",
    ) as Partial<Progress> | null;
    return {
      welcomed: raw?.welcomed === true,
      attempted: Array.isArray(raw?.attempted)
        ? raw.attempted.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return { welcomed: false, attempted: [] };
  }
}

export function writeProgress(
  viewer: string,
  community: string,
  progress: Progress,
) {
  try {
    window.localStorage.setItem(
      progressKey(viewer, community),
      JSON.stringify({
        welcomed: progress.welcomed,
        attempted: progress.attempted.slice(-200),
      }),
    );
  } catch {
    // Private windows can refuse storage; the guide then simply shows again.
  }
}
