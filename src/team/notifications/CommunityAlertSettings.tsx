import { useSyncExternalStore } from "react";
import type { Communities } from "../../features/communities/service";
import { InlineHeader } from "../../shared/design-system/ui/Header";
import { SettingsGroup } from "../../shared/design-system/ui/SettingsGroup";
import { SwitchPreferenceRow } from "../../shared/design-system/ui/SwitchPreferenceRow";
import { communityAlerts } from "./community-alerts";

/** Settings → Notifications: which other communities alert in the background. */
export function CommunityAlertSettings() {
  const communities = communityAlerts.communities();
  return communities ? <List communities={communities} /> : null;
}

function List({ communities }: { communities: Communities }) {
  const client = useSyncExternalStore(
    communities.subscribe,
    communities.snapshot,
  );
  useSyncExternalStore(communityAlerts.subscribe, communityAlerts.snapshot);
  if (client.memberships.length < 2) return null;
  return (
    <section aria-labelledby="team-community-alerts-title">
      <InlineHeader
        id="team-community-alerts-title"
        title="다른 커뮤니티 알림"
        subtitle="끄면 바로 알림이 멈추고 뒤에서 하던 연결도 끊어 앱이 가벼워져요. 내 에이전트가 있는 커뮤니티는 연결을 유지해요. 지금 보고 있는 커뮤니티는 항상 알려요."
      />
      <SettingsGroup>
        {client.memberships.map((membership) => (
          <SwitchPreferenceRow
            key={membership.id}
            label={
              membership.localName ||
              membership.publishedName ||
              membership.name ||
              membership.id
            }
            checked={communityAlerts.isOn(membership.id)}
            onCheckedChange={(on) => communityAlerts.set(membership.id, on)}
          />
        ))}
      </SettingsGroup>
    </section>
  );
}
