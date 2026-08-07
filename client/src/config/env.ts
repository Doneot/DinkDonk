export const env = {
  isProduction: import.meta.env.PROD,
  socketUrl: import.meta.env.VITE_SOCKET_URL || window.location.origin,
  inviteUrl: import.meta.env.VITE_INVITE_URL,
};
