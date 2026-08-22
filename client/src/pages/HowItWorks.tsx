import { Link } from "react-router-dom";

const STEPS = [
  {
    title: "Subscribe to a streamer",
    body: "Search Twitch streamers from your dashboard and subscribe to anyone you want to track. No limit beyond keeping the list useful.",
  },
  {
    title: "DinkDonk watches Twitch for you",
    body: "We register with Twitch's EventSub for each streamer you track, so we hear about a stream starting the instant Twitch does — no polling, no delay.",
  },
  {
    title: "You get notified",
    body: "A Discord DM, a browser push, or both — whichever channels you've turned on in your dashboard. Turn either off any time without losing your subscriptions.",
  },
];

const HowItWorks = () => {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 sm:py-20 text-ink">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-faint mb-3">
        How it works
      </p>
      <h1 className="font-display uppercase [font-stretch:condensed] text-3xl sm:text-4xl font-bold mb-4 [text-wrap:balance]">
        From Twitch going live to your phone buzzing.
      </h1>
      <p className="text-ink-dim max-w-xl mb-12">
        Three steps, no polling on your end, nothing to keep open in a tab.
      </p>

      <ol className="space-y-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4 sm:gap-6">
            <span className="font-mono text-sm text-accent flex-none w-6 pt-0.5">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="border-l border-seam-soft pl-4 sm:pl-6 pb-2">
              <h2 className="text-lg font-semibold text-ink mb-1">
                {step.title}
              </h2>
              <p className="text-ink-dim">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12">
        <Link
          to="/login"
          className="bg-accent text-bg font-semibold px-6 py-3 rounded-md shadow-md hover:bg-accent-2 transition inline-block"
        >
          Start Now / Log In
        </Link>
      </div>
    </div>
  );
};

export default HowItWorks;
