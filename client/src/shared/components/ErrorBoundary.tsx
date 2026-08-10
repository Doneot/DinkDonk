import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
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
  }

  handleReload = () => {
    window.location.assign("/");
  };

  render() {
    if (this.state.hasError) {
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
