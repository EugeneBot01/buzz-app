import type { Communities } from "../../features/communities/service";
import { bindMessageNotifications } from "../../features/notifications/messages";
import type { NotificationsService } from "../../features/notifications/service";

/**
 * Alerts from every joined community, not only the selected one (Buzz Team).
 *
 * The app keeps one live session per opened community; this opens each joined
 * community in the background and binds the same message alerts to it. A
 * binding stays quiet while its community is selected, so nothing alerts twice.
 * Background connections start a few seconds after launch, so the selected
 * community connects first and startup stays fast.
 */
const START_DELAY_MS = 5_000;

export function bindBackgroundCommunityAlerts(
  notifications: NotificationsService,
  communities: Communities,
) {
  const bindings = new Map<string, () => void>();
  let viewer: string | undefined;
  let started = false;
  const update = () => {
    if (!started) return;
    const client = communities.snapshot();
    // A different account starts over.
    if (client.viewer !== viewer) {
      for (const stop of bindings.values()) stop();
      bindings.clear();
      viewer = client.viewer;
    }
    if (!viewer) return;
    const joined = new Set(client.memberships.map((item) => item.id));
    for (const [id, stop] of bindings)
      if (!joined.has(id)) {
        stop();
        bindings.delete(id);
      }
    for (const membership of client.memberships) {
      if (bindings.has(membership.id)) continue;
      const id = membership.id;
      bindings.set(
        id,
        bindMessageNotifications(notifications, communities, {
          id,
          name: () => {
            const current = communities
              .snapshot()
              .memberships.find((item) => item.id === id);
            return (
              current?.localName ||
              current?.publishedName ||
              current?.name ||
              ""
            );
          },
        }),
      );
    }
  };
  const stop = communities.subscribe(update);
  const timer = setTimeout(() => {
    started = true;
    update();
  }, START_DELAY_MS);
  return () => {
    clearTimeout(timer);
    stop();
    for (const unbind of bindings.values()) unbind();
    bindings.clear();
  };
}
