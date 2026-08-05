import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App", () => {
  it("shows title and API status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, d1: true }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    render(<App />);
    expect(screen.getByRole("heading", { name: /roaster me/i })).toBeInTheDocument();
    expect(await screen.findByText(/api: online/i)).toBeInTheDocument();
  });
});
