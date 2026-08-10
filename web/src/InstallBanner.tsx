import { useEffect, useState } from "react";
import {
  isInstallPromptAvailable,
  isIos,
  isRunningStandalone,
  onInstallPromptAvailable,
  showInstallPrompt,
} from "./lib/install";

const DISMISS_KEY = "roster-install-dismissed";

function storedDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Nudges installable users to run the app as a PWA. There is no API for "is this site already
 * installed" - but Chromium suppresses `beforeinstallprompt` once it is, so a captured prompt
 * already means not-installed. iOS Safari never fires it and only reports standalone from
 * INSIDE the installed app, so there the banner is a dismissible hint, not a detection.
 */
export default function InstallBanner() {
  const [available, setAvailable] = useState(isInstallPromptAvailable);
  const [dismissed, setDismissed] = useState(storedDismissed);

  useEffect(() => onInstallPromptAvailable(() => setAvailable(true)), []);

  if (dismissed || isRunningStandalone()) return null;

  const ios = isIos();
  if (!available && !ios) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode / storage disabled: the banner still hides for this page load.
    }
  }

  async function install() {
    const accepted = await showInstallPrompt();
    // The prompt is single-use either way; accepting also means the banner has done its job.
    setAvailable(false);
    if (accepted) dismiss();
  }

  return (
    <div
      data-testid="install-banner"
      className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-accent bg-accent-soft p-3"
    >
      <div className="flex flex-1 flex-col gap-0.5 text-left">
        <p className="text-sm font-medium text-ink">Add roaster·me to your home screen</p>
        <p className="text-xs text-ink-muted">
          {available
            ? "Full screen, opens instantly, report-time alerts."
            : "Share → Add to Home Screen. Full screen, opens instantly, report-time alerts."}
        </p>
      </div>

      {available && (
        <button
          type="button"
          data-testid="install-banner-install"
          onClick={install}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          Install
        </button>
      )}

      <button
        type="button"
        data-testid="install-banner-dismiss"
        aria-label="Dismiss install prompt"
        onClick={dismiss}
        className="min-h-[44px] min-w-[44px] rounded text-ink-muted transition-colors duration-[120ms] hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
