import * as React from "react";
import { toast } from "sonner";

import { useChannelMembersQuery } from "../compat/hooks";
import {
  type AddFromMessageRequest,
  entryIdForMessage,
} from "../lib/addFromMessage";
import { parseSchedule, titleFromMessage } from "../lib/parseSchedule";
import { todayKey } from "../lib/teamCalendar";
import { postChannelNotice } from "../lib/channelNotice";
import { channelNoticeText } from "../lib/teamReminders";
import { saveEntryToDoc } from "../lib/useTeamCalendar";
import { useNoticeChannels } from "../lib/useNoticeChannels";
import { useTeamMembers } from "../lib/useTeamMembers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../compat/ui";
import {
  type Draft,
  EntryForm,
  draftError,
  emptyDraft,
  inputOfDraft,
} from "./EntryForm";

/**
 * Confirms a calendar entry made from a chat message (team patch). The date
 * and time are read from the message text as a first guess, and the channel's
 * members are the attendees until the person changes them. The entry id comes
 * from the message, so adding the same message again edits that entry.
 */
export function AddFromMessageDialog({
  pubkey,
  relayUrl,
  request,
  onClose,
}: {
  pubkey: string;
  relayUrl: string;
  request: AddFromMessageRequest;
  onClose: () => void;
}) {
  const channelMembers = useChannelMembersQuery(request.channelId).data;
  const channelPeople = React.useMemo(
    () =>
      (channelMembers ?? [])
        .filter((member) => !member.isAgent)
        .map((member) => member.pubkey.toLowerCase()),
    [channelMembers],
  );
  const { members } = useTeamMembers(channelPeople);
  const channels = useNoticeChannels();
  const parsed = React.useMemo(
    () => parseSchedule(request.text),
    [request.text],
  );
  const [draft, setDraft] = React.useState<Draft>(() => {
    return {
      ...emptyDraft(parsed?.date ?? todayKey()),
      id: entryIdForMessage(request.eventId),
      sourceEventId: request.eventId,
      title: titleFromMessage(request.text),
      time: parsed?.time ?? "",
      endTime: parsed?.endTime ?? "",
    };
  });
  const [saving, setSaving] = React.useState(false);
  // The channel's members arrive after the first render; they are the default
  // attendees until the person touches the list.
  const touchedRef = React.useRef(false);
  React.useEffect(() => {
    if (touchedRef.current || channelPeople.length === 0) return;
    setDraft((current) => ({
      ...current,
      everyone: false,
      attendees: channelPeople,
    }));
  }, [channelPeople]);

  const submit = async () => {
    if (saving || draft.title.trim().length === 0 || draftError(draft)) return;
    setSaving(true);
    try {
      const input = inputOfDraft(draft);
      await saveEntryToDoc({ pubkey, relayUrl, entry: input });
      if (draft.notifyNow && input.notify?.channelId) {
        void postChannelNotice(
          relayUrl,
          input.notify.channelId,
          channelNoticeText(input, "새 일정"),
        ).catch(() => toast.error("채널에 일정을 알리지 못했습니다."));
      }
      toast.success("캘린더에 추가했습니다.");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "일정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent
        className="max-w-md"
        data-no-translate=""
        data-testid="team-calendar-from-message"
      >
        <DialogHeader>
          <DialogTitle>캘린더에 추가</DialogTitle>
          <DialogDescription>
            {parsed
              ? "메시지에서 날짜와 시간을 읽어 왔습니다. 맞는지 확인하고 저장해 주세요."
              : "메시지에서 날짜를 찾지 못했습니다. 직접 골라 주세요."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm
          channels={channels}
          draft={draft}
          members={members}
          onCancel={onClose}
          onChange={(next) => {
            if (
              next.everyone !== draft.everyone ||
              next.attendees !== draft.attendees
            )
              touchedRef.current = true;
            setDraft(next);
          }}
          onSubmit={() => void submit()}
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}
