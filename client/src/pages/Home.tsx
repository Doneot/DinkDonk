import { Link } from "react-router-dom";

// Real Twitch avatars, resolved once and hardcoded rather than fetched at
// runtime - this page is public/unauthenticated, so it can't rely on the
// app's own (session-gated) streamer endpoints, and a third-party avatar
// proxy is an availability risk not worth taking for six static images.
// Deliberately doesn't claim any of them are live right now (see the
// "is-tracked" tally comment in index.css): that would be a fabricated,
// occasionally false claim about a real, identifiable person.
const FEATURED_STREAMERS: { name: string; avatar: string }[] = [
  {
    name: "kamet0",
    avatar:
      "https://static-cdn.jtvnw.net/jtv_user_pictures/dbca03f2-578c-454f-8fa8-a76b089164e4-profile_image-300x300.png",
  },
  {
    name: "Squeezie",
    avatar:
      "https://static-cdn.jtvnw.net/jtv_user_pictures/1939615e-a34d-4fab-a035-8c3d8ffae278-profile_image-300x300.png",
  },
  {
    name: "xQc",
    avatar:
      "https://static-cdn.jtvnw.net/jtv_user_pictures/xqc-profile_image-9298dca608632101-300x300.jpeg",
  },
  {
    name: "Pokimane",
    avatar:
      "https://static-cdn.jtvnw.net/jtv_user_pictures/912232e8-9e53-4fb7-aac4-14aed07869ca-profile_image-300x300.png",
  },
  {
    name: "Ninja",
    avatar:
      "https://static-cdn.jtvnw.net/jtv_user_pictures/90d40495-f467-4911-9035-72d8d10a49c5-profile_image-300x300.png",
  },
  {
    name: "Gotaga",
    avatar:
      "https://static-cdn.jtvnw.net/jtv_user_pictures/69e324f6-fc7d-4131-89ed-227a955637cf-profile_image-300x300.png",
  },
];

const Home = () => {
  return (
    <div className="flex flex-col min-h-[calc(100vh+100px)] bg-bg text-ink px-6 sm:px-10 lg:px-16">
      <div className="flex flex-col justify-center flex-1 max-w-2xl py-16">
        <div className="flex items-center gap-2 mb-6 font-display uppercase tracking-wide text-sm text-ink-dim [font-stretch:condensed]">
          <span className="tally is-on" aria-hidden="true" />
          DinkDonk
        </div>

        <ul className="flex flex-wrap gap-2 mb-8">
          {FEATURED_STREAMERS.map((streamer) => (
            <li
              key={streamer.name}
              className="flex items-center gap-2 bg-tile border border-seam-soft rounded-full pl-1.5 pr-3 py-1.5 font-mono text-xs text-ink-dim"
            >
              <img
                src={streamer.avatar}
                alt=""
                loading="lazy"
                className="w-5 h-5 rounded-full flex-none"
              />
              <span className="tally is-tracked" aria-hidden="true" />
              {streamer.name}
            </li>
          ))}
        </ul>

        <h1 className="font-display uppercase [font-stretch:condensed] text-4xl md:text-6xl font-bold mb-6 [text-wrap:balance] leading-[1.02]">
          Know the second
          <br />
          they go <span className="text-accent">live.</span>
        </h1>
        <p className="text-lg md:text-xl max-w-xl mb-8 text-ink-dim">
          DinkDonk watches Twitch and pings you the moment your streamers go
          live — on Discord, or right here in your browser.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/login"
            className="bg-accent text-bg font-semibold px-6 py-3 rounded-md shadow-md hover:bg-accent-2 transition"
          >
            Start Now / Log In
          </Link>
          <Link
            to="/how-it-works"
            className="border border-seam text-ink-dim font-semibold px-6 py-3 rounded-md hover:border-accent hover:text-ink transition"
          >
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
