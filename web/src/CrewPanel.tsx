import { useEffect, useState } from "react";
import type { CrewResponse } from "@roaster/shared";
import { acceptCrewInvite, getCrew, inviteCrew, revokeCrewInvite } from "./api";

const EMPTY: CrewResponse = { members: [], sent: [], received: [] };

/**
 * Crew sharing, on the Share tab beside family links — the same question ("who can see my
 * roster?") with a different answer, so it belongs on the same screen.
 *
 * A crew pairing is mutual and read-only: accepting means you can each open the other's
 * calendar, and neither of you can change what's on it. The badges above the calendar are
 * where you switch between them; this panel only sets the pairings up and tears them down.
 */
export default function CrewPanel() {
  const [crew, setCrew] = useState<CrewResponse | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    getCrew()
      .then(setCrew)
      .catch(() => setCrew(EMPTY));
  }, []);

  const reload = () => getCrew().then(setCrew).catch(() => {});

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await inviteCrew({ email: email.trim().toLowerCase() });
      setSentTo(created.email);
      setEmail("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the invite");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  if (crew === null) return null;

  return (
    <section data-testid="crew-panel" className="flex flex-col gap-3 rounded-lg border border-edge bg-card p-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Crew</h2>
        <p className="text-sm text-ink-muted">
          See each other's roster. Neither of you can change the other's.
        </p>
      </div>

      {/* Invites waiting on you come first: they are the only thing here that needs an answer. */}
      {crew.received.map((invite) => (
        <div
          key={invite.id}
          data-testid={`crew-invite-received-${invite.id}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-raised p-3"
        >
          <p className="text-sm text-ink">
            <span className="font-medium">{invite.fromName?.trim() || invite.fromEmail || "Someone"}</span>{" "}
            invited you to share rosters
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid={`crew-accept-${invite.id}`}
              disabled={busy}
              onClick={() => run(() => acceptCrewInvite(invite.id), "Couldn't accept the invite")}
              className="min-h-11 rounded bg-accent px-3 py-2 text-sm font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => revokeCrewInvite(invite.id), "Couldn't decline the invite")}
              className="min-h-11 rounded border border-edge px-3 py-2 text-sm text-ink transition-colors duration-[120ms] hover:border-ink-muted disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {crew.members.map((member) => (
        <div
          key={member.userId}
          data-testid={`crew-member-${member.userId}`}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-3 last:border-b-0 last:pb-0"
        >
          <span className="text-sm text-ink">{member.name?.trim() || member.email}</span>
          <button
            type="button"
            data-testid={`crew-remove-${member.inviteId}`}
            disabled={busy}
            onClick={() => run(() => revokeCrewInvite(member.inviteId), "Couldn't stop sharing")}
            className="min-h-11 rounded border border-edge px-3 py-2 text-sm text-ink-muted transition-colors duration-[120ms] hover:border-danger hover:text-danger disabled:opacity-50"
          >
            Stop sharing
          </button>
        </div>
      ))}

      {crew.sent.map((invite) => (
        <div
          key={invite.id}
          data-testid={`crew-invite-sent-${invite.id}`}
          className="flex flex-wrap items-center justify-between gap-2 text-sm"
        >
          <span className="text-ink-muted">
            {invite.email} — waiting for them to accept
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => revokeCrewInvite(invite.id), "Couldn't withdraw the invite")}
            className="min-h-11 rounded border border-edge px-3 py-2 text-ink-muted transition-colors duration-[120ms] hover:border-ink-muted disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>
      ))}

      <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm text-ink-muted">Invite by email</span>
          <input
            type="email"
            required
            data-testid="crew-invite-email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSentTo(null);
            }}
            placeholder="them@example.com"
            autoCapitalize="none"
            autoCorrect="off"
            // text-base, not text-sm: anything under 16px makes iOS zoom on focus.
            className="min-h-11 rounded border border-edge bg-ground px-3 py-2 text-base text-ink"
          />
        </label>
        <button
          type="submit"
          data-testid="crew-invite-send"
          disabled={busy || email.trim() === ""}
          className="min-h-11 rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          Invite
        </button>
      </form>

      {sentTo && (
        <p className="text-sm text-ink-muted">
          Invited {sentTo}. They accept it here on their own Share tab, signed in with that address.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
