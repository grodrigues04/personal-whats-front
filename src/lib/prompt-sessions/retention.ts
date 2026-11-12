/**
 * The terminal of a session (the output of Claude) is deleted 10 days after the session started
 * (TTL in MongoDB, `records_expire_at` of the session). The session, its prompts, questions,
 * answers and results stay.
 */
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** Whole days left, rounded up: 0 once the date passed. */
export function countDaysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MILLISECONDS));
}

export function describeRetention(expiresAt: string, now: Date = new Date()): string {
  const daysLeft = countDaysLeft(expiresAt, now);
  if (daysLeft === 0) {
    return "Terminal do Claude já apagado";
  }
  if (daysLeft === 1) {
    return "Terminal do Claude apagado em menos de 1 dia";
  }
  return `Terminal do Claude apagado em ${daysLeft} dias`;
}
