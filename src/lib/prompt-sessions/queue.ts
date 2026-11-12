/**
 * The queue of a session as prompt_automator runs it: one prompt at a time, the others waiting in
 * the order they arrived. Same counting as the WhatsApp notice ("Fila: 2/3"): the position counts
 * the prompt running.
 */
import {
  RUNNING_PROMPT_STATUSES,
  type PromptSessionSummary,
  type PromptSummary,
} from "./statuses";

export type SessionQueue = {
  current: PromptSummary | null;
  waiting: PromptSummary[];
  finished: PromptSummary[];
  total: number; // running + waiting
  usedCount: number; // every prompt accepted in the session, for the limit
  isLimitReached: boolean;
};

export function buildSessionQueue(session: PromptSessionSummary): SessionQueue {
  const current = session.prompts.find((prompt) => RUNNING_PROMPT_STATUSES.includes(prompt.status)) ?? null;
  const waiting = session.prompts
    .filter((prompt) => prompt.status === "queued")
    .sort((first, second) => first.received_at.localeCompare(second.received_at));
  const finished = session.prompts.filter(
    (prompt) => prompt !== current && prompt.status !== "queued",
  );
  return {
    current,
    waiting,
    finished,
    total: waiting.length + (current ? 1 : 0),
    usedCount: session.prompts.length,
    isLimitReached:
      session.prompt_limit !== null && session.prompts.length >= session.prompt_limit,
  };
}
