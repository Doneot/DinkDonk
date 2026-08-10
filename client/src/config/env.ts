export const env = {
  isProduction: import.meta.env.PROD,
  socketUrl: import.meta.env.VITE_SOCKET_URL || window.location.origin,
};
