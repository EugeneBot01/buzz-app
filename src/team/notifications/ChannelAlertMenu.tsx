import { useSyncExternalStore } from "react";
import { BellIcon } from "../../shared/design-system/icons";
import {
  MenuGroup,
  MenuGroupLabel,
  MenuIcon,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSubmenu,
  MenuSubmenuPopup,
  MenuSubmenuTrigger,
  MenuTrailing,
} from "../../shared/design-system/ui/Menu";
import { type ChannelAlertLevel, channelAlertLevels } from "./channel-levels";

const LABELS: Record<ChannelAlertLevel, string> = {
  all: "All messages",
  mentions: "Only @mentions",
};

/** Sidebar row menu: this channel's alert level (Discord-style). */
export function ChannelAlertMenu({ channelId }: { channelId: string }) {
  const state = useSyncExternalStore(
    channelAlertLevels.subscribe,
    channelAlertLevels.snapshot,
  );
  const own = state.overrides[channelId];
  const value = own ?? "default";
  return (
    <MenuSubmenu>
      <MenuSubmenuTrigger>
        <MenuIcon>
          <BellIcon size={14} />
        </MenuIcon>
        Notifications
        <MenuTrailing>
          {(own ?? state.defaultLevel) === "all" ? "All" : "@"}
        </MenuTrailing>
      </MenuSubmenuTrigger>
      <MenuSubmenuPopup aria-label="Channel notifications" finalFocus={false}>
        <MenuGroup>
          <MenuGroupLabel>Notify me about</MenuGroupLabel>
        </MenuGroup>
        <MenuRadioGroup
          value={value}
          onValueChange={(next) =>
            channelAlertLevels.setChannel(
              channelId,
              next === "all" || next === "mentions" ? next : undefined,
            )
          }
        >
          <MenuRadioItem value="default" closeOnClick={false}>
            Default ({LABELS[state.defaultLevel]})
          </MenuRadioItem>
          <MenuRadioItem value="all" closeOnClick={false}>
            {LABELS.all}
          </MenuRadioItem>
          <MenuRadioItem value="mentions" closeOnClick={false}>
            {LABELS.mentions}
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuSubmenuPopup>
    </MenuSubmenu>
  );
}
