export interface TwitchStreamer {
  id: string;

  login: string;

  display_name: string;

  profile_image_url?: string;
}

// Helix's "Get Streams" response, trimmed to the two fields this app
// actually uses - only entries for currently-live channels are present at
// all (unlike EventSub's stream.online, this is ground truth for "is this
// live right now", not a delta since the last event).
export interface TwitchLiveStream {
  user_id: string;

  started_at: string;
}

export interface TwitchEventSubSubscription {
  id: string;

  type: string;

  status: string;

  transport: {
    method: string;

    callback: string;
  };

  condition: {
    broadcaster_user_id: string;
  };
}

export interface TwitchEventSubStreamOnlineEvent {
  broadcaster_user_id: string;

  broadcaster_user_login: string;

  broadcaster_user_name: string;

  type: string;

  started_at: string;
}

// Twitch's stream.offline payload carries no started_at (or any other
// stream-session data) - the broadcast has already ended by the time this
// fires.
export interface TwitchEventSubStreamOfflineEvent {
  broadcaster_user_id: string;

  broadcaster_user_login: string;

  broadcaster_user_name: string;
}
