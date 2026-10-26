import { useSyncExternalStore } from "react";
import { Button } from "../../shared/design-system/ui/Button";
import { InlineHeader } from "../../shared/design-system/ui/Header";
import { PreferenceRow } from "../../shared/design-system/ui/PreferenceRow";
import { Select } from "../../shared/design-system/ui/Select";
import { SettingsGroup } from "../../shared/design-system/ui/SettingsGroup";
import { channelAlertLevels } from "./channel-levels";

/** Settings → Notifications: default channel level, and reset all channels. */
export function ChannelAlertSettings() {
  const state = useSyncExternalStore(
    channelAlertLevels.subscribe,
    channelAlertLevels.snapshot,
  );
  const custom = Object.keys(state.overrides).length;
  return (
    <section aria-labelledby="team-channel-alerts-title">
      <InlineHeader
        id="team-channel-alerts-title"
        title="Channel notifications"
      />
      <SettingsGroup>
        <PreferenceRow
          id="team-channel-alert-default"
          title="Default for channels"
          subtitle="Each channel can change this from its menu in the sidebar."
          trailing={
            <Select
              variant="compact"
              label="Default for channels"
              value={state.defaultLevel}
              groups={[
                {
                  label: "Default for channels",
                  options: [
                    { value: "all", label: "All messages" },
                    { value: "mentions", label: "Only @mentions" },
                  ],
                },
              ]}
              onValueChange={(value) => {
                if (value === "all" || value === "mentions")
                  channelAlertLevels.setDefault(value);
              }}
            />
          }
        />
        <PreferenceRow
          title="Channels with their own setting"
          subtitle={
            custom
              ? `${custom} channel(s)`
              : "None. Every channel follows the default."
          }
          trailing={
            <Button
              type="button"
              size="sm"
              disabled={!custom}
              onClick={() => channelAlertLevels.resetChannels()}
            >
              Apply default to all channels
            </Button>
          }
        />
      </SettingsGroup>
    </section>
  );
}
