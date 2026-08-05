import { render, screen } from "@testing-library/react";
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

describe("App", () => {
  it("shows title, API status, and login form when signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/health")) return Promise.resolve(jsonResponse({ ok: true, d1: true }));
        if (url.includes("/api/me")) return Promise.resolve(jsonResponse({ error: "unauthenticated" }, { status: 401 }));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      })
    );
    render(<App />);
    expect(screen.getByRole("heading", { name: /roaster/i })).toBeInTheDocument();
    expect(await screen.findByText(/api: online/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });
});
