import * as React from "react";

import { useChannelsQuery } from "../compat/hooks";

/** The channels of this community a calendar notice can be posted to. */
export function useNoticeChannels(): Array<{ id: string; name: string }> {
  const channels = useChannelsQuery().data;
  return React.useMemo(
    () =>
      (channels ?? [])
        .filter(
          (channel) => channel.channelType === "stream" && !channel.archivedAt,
        )
        .map((channel) => ({ id: channel.id, name: channel.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [channels],
  );
}
