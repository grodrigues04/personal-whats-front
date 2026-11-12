import {
  PROMPT_SESSION_STATUS_LABELS,
  PROMPT_STATUS_LABELS,
  type PromptSessionStatus,
  type PromptStatus,
} from "@/lib/prompt-sessions/statuses";

const SESSION_STATUS_COLORS: Record<PromptSessionStatus, string> = {
  active: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  finishing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  finished: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  interrupted: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const PROMPT_STATUS_COLORS: Record<PromptStatus, string> = {
  queued: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  reviewing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  running: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  waiting_answers: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  cancelled: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  rejected: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export function PromptSessionStatusBadge({ status }: { status: PromptSessionStatus }) {
  return (
    <Badge
      label={PROMPT_SESSION_STATUS_LABELS[status] ?? status}
      color={SESSION_STATUS_COLORS[status] ?? ""}
    />
  );
}

export function PromptStatusBadge({ status }: { status: PromptStatus }) {
  return (
    <Badge label={PROMPT_STATUS_LABELS[status] ?? status} color={PROMPT_STATUS_COLORS[status] ?? ""} />
  );
}
