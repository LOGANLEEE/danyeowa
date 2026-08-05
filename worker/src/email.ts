type EmailEnv = { RESEND_API_KEY?: string };

let lastDevOtp: string | null = null;
export const getLastDevOtp = () => lastDevOtp;

export async function sendOtpEmail(env: EmailEnv, to: string, otp: string) {
  if (!env.RESEND_API_KEY) {
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
      from: "Roaster Me <auth@roaster-me.dev>",
      to: [to],
      subject: "Your sign-in code",
      html: `<p>Your code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
}
