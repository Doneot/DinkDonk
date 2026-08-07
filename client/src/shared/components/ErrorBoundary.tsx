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
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-gray-100">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-600 mb-6 max-w-md">
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="bg-indigo-600 text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:bg-indigo-500 transition cursor-pointer"
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
