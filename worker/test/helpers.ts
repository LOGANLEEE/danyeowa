import { SELF } from "cloudflare:test";
import { getLastDevOtp } from "../src/email";

/**
 * Runs the OTP sign-in flow (send-otp -> getLastDevOtp -> sign-in) and returns a
 * Cookie header string that can be attached to subsequent SELF.fetch calls to act
 * as the signed-in user.
 */
export async function signInAs(email: string): Promise<string> {
  const sendRes = await SELF.fetch("https://example.com/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  if (sendRes.status !== 200) {
    throw new Error(`send-verification-otp failed: ${sendRes.status}`);
  }

  const otp = getLastDevOtp();

  const signInRes = await SELF.fetch("https://example.com/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
  if (signInRes.status !== 200) {
    throw new Error(`sign-in/email-otp failed: ${signInRes.status}`);
  }

  const setCookies = signInRes.headers.getSetCookie
    ? signInRes.headers.getSetCookie()
    : [signInRes.headers.get("set-cookie") ?? ""];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}
