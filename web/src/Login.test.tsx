import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";
import { authClient } from "./auth-client";

vi.mock("./auth-client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: vi.fn() },
    signIn: { emailOtp: vi.fn() },
  },
}));

describe("Login", () => {
  beforeEach(() => {
    vi.mocked(authClient.emailOtp.sendVerificationOtp).mockReset();
    vi.mocked(authClient.signIn.emailOtp).mockReset();
  });

  it("sends an OTP for the entered email, then signs in with the code", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.emailOtp.sendVerificationOtp).mockResolvedValue({
      data: {},
      error: null,
    } as never);
    vi.mocked(authClient.signIn.emailOtp).mockResolvedValue({
      data: {},
      error: null,
    } as never);
    const onSignedIn = vi.fn();

    render(<Login onSignedIn={onSignedIn} />);

    await user.type(screen.getByLabelText(/email/i), "roast@example.com");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "roast@example.com",
      type: "sign-in",
    });

    const codeInput = await screen.findByLabelText(/code/i);
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(authClient.signIn.emailOtp).toHaveBeenCalledWith({
      email: "roast@example.com",
      otp: "123456",
    });
    expect(onSignedIn).toHaveBeenCalled();
  });
});
