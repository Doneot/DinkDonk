interface CardErrorFallbackProps {
  onRetry: () => void;
  className?: string;
}

// The inline fallback ErrorBoundary instances scoped to one dashboard
// widget render instead of taking down the whole page - see
// ErrorBoundary.tsx's `fallback` prop and Dashboard.tsx for how it's used.
const CardErrorFallback = ({ onRetry, className = "" }: CardErrorFallbackProps) => (
  <div className={`p-4 sm:p-5 flex flex-col items-start gap-2 ${className}`}>
    <p className="font-mono text-[0.7rem] text-ink-faint">
      This section couldn't load.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="font-mono text-[0.68rem] uppercase tracking-wider underline decoration-dotted underline-offset-2 text-accent hover:text-accent-2 transition cursor-pointer"
    >
      Try again
    </button>
  </div>
);

export default CardErrorFallback;
