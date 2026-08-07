import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Top-level render-error catch-all. Wraps <App/> in main.tsx so an unexpected throw anywhere
 * in the tree (e.g. a future bad assumption on a malformed URL, a bad fetch payload shape,
 * etc.) shows a friendly reload card instead of a white screen — this matters especially for
 * the unauthenticated /share/:token route, where a family member has no other way to recover
 * (no login, no tabs, nothing else on the page to click). */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ground px-4 text-center text-ink">
          <p className="text-lg font-semibold">Something went wrong</p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="min-h-11 rounded bg-accent px-4 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
