// Captures the `beforeinstallprompt` event (Chrome/Android's install affordance) at module
// scope, not inside a component. The event fires once, early in the page lifecycle, and only
// if a listener is already attached when it does — if SettingsView (which isn't mounted by
// default; see App.tsx's tab switch) added its own listener on mount, a prompt firing before
// the user ever opens Settings would be lost permanently for that page load.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    for (const listener of listeners) listener();
  });
}

/** True once the browser has fired `beforeinstallprompt` and it hasn't been consumed yet. */
export function isInstallPromptAvailable(): boolean {
  return deferredPrompt !== null;
}

/** Subscribes to `beforeinstallprompt` availability changes. Returns an unsubscribe function. */
export function onInstallPromptAvailable(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the captured install prompt. Resolves to whether the user accepted. The prompt can
 * only be shown once — after this call, `isInstallPromptAvailable()` returns false again. */
export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === "accepted";
}

/** True when the app is already running as an installed PWA (standalone display mode). iOS
 * Safari doesn't support the standard media query and instead exposes `navigator.standalone`. */
export function isRunningStandalone(): boolean {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** True on iOS/iPadOS Safari, which never fires `beforeinstallprompt` — the only route to
 * installing there is the manual Share -> Add to Home Screen flow, so Settings shows a hint
 * instead of an "Install app" button. iPadOS 13+ reports a Mac-like UA but is distinguishable
 * by touch support, which real Macs lack. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
}
