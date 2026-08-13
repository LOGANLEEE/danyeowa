type EmailEnv = { RESEND_API_KEY?: string; DEV_OTP_FALLBACK?: string; EMAIL_FROM?: string };

// Resend test mode (no verified domain) only accepts this sender and only
// delivers to the Resend account owner's own address.
const DEFAULT_FROM = "danyeowa <onboarding@resend.dev>";

let lastDevOtp: string | null = null;
export const getLastDevOtp = () => lastDevOtp;

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
