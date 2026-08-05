import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./auth-client", () => ({
  authClient: {
    signOut: vi.fn(),
    emailOtp: { sendVerificationOtp: vi.fn() },
    signIn: { emailOtp: vi.fn() },
  },
}));

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function stubSignedOutFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/health")) return Promise.resolve(jsonResponse({ ok: true, d1: true }));
      if (url.includes("/api/me")) return Promise.resolve(jsonResponse({ error: "unauthenticated" }, { status: 401 }));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    })
  );
}

describe("App", () => {
  it("shows title, API status, and the landing page (not the login form) when signed out", async () => {
    stubSignedOutFetch();
    render(<App />);
    expect(screen.getByRole("heading", { name: /roaster/i })).toBeInTheDocument();
    expect(await screen.findByText(/api: online/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with email/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("shows the login form after clicking the landing CTA", async () => {
    stubSignedOutFetch();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /sign in with email/i }));
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });
});
