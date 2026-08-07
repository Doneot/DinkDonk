/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_INVITE_URL?: string;
  readonly VITE_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
