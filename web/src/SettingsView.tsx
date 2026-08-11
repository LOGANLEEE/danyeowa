import { useEffect, useState } from "react";
import { getPushConfig, subscribePush, unsubscribePush, updateNotificationPrefs } from "./api";
import { getAirlinePrefix, setAirlinePrefix } from "./lib/airlinePrefix";
import {
  isInstallPromptAvailable,
  isIos,
  isRunningStandalone,
  onInstallPromptAvailable,
  showInstallPrompt,
} from "./lib/install";
import { urlBase64ToUint8Array } from "./lib/push";
import { getStoredTheme, setTheme } from "./theme";
import type { Theme } from "./theme";

type Props = {
  email: string;
  onSignOut: () => void;
};

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
  { value: 180, label: "3h" },
];

function pushSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export default function SettingsView({ email, onSignOut }: Props) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [airlinePrefix, setAirlinePrefixState] = useState<string>(getAirlinePrefix);

  const [supported] = useState(pushSupported);
  const [permission, setPermission] = useState<NotificationPermission | null>(() =>
    pushSupported() ? Notification.permission : null,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [leadMinutes, setLeadMinutes] = useState(120);
  const [arrivalEnabled, setArrivalEnabled] = useState(true);
  const [pushError, setPushError] = useState<string | null>(null);

  const [installAvailable, setInstallAvailable] = useState(isInstallPromptAvailable);
  const [standalone] = useState(isRunningStandalone);

  useEffect(() => {
    if (standalone) return;
    return onInstallPromptAvailable(() => setInstallAvailable(true));
  }, [standalone]);

  async function handleInstall() {
    const accepted = await showInstallPrompt();
    if (accepted) setInstallAvailable(false);
  }

  useEffect(() => {
    if (!supported) return;
    getPushConfig()
      .then((config) => {
        setSubscribed(config.subscribed);
        setLeadMinutes(config.leadMinutes);
        setArrivalEnabled(config.arrivalEnabled);
      })
      .catch(() => {
        // Leave defaults in place — the toggle simply starts off.
      });
  }, [supported]);

  function selectTheme(next: Theme) {
    setThemeState(next);
    setTheme(next);
  }

  function changeAirlinePrefix(next: string) {
    const upper = next.toUpperCase();
    setAirlinePrefixState(upper);
    setAirlinePrefix(upper);
  }

  async function handleToggleOn() {
    setPushError(null);
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return;

    try {
      const config = await getPushConfig();
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setPushError("Couldn't enable notifications — try again");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      const json = subscription.toJSON();
      await subscribePush({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
      });
      setSubscribed(true);
    } catch {
      setPushError("Couldn't enable notifications — try again");
    }
  }

  async function handleToggleOff() {
    setPushError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setPushError("Couldn't disable notifications — try again");
    }
  }

  async function handleLeadChange(next: number) {
    setLeadMinutes(next);
    try {
      await updateNotificationPrefs({ enabled: true, leadMinutes: next });
    } catch {
      setPushError("Couldn't save your lead time — try again");
    }
  }

  async function handleArrivalToggle(next: boolean) {
    setArrivalEnabled(next);
    try {
      await updateNotificationPrefs({ enabled: true, leadMinutes, arrivalEnabled: next });
    } catch {
      // Put the switch back rather than leaving it showing a setting the server never took.
      setArrivalEnabled(!next);
      setPushError("Couldn't save arrival alerts — try again");
    }
  }

  return (
    <div className="entrance flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-lg border border-edge bg-card p-4">
        <p className="text-xs uppercase text-ink-muted">Signed in as</p>
        <p className="text-ink">{email}</p>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-edge bg-card p-4">
        <legend className="px-1 text-xs uppercase text-ink-muted">Theme</legend>
        {THEME_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-ink">
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => selectTheme(option.value)}
              className="accent-accent"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-3 rounded-lg border border-edge bg-card p-4">
        <p className="px-1 text-xs uppercase text-ink-muted">Notifications</p>

        {!supported ? (
          <p className="text-sm text-ink-muted" data-testid="push-unsupported">
            Install to Home Screen to enable notifications
          </p>
        ) : permission === "denied" ? (
          <p className="text-sm text-ink-muted">
            Notifications are blocked for this site — enable them in your browser settings to get
            report-time reminders.
          </p>
        ) : (
          <>
            <label className="flex items-center justify-between gap-2 text-ink">
              <span>Report-time reminders</span>
              <input
                type="checkbox"
                data-testid="push-toggle"
                checked={subscribed}
                onChange={(e) => (e.target.checked ? handleToggleOn() : handleToggleOff())}
                className="accent-accent"
              />
            </label>

            {subscribed && (
              <label className="flex items-center justify-between gap-2 text-ink">
                <span>Remind me</span>
                <select
                  data-testid="push-lead"
                  value={leadMinutes}
                  onChange={(e) => handleLeadChange(Number(e.target.value))}
                  className="rounded border border-edge bg-ground px-2 py-1"
                >
                  {LEAD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {subscribed && (
              <label className="flex items-center justify-between gap-2 text-ink">
                <span>
                  Arrival alerts
                  <span className="block text-sm text-ink-muted">
                    1 hour, 30 minutes, and on landing
                  </span>
                </span>
                <input
                  type="checkbox"
                  data-testid="arrival-alerts-toggle"
                  checked={arrivalEnabled}
                  onChange={(e) => handleArrivalToggle(e.target.checked)}
                  className="h-6 w-6 accent-accent"
                />
              </label>
            )}

            {pushError && <p className="text-sm text-danger">{pushError}</p>}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-edge bg-card p-4">
        <p className="px-1 text-xs uppercase text-ink-muted">App</p>

        <label className="flex items-center justify-between gap-2 text-ink">
          <span>Airline</span>
          <input
            type="text"
            maxLength={2}
            data-testid="airline-prefix-input"
            value={airlinePrefix}
            onChange={(e) => changeAirlinePrefix(e.target.value)}
            className="num w-16 rounded border border-edge bg-ground px-2 py-1 uppercase"
          />
        </label>
        <p className="text-sm text-ink-muted">
          Flight numbers are entered as {airlinePrefix}···
        </p>

        {standalone ? (
          <p className="text-sm text-ink-muted" data-testid="installed-badge">
            Installed ✓
          </p>
        ) : installAvailable ? (
          <button
            type="button"
            data-testid="install-button"
            onClick={handleInstall}
            className="self-start rounded border border-accent px-3 py-2 text-accent transition-colors duration-[120ms] hover:bg-accent/10"
          >
            Install app
          </button>
        ) : isIos() ? (
          <p className="text-sm text-ink-muted" data-testid="install-hint-ios">
            Install: Share → Add to Home Screen
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-edge bg-card p-4">
        <p className="text-xs uppercase text-ink-muted">Home base</p>
        <p className="text-ink">DXB · default</p>
        <p className="text-sm text-ink-muted">customizable later</p>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="self-start rounded border border-danger px-3 py-2 text-danger transition-colors duration-[120ms] hover:bg-danger/10"
      >
        Sign out
      </button>
    </div>
  );
}
