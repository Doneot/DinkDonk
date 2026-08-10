import api from "../../shared/api/client";
import type { StreamerSummary, TrackedStreamerSummary } from "../../shared/types/api";

export function searchStreamers(
  query: string,
  signal?: AbortSignal,
): Promise<StreamerSummary[]> {
  return api
    .get<StreamerSummary[]>("/streamers/search", { params: { query }, signal })
    .then((res) => res.data);
}

export function fetchStreamerProfiles(
  ids: string[],
): Promise<TrackedStreamerSummary[]> {
  return api
    .post<TrackedStreamerSummary[]>("/streamers/info", { ids })
    .then((res) => res.data);
}

export function subscribeToStreamer(streamerId: string): Promise<void> {
  return api.post("/subscriptions", { streamerId }).then(() => undefined);
}

export function unsubscribeFromStreamer(streamerId: string): Promise<void> {
  return api
    .delete("/subscriptions", { params: { streamerId } })
    .then(() => undefined);
}

export function updateNotificationMessage(
  id: string,
  message: string,
): Promise<void> {
  return api
    .post("/subscriptions/set-message", { id, message })
    .then(() => undefined);
}
