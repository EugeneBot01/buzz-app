import type { Communities } from "../../features/communities/service";
import { bindMessageNotifications } from "../../features/notifications/messages";
import type { NotificationsService } from "../../features/notifications/service";
import { communityAlerts } from "./community-alerts";

/**
 * Alerts from every joined community, not only the selected one (Buzz Team).
 *
 * The app keeps one live session per opened community; this opens each joined
 * community in the background and binds the same message alerts to it. A
 * binding stays quiet while its community is selected, so nothing alerts twice.
 * Background connections start a few seconds after launch and then one at a
 * time, so the selected community connects first and nothing arrives at once.
 * Communities whose alerts are turned off are not connected at all.
 */
const START_DELAY_MS = 5_000;
const BETWEEN_MS = 3_000;

export function bindBackgroundCommunityAlerts(
  notifications: NotificationsService,
  communities: Communities,
) {
  communityAlerts.attach(communities);
  const bindings = new Map<string, () => void>();
  let viewer: string | undefined;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const name = (id: string) => () => {
    const current = communities
      .snapshot()
      .memberships.find((item) => item.id === id);
    return current?.localName || current?.publishedName || current?.name || "";
  };
  /** Connects the next waiting community, then schedules the one after. */
  const connectNext = () => {
    timer = undefined;
    const waiting = communities
      .snapshot()
      .memberships.find(
        (item) => !bindings.has(item.id) && communityAlerts.isOn(item.id),
      );
    if (!waiting) return;
    bindings.set(
      waiting.id,
      bindMessageNotifications(notifications, communities, {
        id: waiting.id,
        name: name(waiting.id),
      }),
    );
    timer = setTimeout(connectNext, BETWEEN_MS);
  };
  const update = () => {
    const client = communities.snapshot();
    // The account's on/off list is ready even before connecting starts.
    communityAlerts.selectViewer(client.viewer);
    if (!started) return;
    // A different account starts over.
    if (client.viewer !== viewer) {
      for (const stop of bindings.values()) stop();
      bindings.clear();
      viewer = client.viewer;
    }
    if (!viewer) return;
    const joined = new Set(client.memberships.map((item) => item.id));
    for (const [id, stop] of bindings)
      if (!joined.has(id) || !communityAlerts.isOn(id)) {
        stop();
        bindings.delete(id);
      }
    if (timer === undefined) connectNext();
  };
  const stopCommunities = communities.subscribe(update);
  const stopSettings = communityAlerts.subscribe(update);
  const start = setTimeout(() => {
    started = true;
    update();
  }, START_DELAY_MS);
  return () => {
    clearTimeout(start);
    clearTimeout(timer);
    stopCommunities();
    stopSettings();
    for (const unbind of bindings.values()) unbind();
    bindings.clear();
  };
}
