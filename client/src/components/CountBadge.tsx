import { Badge } from '@mantine/core';

const BADGE_CAP = 99;

/** Shown in the pink badge: a plain number up to 99, then "99+". */
export function formatCountBadge(count: number): string {
  return count > BADGE_CAP ? `${BADGE_CAP}+` : String(count);
}

/**
 * A count on a nav item or a homework tab. One pink circle and white digits
 * for the student and the teacher (auto contrast would paint the digits dark).
 * Mantine's circle fixes the width to the height, so two digits clip: 1–9 is a
 * circle, 10+ and "99+" is a pill. Pass `label` with the real count for screen
 * readers when the shown value is capped.
 */
export function CountBadge({ count, label }: { count: number; label?: string }) {
  const capped = count > BADGE_CAP;
  const circle = count < 10;
  return (
    <Badge
      size="sm"
      circle={circle}
      variant="filled"
      autoContrast={false}
      aria-label={label ?? (capped ? String(count) : undefined)}
      styles={{ label: { fontWeight: 800 } }}
    >
      {formatCountBadge(count)}
    </Badge>
  );
}
