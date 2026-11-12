/** Statuses of the prompt_sessions collection (written by prompt_automator). Shared by server and browser code. */
export const PROMPT_SESSION_STATUSES = [
  "active",
  "finishing",
  "finished",
  "cancelled",
  "interrupted",
] as const;

export type PromptSessionStatus = (typeof PROMPT_SESSION_STATUSES)[number];

export const PROMPT_SESSION_STATUS_LABELS: Record<PromptSessionStatus, string> = {
  active: "Ativa",
  finishing: "Finalizando",
  finished: "Finalizada",
  cancelled: "Cancelada",
  interrupted: "Interrompida",
};

export const PROMPT_STATUSES = [
  "queued",
  "reviewing",
  "running",
  "waiting_answers",
  "done",
  "failed",
  "cancelled",
  "rejected",
] as const;

export type PromptStatus = (typeof PROMPT_STATUSES)[number];

export const PROMPT_STATUS_LABELS: Record<PromptStatus, string> = {
  queued: "Na fila",
  reviewing: "Revisão de segurança",
  running: "Executando",
  waiting_answers: "Aguardando respostas",
  done: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
  rejected: "Rejeitado",
};

export const SESSION_ID_PATTERN = /^[0-9a-f]{24}$/i;
export const PROMPT_ID_PATTERN = /^[0-9a-f]{32}$/;

/** Prompts in these statuses are the queue: the one running first, then the waiting ones. */
export const RUNNING_PROMPT_STATUSES: readonly PromptStatus[] = [
  "reviewing",
  "running",
  "waiting_answers",
];

/** Where a prompt came from: the group (/prompt) or this frontend. */
export type PromptSource = "whatsapp" | "frontend";

/** Public part of a prompt, as returned by the list endpoint (no nonce or ciphertext). */
export type PromptSummary = {
  id: string;
  status: PromptStatus;
  source: PromptSource;
  received_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/** Public part of a prompt session, as returned by the list endpoint. */
export type PromptSessionSummary = {
  id: string;
  status: PromptSessionStatus;
  chat_name: string;
  duration_minutes: number;
  prompt_limit: number | null; // null means unlimited
  started_at: string;
  ends_at: string;
  finished_at: string | null;
  end_reason: string | null;
  branch: string;
  pull_request_url: string | null;
  records_expire_at: string; // when its terminal (the output of Claude) is deleted
  prompts: PromptSummary[];
};

export type PromptSessionPage = {
  sessions: PromptSessionSummary[];
  total: number;
  page: number;
  page_size: number;
};

/** Prompts and answers sent through this frontend (prompt_inputs), read by prompt_automator. */
export const PROMPT_INPUT_KINDS = ["prompt", "answer"] as const;

export type PromptInputKind = (typeof PROMPT_INPUT_KINDS)[number];

export type PromptInputStatus = "pending" | "accepted" | "refused";

/** Public part of an input: never the username (a phone number) nor the content. */
export type PromptInputSummary = {
  id: string;
  kind: PromptInputKind;
  prompt_id: string | null;
  sender_name: string;
  status: PromptInputStatus;
  refusal_reason: string | null;
  created_at: string;
  is_mine: boolean;
};

/** Steps of a prompt that run Claude, in the order they happen. */
export type TerminalStep = "review" | "implementation" | "answers";

export type EncryptedTerminalChunk = {
  sequence: number;
  step: TerminalStep;
  created_at: string;
  encryption_version: number;
  nonce: string;
  ciphertext: string;
};
