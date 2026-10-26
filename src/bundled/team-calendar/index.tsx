import { useEffect, useState, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type { RelayData } from "../../features/relay/service";
import { scopeOf } from "../reminders/react";
import { CalendarIcon } from "../../shared/design-system/icons/index";
import {
  bindTeamRelay,
  subscribeTeamRelay,
  teamRelay,
} from "../../team/calendar/compat/relay";
import { InlineDialog } from "../../team/calendar/compat/ui";
import { TeamCalendarDialog } from "../../team/calendar/ui/TeamCalendarDialog";
import { AddFromMessageDialog } from "../../team/calendar/ui/AddFromMessageDialog";
import { useTeamCalendarReminders } from "../../team/calendar/lib/useTeamCalendarReminders";
import { useWeeklyDigest } from "../../team/calendar/lib/useWeeklyDigest";
import { useGoogleCalendarSync } from "../../team/calendar/lib/useGoogleCalendarSync";

export const inject = ["pages", "relay", "conversation", "notifications"];

/** The relay address the 0.5 team build used in its calendar keys. */
function legacyRelayUrl(origin: string) {
  return origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

/** Follows the selected community, for the calendar bridge. */
function follow(
  relay: RelayData,
  notify: (
    text: { title: string; body: string },
    scope: { viewer: string; communityOrigin: string },
  ) => void,
) {
  const update = () => {
    const connection = relay.snapshot();
    const scope =
      connection.status === "ready" ? scopeOf(connection) : undefined;
    bindTeamRelay(
      scope
        ? {
            session: connection.session,
            viewer: scope.viewer,
            relayUrl: legacyRelayUrl(scope.communityOrigin),
            notify: (text) => notify(text, scope),
          }
        : undefined,
    );
  };
  const stop = relay.subscribe(update);
  update();
  return () => {
    stop();
    bindTeamRelay(undefined);
  };
}

function useBinding() {
  return useSyncExternalStore(subscribeTeamRelay, teamRelay, () => undefined);
}

/** Reminders, the weekly digest and Google sync run while Buzz is open. */
function Background() {
  const binding = useBinding();
  if (!binding) return null;
  return (
    <Workers
      key={`${binding.viewer}:${binding.relayUrl}`}
      pubkey={binding.viewer}
      relayUrl={binding.relayUrl}
    />
  );
}
function Workers({ pubkey, relayUrl }: { pubkey: string; relayUrl: string }) {
  useTeamCalendarReminders(pubkey, relayUrl);
  useWeeklyDigest(pubkey, relayUrl);
  useGoogleCalendarSync(pubkey, relayUrl);
  return null;
}

function CalendarPage() {
  const binding = useBinding();
  if (!binding)
    return (
      <div className="p-6 text-sm text-muted" data-no-translate="">
        커뮤니티를 고르면 팀 캘린더가 보입니다.
      </div>
    );
  return (
    <div className="h-full overflow-y-auto p-5" data-no-translate="">
      <InlineDialog value={true}>
        <TeamCalendarDialog
          key={`${binding.viewer}:${binding.relayUrl}`}
          open
          onOpenChange={() => {}}
          pubkey={binding.viewer}
          relayUrl={binding.relayUrl}
        />
      </InlineDialog>
    </div>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  const alerts = ctx.notifications.register({
    id: "team-calendar",
    label: "Calendar reminders",
  });
  ctx.effect(() =>
    follow(ctx.relay, ({ title, body }, scope) => {
      void alerts
        .submit({
          sourceKey: `${title}:${body}:${Math.floor(Date.now() / 60_000)}`,
          target: {
            version: 1,
            kind: "page",
            pluginId: "buzz.team.calendar",
            pageId: "calendar",
            scope,
          },
          title,
          body,
        })
        .catch(() => {});
    }),
  );
  ctx.pages.register({
    id: "calendar",
    title: "Calendar",
    layout: "workspace",
    primary: true,
    placement: "topbar",
    badge: Background,
    component: CalendarPage,
  });
  ctx.conversation.registerMessageAction({
    id: "add-to-calendar",
    title: "Add to calendar",
    icon: () => <CalendarIcon size={16} aria-hidden="true" />,
    matches: () => !!teamRelay(),
    component: AddToCalendar,
  });
};

function AddToCalendar({
  message,
  close,
}: {
  message: { id: string; channelId: string; content: string };
  close(): void;
}) {
  const binding = useBinding();
  const [request] = useState(() => ({
    eventId: message.id,
    channelId: message.channelId,
    text: message.content,
  }));
  useEffect(() => {
    if (!binding) close();
  }, [binding, close]);
  if (!binding) return null;
  return (
    <div data-no-translate="">
      <AddFromMessageDialog
        onClose={close}
        pubkey={binding.viewer}
        relayUrl={binding.relayUrl}
        request={request}
      />
    </div>
  );
}
