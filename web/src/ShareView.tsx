import { useEffect, useState } from "react";
import type { ShareLink } from "@roaster/shared";
import { createShareLink, getShareLinks, revokeShareLink } from "./api";
import CrewPanel from "./CrewPanel";

function linkUrl(token: string): string {
  return `${location.origin}/share/${token}`;
}

/** Family-sharing tab: crew creates/copies/revokes read-only links family opens without
 * an account or the app. */
export default function ShareView() {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getShareLinks().then(setLinks);
  }, []);

  async function handleCreate() {
    setError(null);
    try {
      const link = await createShareLink(label.trim() || undefined);
      setLinks((prev) => [link, ...(prev ?? [])]);
      setCreating(false);
      setLabel("");
    } catch {
      setError("Couldn't create the link — try again");
    }
  }

  async function handleCopy(link: ShareLink) {
    await navigator.clipboard.writeText(linkUrl(link.token));
    setCopiedId(link.id);
    setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
  }

  async function handleShare(link: ShareLink) {
    const url = linkUrl(link.token);
    if (navigator.share) {
      await navigator.share({ url });
    } else {
      await handleCopy(link);
    }
  }

  async function handleRevoke(link: ShareLink) {
    setError(null);
    try {
      await revokeShareLink(link.id);
      setLinks(
        (prev) => prev?.map((l) => (l.id === link.id ? { ...l, revoked: true } : l)) ?? null,
      );
      setConfirmingRevokeId(null);
    } catch {
      setError("Couldn't revoke the link — try again");
    }
  }

  if (links === null) {
    return <p className="text-ink-muted">loading…</p>;
  }

  return (
    <div className="entrance flex w-full max-w-xl flex-col gap-4">
      {/* Crew first: family links are the older, better-known half of this tab, and pushing
          them down a screen is cheaper than burying the half nobody has seen yet. */}
      <CrewPanel />

      {links.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-lg font-semibold text-ink">Invite family</p>
          <p className="text-sm text-ink-muted">Family opens the link — no app, no account.</p>
          <button
            type="button"
            data-testid="create-link"
            onClick={() => setCreating(true)}
            className="min-h-11 rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
          >
            Create share link
          </button>
        </div>
      ) : (
        <>
          {creating && (
            <div className="flex flex-col gap-2 rounded-lg border border-edge bg-card p-4">
              <label htmlFor="share-label" className="text-xs uppercase text-ink-muted">
                Label (optional)
              </label>
              <input
                id="share-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="For Mom"
                className="min-h-11 rounded border border-edge bg-ground px-3 py-2 text-ink"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="confirm-create-link"
                  onClick={handleCreate}
                  className="min-h-11 rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setLabel("");
                  }}
                  className="min-h-11 rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {links.length > 0 && (
            <div className="flex flex-col gap-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  data-testid="link-row"
                  className="flex flex-col gap-2 rounded-lg border border-edge bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={link.revoked ? "text-ink-muted line-through" : "text-ink"}>
                      {link.label || "Share link"}
                    </span>
                    {link.revoked && (
                      <span className="rounded-full bg-raised px-2 py-0.5 text-xs text-ink-muted">
                        revoked
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-ink-muted">
                    {new Date(link.createdAt).toLocaleDateString()}
                  </span>

                  {!link.revoked &&
                    (confirmingRevokeId === link.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-ink-muted">Revoke this link?</span>
                        <button
                          type="button"
                          data-testid="confirm-revoke"
                          onClick={() => handleRevoke(link)}
                          className="min-h-11 rounded border border-danger px-3 py-2 text-danger transition-colors duration-[120ms] hover:bg-danger/10"
                        >
                          Revoke
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRevokeId(null)}
                          className="min-h-11 rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid="copy-link"
                          onClick={() => handleCopy(link)}
                          className="min-h-11 rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
                        >
                          {copiedId === link.id ? "✓ Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          data-testid="share-link"
                          onClick={() => handleShare(link)}
                          className="min-h-11 rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
                        >
                          Share
                        </button>
                        <button
                          type="button"
                          data-testid="revoke-link"
                          onClick={() => setConfirmingRevokeId(link.id)}
                          className="min-h-11 rounded border border-edge px-3 py-2 text-ink-muted transition-colors duration-[120ms] hover:border-danger hover:text-danger"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                </div>
              ))}

              {!creating && (
                <button
                  type="button"
                  data-testid="create-link"
                  onClick={() => setCreating(true)}
                  className="min-h-11 self-start rounded border border-accent px-3 py-2 text-accent transition-colors duration-[120ms] hover:bg-accent/10 active:scale-[0.98]"
                >
                  Create share link
                </button>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {error}
        </p>
      )}
    </div>
  );
}
