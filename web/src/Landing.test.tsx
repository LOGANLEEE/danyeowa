import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Landing from "./Landing";

describe("Landing", () => {
  it("renders the wordmark and headline", () => {
    render(<Landing onSignIn={() => {}} />);
    expect(screen.getByRole("heading", { name: /roaster/i })).toBeInTheDocument();
    expect(screen.getAllByText(/report-time-first/i).length).toBeGreaterThan(0);
  });

  it("fires onSignIn when the CTA is clicked", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(<Landing onSignIn={onSignIn} />);
    await user.click(screen.getByRole("button", { name: /sign in with email/i }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
