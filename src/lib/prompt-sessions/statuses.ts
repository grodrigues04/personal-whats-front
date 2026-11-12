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

/** Public part of a prompt, as returned by the list endpoint (no nonce or ciphertext). */
export type PromptSummary = {
  id: string;
  status: PromptStatus;
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
  prompts: PromptSummary[];
};

export type PromptSessionPage = {
  sessions: PromptSessionSummary[];
  total: number;
  page: number;
  page_size: number;
};
