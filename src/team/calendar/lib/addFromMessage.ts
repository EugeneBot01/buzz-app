/**
 * Bridge from a chat message's menu to the calendar (team patch). The menu
 * lives deep in the message list and the calendar under the sidebar, so the
 * request travels as a window event instead of through shared React state.
 */
export type AddFromMessageRequest = {
  eventId: string;
  channelId: string | null;
  text: string;
};

const EVENT_NAME = "buzz-team-calendar:add-from-message";

export function requestAddFromMessage(request: AddFromMessageRequest): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: request }));
}

/** Calls `listener` for every request; returns the function that stops it. */
export function onAddFromMessage(
  listener: (request: AddFromMessageRequest) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<AddFromMessageRequest>).detail);
  window.addEventListener(EVENT_NAME, handle);
  return () => window.removeEventListener(EVENT_NAME, handle);
}

/** The calendar entry id for a message, so adding it twice edits one entry. */
export const entryIdForMessage = (eventId: string) =>
  `msg-${eventId.slice(0, 48)}`;
