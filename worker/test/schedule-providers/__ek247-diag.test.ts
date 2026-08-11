import { describe, expect, it } from "vitest";
import { parseFr24Html } from "../../src/schedule-providers/scrape-fr24";
import fr24Ek247Html from "../fixtures/fr24-ek247.html?raw";

describe("EK247 diagnosis", () => {
  it("shows what the parser makes of a two-leg service", async () => {
    const res = new Response(fr24Ek247Html, { headers: { "content-type": "text/html" } });
    const legs = await parseFr24Html(res);
    console.log("PARSER RESULT:", JSON.stringify(legs, null, 1));
    expect(true).toBe(true);
  });
});
