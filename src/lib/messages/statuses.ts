/** Statuses of interface_personal_whats.schemas.MessageStatus. Shared by server and browser code. */
export const MESSAGE_STATUSES = [
  "received",
  "validated",
  "sending",
  "sent",
  "failed",
  "rejected",
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const VIEW_STATUSES = {
  queue: ["received", "validated", "sending"],
  history: ["sent", "failed", "rejected"],
} as const satisfies Record<string, readonly MessageStatus[]>;

export type MessageView = keyof typeof VIEW_STATUSES;

export const STATUS_LABELS: Record<MessageStatus, string> = {
  received: "Recebida",
  validated: "Validada",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  rejected: "Rejeitada",
};

export const SOURCE_PATTERN = /^[a-z0-9_-]{1,64}$/;

export const PAGE_SIZE = 20;

/** Public part of a message, as returned by the list endpoint (no nonce or ciphertext). */
export type MessageSummary = {
  id: string;
  source: string;
  status: MessageStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  validated_at: string | null;
  sent_at: string | null;
  next_attempt_at: string | null;
};

export type MessagePage = {
  messages: MessageSummary[];
  total: number;
  page: number;
  page_size: number;
  sources: string[];
};
