import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 bg-bg text-ink">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-faint mb-2">
        404 — no signal
      </p>
      <h1 className="font-display uppercase [font-stretch:condensed] text-4xl font-bold mb-3">
        Page not found
      </h1>
      <p className="text-ink-dim mb-6 max-w-md">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link
        to="/"
        className="bg-accent text-bg font-semibold px-6 py-3 rounded-md shadow-md hover:bg-accent-2 transition"
      >
        Back to home
      </Link>
    </div>
  );
};

export default NotFound;
