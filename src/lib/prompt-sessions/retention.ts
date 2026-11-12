/**
 * The terminal and the prompts sent from here are deleted 10 days after the session started
 * (TTL in MongoDB, `records_expire_at` of the session). The session and its prompts stay.
 */
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** Whole days left, rounded up: 0 once the date passed. */
export function countDaysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MILLISECONDS));
}

export function describeRetention(expiresAt: string, now: Date = new Date()): string {
  const daysLeft = countDaysLeft(expiresAt, now);
  if (daysLeft === 0) {
    return "Terminal e envios já apagados";
  }
  if (daysLeft === 1) {
    return "Terminal e envios apagados em menos de 1 dia";
  }
  return `Terminal e envios apagados em ${daysLeft} dias`;
}
