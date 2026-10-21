import type { UsageEvent, UsageEventName, UsageEventProps } from "@danyeowa/shared";

/** First-party usage events for the owner's /usage page. Fire-and-forget by contract: nothing
 * here may throw into, or wait on, the UI that called it. */

const FLUSH_AFTER_MS = 2000;
// The server's batch limit (UsageBatchSchema).
const MAX_BATCH = 20;

const sessionId = crypto.randomUUID();
let enabled = false;
let queue: UsageEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let lastAt = 0;

/** On once /api/me says someone is signed in; a signed-out page records nothing. */
export function setTrackingEnabled(on: boolean): void {
  enabled = on;
  if (!on) queue = [];
}

export function track<N extends UsageEventName>(name: N, props: UsageEventProps<N>): void {
  if (!enabled) return;
  // Strictly increasing, so the server can read a form's steps back in the order they happened.
  lastAt = Math.max(Date.now(), lastAt + 1);
  queue.push({ name, props, at: lastAt } as UsageEvent);
  timer ??= setTimeout(flush, FLUSH_AFTER_MS);
}

function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const pending = queue;
  queue = [];
  for (let i = 0; i < pending.length; i += MAX_BATCH) {
    try {
      // keepalive lets the request outlive the page when this runs on the way out.
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, events: pending.slice(i, i + MAX_BATCH) }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Dropped, on purpose: a lost event is cheaper than a broken screen.
    }
  }
}

// On window, not document: visibilitychange fires at document and bubbles here, so every
// document listener (the add form's form_left) has queued its event before this flushes.
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
