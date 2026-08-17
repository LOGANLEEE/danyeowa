type EmailEnv = { RESEND_API_KEY?: string; DEV_OTP_FALLBACK?: string; EMAIL_FROM?: string };

// Resend test mode (no verified domain) only accepts this sender and only
// delivers to the Resend account owner's own address.
const DEFAULT_FROM = "danyeowa <onboarding@resend.dev>";

let lastDevOtp: string | null = null;
export const getLastDevOtp = () => lastDevOtp;

/** Escapes text interpolated into an HTML email body. A display name comes from user input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Tells someone they have been invited to see a crew member's roster.
 *
 * Returns whether the mail was accepted, and never throws: the invite row is the source of
 * truth and already exists by the time this runs. A failed send must not undo a real invite —
 * but it must not be silent either, so the caller reports it back to the sender.
 *
 * Deliberately carries NO token or sign-in link. The invite is claimed by signing in as the
 * invited address, so a forwarded email grants nothing — which is the whole reason the old
 * unlisted share link was deleted.
 */
export async function sendCrewInviteEmail(
  env: EmailEnv,
  to: string,
  fromLabel: string,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const who = escapeHtml(fromLabel);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? DEFAULT_FROM,
        to: [to],
        subject: `${fromLabel} shared their roster with you`,
        html:
          `<p><strong>${who}</strong> wants to share their flight roster with you on danyeowa.</p>` +
          `<p>You'll see when they report, when they land, and which days they're free.</p>` +
          `<p><a href="https://danyeowa.com">Open danyeowa</a> and sign in with this email address` +
          ` &mdash; the invitation will be waiting.</p>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendOtpEmail(env: EmailEnv, to: string, otp: string) {
  if (!env.RESEND_API_KEY) {
    if (env.DEV_OTP_FALLBACK !== "true") {
      throw new Error("email transport not configured");
    }
    lastDevOtp = otp;
    console.log(`[dev] OTP for ${to}: ${otp}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? DEFAULT_FROM,
      to: [to],
      subject: "Your sign-in code",
      html: `<p>Your code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
}
