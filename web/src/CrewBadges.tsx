import type { CrewMember } from "@roaster/shared";

type Props = {
  members: CrewMember[];
  /** null = your own roster. */
  viewing: string | null;
  onSelect: (userId: string | null) => void;
};

/** First name, or the part of the email before the @ — whichever exists. Crew members are
 * people you already fly with, so a first name is the shortest thing that identifies them. */
function shortName(member: CrewMember): string {
  const name = member.name?.trim();
  if (name) return name.split(/\s+/)[0]!;
  return member.email.split("@")[0]!;
}

/**
 * Whose roster you're looking at. Renders nothing at all when you have no crew — a row of one
 * badge saying "You" is noise for the crew member flying alone, which is most of them.
 *
 * Selecting someone else's badge switches the calendar to a read-only view of their roster;
 * that is enforced by the API (there is no write route that takes a user id), not by this row.
 */
export default function CrewBadges({ members, viewing, onSelect }: Props) {
  if (members.length === 0) return null;

  const badge = (key: string, label: string, userId: string | null) => {
    const active = viewing === userId;
    return (
      <button
        key={key}
        type="button"
        data-testid={userId === null ? "crew-badge-self" : `crew-badge-${userId}`}
        aria-pressed={active}
        onClick={() => onSelect(userId)}
        className={[
          "min-h-[44px] shrink-0 rounded-full border px-3 text-sm transition-[background-color,border-color,transform] duration-[120ms] active:scale-[0.97]",
          active
            ? "border-transparent bg-accent-soft font-medium text-accent"
            : "border-edge text-ink-muted hover:border-ink-muted",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    // Scrolls horizontally on its own rather than wrapping to a second row and pushing the
    // calendar down the page. -mx-1/px-1 so a focus ring isn't clipped by the overflow.
    <div
      data-testid="crew-badges"
      className="-mx-1 flex gap-2 overflow-x-auto px-1"
      role="group"
      aria-label="Whose roster to show"
    >
      {badge("self", "You", null)}
      {members.map((member) => badge(member.userId, shortName(member), member.userId))}
    </div>
  );
}
