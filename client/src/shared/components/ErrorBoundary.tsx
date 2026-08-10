import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "../api/reportClientError";

interface ErrorBoundaryProps {
  children: ReactNode;

  /**
   * A short label identifying this boundary, sent as the caught error's
   * `context` (see reportClientError) so a log line says which boundary
   * caught it instead of just "something threw somewhere." Defaults to
   * "root" - the app-wide boundary App.tsx wraps everything in.
   */
  label?: string;

  /**
   * Rendered in place of `children` once a descendant throws, given a
   * `retry` callback that clears the error and re-renders `children` from
   * scratch. Defaults to a full-page "Something went wrong" screen whose
   * only recovery is a hard reload - pass a smaller inline fallback to
   * scope a boundary to one widget instead of the whole page (see
   * Dashboard.tsx, which gives each card its own boundary so one crashing
   * card doesn't blank the rest of the dashboard).
   */
  fallback?: (retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in component tree", error, info);

    reportClientError(error, this.props.label ?? "root", {
      componentStack: info.componentStack ?? undefined,
    });
  }

  handleReload = () => {
    window.location.assign("/");
  };

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.handleRetry);
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-bg text-ink">
          <span className="tally is-live mb-4" aria-hidden="true" />
          <h1 className="font-display uppercase [font-stretch:condensed] text-2xl font-bold mb-2">
            Something went wrong
          </h1>
          <p className="text-ink-dim mb-6 max-w-md">
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="bg-accent text-bg font-semibold px-6 py-3 rounded-md shadow-md hover:bg-accent-2 transition cursor-pointer"
          >
            Reload DinkDonk
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
