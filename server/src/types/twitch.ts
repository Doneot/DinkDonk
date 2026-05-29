export interface TwitchStreamer {
  id: string;

  login: string;

  display_name: string;

  thumbnail_url?: string;

  profile_image_url?: string;
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
