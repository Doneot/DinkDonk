import type { TwitchStreamer } from "../../domain/Twitch.js";

type TwitchStreamerRaw = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
  thumbnail_url?: string;
};

export function mapTwitchStreamer(raw: TwitchStreamerRaw): TwitchStreamer {
  return {
    id: raw.id,
    login: raw.login,
    display_name: raw.display_name,
    profile_image_url: raw.profile_image_url ?? raw.thumbnail_url ?? "",
  };
}
