import { STATUS_LABELS, type MessageStatus } from "@/lib/messages/statuses";

const STATUS_COLORS: Record<MessageStatus, string> = {
  received: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  validated: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  sending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  rejected: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: MessageStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? ""}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
