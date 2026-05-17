function buildStreamerLivePayload({ streamer, message }) {
  const title = `${streamer.display_name} is live!`;
  const body = (message || '%s is live!').replace(/%s/g, streamer.display_name);
  const url = `https://www.twitch.tv/${streamer.login}`;

  return {
    type: 'stream.online',
    title,
    body,
    url,
    streamer: {
      id: streamer.id,
      login: streamer.login,
      displayName: streamer.display_name,
      avatar: streamer.profile_image_url,
    },
  };
}

module.exports = { buildStreamerLivePayload };
