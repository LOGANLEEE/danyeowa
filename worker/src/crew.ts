import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { CrewInviteCreateSchema } from "@danyeowa/shared";
import type { CrewMember, CrewResponse } from "@danyeowa/shared";
import { sendCrewInviteEmail } from "./email";
import * as schema from "./db/schema";
import { loadTripsWithFlights } from "./trips";
import type { Env } from "./index";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const crewRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

/** 32 random bytes, base64url-encoded without padding — ~192 bits of entropy. Same shape as a
 * share-link token, but these are never handed to an unauthenticated visitor: an invite is
 * claimed by signing in as the invited address, not by holding the token. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Emails are compared, and stored, lower-cased: better-auth does not normalise case, so
 * `Logan@…` signing in must still match an invite addressed to `logan@…`. */
const normalise = (email: string) => email.trim().toLowerCase();

/** Every invite this user is a party to — sent by them, or addressed to/accepted by them. */
function involvingUser(userId: string, email: string) {
  return or(
    eq(schema.crewInvites.fromUserId, userId),
    eq(schema.crewInvites.acceptedByUserId, userId),
    eq(schema.crewInvites.toEmail, email),
  );
}

const isActive = (row: typeof schema.crewInvites.$inferSelect) =>
  row.acceptedAt !== null && row.revokedAt === null;

/**
 * Resolves the pairing between two accounts, or null when there isn't an active one. This is the
 * single gate on reading someone else's roster — every crew read route goes through it, so
 * there is one place to get the check right rather than one per route.
 */
async function activePairing(
  database: ReturnType<typeof db>,
  userId: string,
  otherUserId: string,
) {
  const rows = await database
    .select()
    .from(schema.crewInvites)
    .where(
      and(
        isNull(schema.crewInvites.revokedAt),
        // Both directions: sharing is mutual, so it does not matter which of the two sent the
        // invite. Dropping either clause leaves one side able to read and the other 404ing.
        or(
          and(
            eq(schema.crewInvites.fromUserId, userId),
            eq(schema.crewInvites.acceptedByUserId, otherUserId),
          ),
          and(
            eq(schema.crewInvites.fromUserId, otherUserId),
            eq(schema.crewInvites.acceptedByUserId, userId),
          ),
        ),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row && isActive(row) ? row : null;
}

crewRouter.get("/crew", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);
  const email = normalise(user.email);
  const rows = await database
    .select()
    .from(schema.crewInvites)
    .where(involvingUser(user.id, email));

  const members: CrewMember[] = [];
  const sent: CrewResponse["sent"] = [];
  const received: CrewResponse["received"] = [];

  const partnerIds = new Set<string>();
  /** Invite id -> the account that sent it, resolved to an address in the same lookup as members. */
  const senderIds = new Map<string, string>();
  for (const row of rows) {
    if (row.revokedAt !== null) continue;
    if (isActive(row)) {
      const otherId =
        row.fromUserId === user.id ? row.acceptedByUserId : row.fromUserId;
      // Self-pairings can't be created (POST rejects them), but a row that somehow names the
      // same account on both sides must not show up as a second badge for yourself.
      if (otherId && otherId !== user.id) partnerIds.add(otherId);
      continue;
    }
    if (row.fromUserId === user.id) {
      sent.push({
        id: row.id,
        email: row.toEmail,
        token: row.token,
        createdAt: row.createdAt,
      });
    } else if (row.toEmail === email) {
      // The token is deliberately withheld here: the receiver accepts by invite id, and echoing
      // a secret back to the other party earns nothing. The SENDER, though, is filled in below —
      // accepting hands someone your whereabouts, so you have to be told whose invite it is.
      received.push({
        id: row.id,
        email: row.toEmail,
        createdAt: row.createdAt,
      });
      senderIds.set(row.id, row.fromUserId);
    }
  }

  const lookupIds = new Set([...partnerIds, ...senderIds.values()]);
  if (lookupIds.size > 0) {
    const accounts = await database
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
      })
      .from(schema.user)
      .where(inArray(schema.user.id, [...lookupIds]));
    const byId = new Map(accounts.map((a) => [a.id, a]));

    // One entry per person, not per row: a pair could hold more than one active row (only
    // possible for pairings made before creation started refusing them), and two badges for the
    // same crew member, each with its own "Stop sharing", reads as a rendering glitch rather
    // than as two separate grants.
    const seen = new Set<string>();
    for (const row of rows) {
      if (!isActive(row)) continue;
      const otherId =
        row.fromUserId === user.id ? row.acceptedByUserId : row.fromUserId;
      if (!otherId || otherId === user.id || seen.has(otherId)) continue;
      const account = byId.get(otherId);
      if (!account) continue;
      seen.add(otherId);
      members.push({
        userId: account.id,
        email: account.email,
        name: account.name ?? null,
        inviteId: row.id,
      });
    }

    for (const invite of received) {
      const sender = byId.get(senderIds.get(invite.id) ?? "");
      if (sender) {
        invite.fromEmail = sender.email;
        invite.fromName = sender.name ?? null;
      }
    }
  }

  return c.json({ members, sent, received } satisfies CrewResponse);
});

/** How long the emailed preview link keeps working. The INVITE itself never expires — it stays
 * acceptable from the Share tab forever. Only this unauthenticated peek ages out, because a
 * bearer URL that lives for ever is the thing we deleted the old share link over. */
const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** `korlogan94@gmail.com` -> `k•••••94@gmail.com`. Enough for the recipient to recognise which
 * of their addresses to sign in with, without handing the full address to anyone holding a
 * forwarded link. */
/** How a sender is named to the person being invited.
 *
 * Never the full email address. The preview page and the invitation email are two halves of one
 * introduction, and they have to agree: being invited by "korlogan94" on the page and by
 * "korlogan94@gmail.com" in the inbox reads as two different people. It also hands the sender's
 * full address to anyone who is merely invited, before they have accepted anything.
 */
export function senderLabel(
  name: string | null | undefined,
  email: string | undefined,
): string {
  return name?.trim() || email?.split("@")[0] || "Someone";
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const head = local.slice(0, 1);
  const tail = local.length > 3 ? local.slice(-2) : "";
  return `${head}${"•".repeat(Math.max(local.length - head.length - tail.length, 1))}${tail}@${domain}`;
}

/**
 * The ONLY unauthenticated data route in the app. It exists so someone who was invited but has
 * no account sees who invited them and what they would get, rather than an anonymous sign-in
 * form they have no reason to trust.
 *
 * It deliberately returns nothing about the roster — not a trip, not a date, not a count. What
 * leaks from a forwarded link is "this person invited someone", which is not the airline data
 * the old share link carried and was deleted for.
 *
 * 404 (never 403) for unknown, revoked, already-accepted or expired: a 403 would confirm the
 * invite exists and hint at who it is for, which is the same reasoning the accept route uses.
 */
crewRouter.get("/invite/:token", async (c) => {
  const database = db(c.env);
  const [invite] = await database
    .select()
    .from(schema.crewInvites)
    .where(eq(schema.crewInvites.token, c.req.param("token")))
    .limit(1);

  if (
    !invite ||
    invite.revokedAt !== null ||
    invite.acceptedAt !== null ||
    Date.now() - invite.createdAt > INVITE_LINK_TTL_MS
  ) {
    return c.json({ error: "not_found" }, 404);
  }

  const [sender] = await database
    .select({ email: schema.user.email, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, invite.fromUserId))
    .limit(1);

  // When the visitor already has a session, say whether it is the RIGHT one. Invites match on
  // exact address, and Google hands over whatever address that account carries — so signing in
  // with the wrong one lands you in an app with no invitation and nothing explaining why.
  //
  // The comparison happens here, on the real addresses; only a boolean leaves. `signedInAs` is
  // the viewer's own email, which /api/me already gives them.
  const viewer = c.var.user;

  return c.json({
    fromName: senderLabel(sender?.name, sender?.email),
    toEmailMasked: maskEmail(invite.toEmail),
    ...(viewer
      ? {
          signedInAs: viewer.email,
          matchesYou: normalise(viewer.email) === invite.toEmail,
        }
      : {}),
  });
});

crewRouter.post("/crew/invites", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = CrewInviteCreateSchema.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  const email = normalise(parsed.data.email);
  if (email === normalise(user.email)) {
    return c.json({ error: "cannot_invite_self" }, 400);
  }

  const database = db(c.env);

  // Already asked, or already paired: either way there is nothing to create. Both halves matter.
  // The second one is what stops A→B and B→A from BOTH becoming live pairings when two people
  // agree to share and each sends an invite: the first check is keyed on (fromUserId, toEmail),
  // so it cannot see the invite pointing the other way. Two live pairings meant "Stop sharing"
  // revoked one row and left the other reading, which is the opposite of what the button says.
  const existing = await database
    .select()
    .from(schema.crewInvites)
    .where(
      and(
        eq(schema.crewInvites.fromUserId, user.id),
        eq(schema.crewInvites.toEmail, email),
      ),
    );
  if (existing.some((row) => row.revokedAt === null)) {
    return c.json({ error: "invite_exists" }, 409);
  }

  const [target] = await database
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  // No account yet is normal — they can be invited, they just can't be paired yet.
  if (target && (await activePairing(database, user.id, target.id))) {
    return c.json({ error: "already_paired" }, 409);
  }

  const row = {
    id: crypto.randomUUID(),
    fromUserId: user.id,
    toEmail: email,
    token: generateToken(),
    createdAt: Date.now(),
  };
  await database.insert(schema.crewInvites).values(row);

  // The invite row is the source of truth; the email is a notification. Until now there was no
  // notification at all — an invite was invisible unless the recipient already had an account,
  // signed in, and happened to look at the Share tab.
  //
  // Awaited, not fire-and-forget: a send that quietly fails leaves the sender believing someone
  // was told. `emailed: false` is reported back so the UI can say so. The invite still stands
  // either way — a mail outage must not cost a real invitation.
  const emailed = await sendCrewInviteEmail(
    c.env,
    email,
    senderLabel(user.name, user.email),
    row.token,
  );

  return c.json(
    {
      id: row.id,
      email: row.toEmail,
      token: row.token,
      createdAt: row.createdAt,
      emailed,
    },
    201,
  );
});

crewRouter.post("/crew/invites/:id/accept", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);
  const rows = await database
    .select()
    .from(schema.crewInvites)
    .where(eq(schema.crewInvites.id, c.req.param("id")))
    .limit(1);
  const invite = rows[0];

  // An invite addressed to someone else is reported as missing, not as forbidden: a 403 would
  // confirm that an invite with this id exists, and for which address.
  if (!invite || invite.toEmail !== normalise(user.email)) {
    return c.json({ error: "not_found" }, 404);
  }
  if (invite.revokedAt !== null) return c.json({ error: "revoked" }, 409);
  if (invite.fromUserId === user.id)
    return c.json({ error: "cannot_accept_own" }, 400);
  if (invite.acceptedAt !== null) {
    return invite.acceptedByUserId === user.id
      ? c.json({ ok: true })
      : c.json({ error: "already_accepted" }, 409);
  }

  await database
    .update(schema.crewInvites)
    .set({ acceptedAt: Date.now(), acceptedByUserId: user.id })
    // Re-asserting "still unaccepted" in the WHERE makes a double accept a no-op rather than a
    // silent overwrite of whoever got there first.
    .where(
      and(
        eq(schema.crewInvites.id, invite.id),
        isNull(schema.crewInvites.acceptedAt),
      ),
    );

  return c.json({ ok: true });
});

/** Ends the pairing, or withdraws a pending invite. Either party may do it — sharing is
 * symmetric, so the ability to stop it has to be too. */
crewRouter.post("/crew/invites/:id/revoke", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);
  const rows = await database
    .select()
    .from(schema.crewInvites)
    .where(eq(schema.crewInvites.id, c.req.param("id")))
    .limit(1);
  const invite = rows[0];

  const isParty =
    invite &&
    (invite.fromUserId === user.id ||
      invite.acceptedByUserId === user.id ||
      invite.toEmail === normalise(user.email));
  if (!isParty) return c.json({ error: "not_found" }, 404);

  // Revoke the pairing, not just the row that was clicked. An accepted invite names two
  // accounts, and any other live row between the same two grants exactly the same read — so
  // leaving one behind would end the badge while the access continued. Creation now refuses to
  // make a second one, but a pair created before that guard existed must still be revocable.
  const otherUserId =
    invite.acceptedAt !== null
      ? invite.fromUserId === user.id
        ? invite.acceptedByUserId
        : invite.fromUserId
      : null;

  const now = Date.now();
  await database
    .update(schema.crewInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.crewInvites.id, invite.id),
        isNull(schema.crewInvites.revokedAt),
      ),
    );

  if (otherUserId) {
    await database
      .update(schema.crewInvites)
      .set({ revokedAt: now })
      .where(
        and(
          isNull(schema.crewInvites.revokedAt),
          or(
            and(
              eq(schema.crewInvites.fromUserId, user.id),
              eq(schema.crewInvites.acceptedByUserId, otherUserId),
            ),
            and(
              eq(schema.crewInvites.fromUserId, otherUserId),
              eq(schema.crewInvites.acceptedByUserId, user.id),
            ),
          ),
        ),
      );
  }

  return c.json({ ok: true });
});

/**
 * A crew member's roster, read-only. Deliberately its own route rather than a `?userId=` on
 * /api/trips: a query parameter that selects whose data you get is one copy-paste away from
 * appearing on a mutation route, and there is no way to write through this one.
 */
crewRouter.get("/crew/:userId/trips", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const otherUserId = c.req.param("userId");
  const database = db(c.env);
  // Not paired reads as "no such crew member" — the same answer an unknown id gets, so this
  // can't be used to test whether an account exists.
  if (!(await activePairing(database, user.id, otherUserId))) {
    return c.json({ error: "not_found" }, 404);
  }

  const trips = await loadTripsWithFlights(
    database,
    otherUserId,
    c.req.query("from"),
    c.req.query("to"),
  );
  return c.json({ trips });
});
