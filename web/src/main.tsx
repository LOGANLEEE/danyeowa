import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { applyTheme, getStoredTheme } from "./theme";
import "./styles.css";

applyTheme(getStoredTheme());

// Registered unconditionally (guarded only by browser support) rather than gated to
// import.meta.env.PROD: e2e serves a production build too (see
// e2e/playwright.config.ts's webServer), so a PROD-only gate wouldn't skip it there
// anyway. sw.js is push-only — it has no fetch handler and caches nothing — so it
// cannot intercept or stale-serve any request the e2e suite's reloads depend on.
// Failures (unsupported browser, registration error) are ignored: push is an opt-in
// enhancement, never a requirement for the app to function.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
