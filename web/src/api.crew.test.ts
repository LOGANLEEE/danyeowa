import { afterEach, describe, expect, it, vi } from "vitest";
import { getCrewTrips, inviteCrew } from "./api";

/** The crew client's own behaviour, against a stubbed fetch — the wording a person reads when an
 * invite is refused is decided here, not by the API, and was previously never executed. */
describe("crew api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it.each([
    [400, { error: "cannot_invite_self" }, /your own address/i],
    [409, { error: "already_paired" }, /already invited them/i],
    [409, { error: "invite_exists" }, /already invited them/i],
    [400, { error: "invalid email" }, /doesn't look like an email/i],
    [500, {}, /couldn't send the invite/i],
  ])("turns %i %o into a readable message", async (status, body, expected) => {
    stubFetch(status, body);
    await expect(inviteCrew({ email: "them@example.com" })).rejects.toThrow(expected);
  });

  it("encodes the user id into the crew roster path", async () => {
    const fetchMock = stubFetch(200, { trips: [] });

    await expect(getCrewTrips("us er/1")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/crew/us%20er%2F1/trips");
  });

  it("throws rather than returning an empty roster when the pairing is gone", async () => {
    stubFetch(404, { error: "not_found" });

    // CalendarHome relies on this rejecting: it is the signal to fall back to your own roster,
    // and a resolved empty array would render as "they have no trips" instead.
    await expect(getCrewTrips("u-1")).rejects.toThrow(/crew roster/i);
  });
});
