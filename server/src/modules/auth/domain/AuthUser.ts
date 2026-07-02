export type AuthUser = {
  id: string;
  username: string;
  discriminator: string;
  avatar: string;
  accessToken: string;
  refreshToken: string;
  fetchTime: number;
};
