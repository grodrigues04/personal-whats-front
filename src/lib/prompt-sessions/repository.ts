import "server-only";

import { Binary, ObjectId } from "mongodb";

import type { EncryptedData } from "@/lib/encryption/decryption";
import { getDatabase } from "@/lib/messages/database";
import { PAGE_SIZE } from "@/lib/messages/statuses";

import {
  PROMPT_ID_PATTERN,
  SESSION_ID_PATTERN,
  type EncryptedTerminalChunk,
  type PromptInputKind,
  type PromptInputStatus,
  type PromptInputSummary,
  type PromptSessionPage,
  type PromptSessionStatus,
  type PromptSource,
  type PromptStatus,
  type TerminalStep,
} from "./statuses";

/**
 * Access to the collections of prompt_automator. The sessions and the terminal are read only; the
 * only write is the insertion of prompts and answers in prompt_inputs, already encrypted in the
 * browser, which prompt_automator reads and marks as accepted or refused. Callers must check the
 * session (login) before calling any function here.
 */
const PROMPT_SESSIONS_COLLECTION = "prompt_sessions";
const PROMPT_INPUTS_COLLECTION = "prompt_inputs";
const PROMPT_TERMINAL_COLLECTION = "prompt_terminal";
const SETTINGS_COLLECTION = "settings";
const PROMPT_KEY_CHECK_ID = "prompt_key_check";
// Chunks per request of the terminal: the browser asks again for the next ones
const TERMINAL_CHUNKS_PER_REQUEST = 50;
// Same as prompt_automator: sessions saved before records_expire_at existed
const RECORDS_LIFETIME_MILLISECONDS = 10 * 24 * 60 * 60 * 1000;

type PromptDocument = {
  id: string;
  status: PromptStatus;
  source?: PromptSource;
  received_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  encryption_version: number;
  nonce: Binary;
  ciphertext: Binary;
};

type PromptSessionDocument = {
  _id: ObjectId;
  command: string;
  status: PromptSessionStatus;
  chat_name: string;
  duration_minutes: number;
  prompt_limit: number | null;
  started_at: Date;
  ends_at: Date;
  finished_at: Date | null;
  end_reason: string | null;
  branch: string;
  pull_request_url: string | null;
  records_expire_at?: Date;
  prompts: PromptDocument[];
  created_at: Date;
  updated_at: Date;
};

function findRecordsExpiration(document: Pick<PromptSessionDocument, "records_expire_at" | "started_at">): Date {
  return (
    document.records_expire_at ??
    new Date(document.started_at.getTime() + RECORDS_LIFETIME_MILLISECONDS)
  );
}

function toIsoString(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export async function listPromptSessions(page: number): Promise<PromptSessionPage> {
  const database = await getDatabase();
  const promptSessions = database.collection<PromptSessionDocument>(PROMPT_SESSIONS_COLLECTION);

  const [documents, total] = await Promise.all([
    promptSessions
      .find({}, { projection: { "prompts.nonce": 0, "prompts.ciphertext": 0 } })
      .sort({ started_at: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
    promptSessions.countDocuments(),
  ]);

  return {
    sessions: documents.map((document) => ({
      id: document._id.toHexString(),
      status: document.status,
      chat_name: document.chat_name,
      duration_minutes: document.duration_minutes,
      prompt_limit: document.prompt_limit ?? null,
      started_at: document.started_at.toISOString(),
      ends_at: document.ends_at.toISOString(),
      finished_at: toIsoString(document.finished_at),
      end_reason: document.end_reason ?? null,
      branch: document.branch,
      pull_request_url: document.pull_request_url ?? null,
      records_expire_at: findRecordsExpiration(document).toISOString(),
      prompts: (document.prompts ?? []).map((prompt) => ({
        id: prompt.id,
        status: prompt.status,
        source: prompt.source ?? "whatsapp",
        received_at: prompt.received_at.toISOString(),
        started_at: toIsoString(prompt.started_at),
        finished_at: toIsoString(prompt.finished_at),
      })),
    })),
    total,
    page,
    page_size: PAGE_SIZE,
  };
}

export type EncryptedPrompt = EncryptedData & { id: string; encryptionVersion: number };

/** Returns null when the id is invalid or the session does not exist. */
export async function getEncryptedPrompts(sessionId: string): Promise<EncryptedPrompt[] | null> {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return null;
  }
  const database = await getDatabase();
  const document = await database
    .collection<PromptSessionDocument>(PROMPT_SESSIONS_COLLECTION)
    .findOne(
      { _id: new ObjectId(sessionId) },
      {
        projection: {
          "prompts.id": 1,
          "prompts.encryption_version": 1,
          "prompts.nonce": 1,
          "prompts.ciphertext": 1,
        },
      },
    );
  if (!document) {
    return null;
  }
  return (document.prompts ?? []).map((prompt) => ({
    id: prompt.id,
    encryptionVersion: prompt.encryption_version,
    nonceBase64: Buffer.from(prompt.nonce.buffer).toString("base64"),
    ciphertextBase64: Buffer.from(prompt.ciphertext.buffer).toString("base64"),
  }));
}

function toBase64(binary: Binary): string {
  return Buffer.from(binary.buffer).toString("base64");
}

type SettingsDocument = { _id: string; nonce: Binary; ciphertext: Binary };

/** Written by prompt_automator with the key of the prompts. */
export async function getPromptKeyCheck(): Promise<EncryptedData | null> {
  const database = await getDatabase();
  const document = await database
    .collection<SettingsDocument>(SETTINGS_COLLECTION)
    .findOne({ _id: PROMPT_KEY_CHECK_ID });
  if (!document) {
    return null;
  }
  return { nonceBase64: toBase64(document.nonce), ciphertextBase64: toBase64(document.ciphertext) };
}

export type PromptSessionState = {
  status: PromptSessionStatus;
  prompts: { id: string; status: PromptStatus }[];
};

/** Status of a session and of its prompts, to validate what is sent to it. */
export async function getPromptSessionState(sessionId: string): Promise<PromptSessionState | null> {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return null;
  }
  const database = await getDatabase();
  const document = await database
    .collection<PromptSessionDocument>(PROMPT_SESSIONS_COLLECTION)
    .findOne(
      { _id: new ObjectId(sessionId) },
      {
        projection: {
          status: 1,
          "prompts.id": 1,
          "prompts.status": 1,
        },
      },
    );
  if (!document) {
    return null;
  }
  return {
    status: document.status,
    prompts: (document.prompts ?? []).map((prompt) => ({ id: prompt.id, status: prompt.status })),
  };
}

type PromptInputDocument = {
  _id?: ObjectId;
  session_id: string;
  kind: PromptInputKind;
  prompt_id: string | null;
  username: string;
  sender_name: string;
  status: PromptInputStatus;
  refusal_reason?: string | null;
  created_at: Date;
  processed_at?: Date | null;
  encryption_version: number;
  nonce: Binary;
  ciphertext: Binary;
};

export async function countPendingInputs(sessionId: string, username: string): Promise<number> {
  const database = await getDatabase();
  return database
    .collection<PromptInputDocument>(PROMPT_INPUTS_COLLECTION)
    .countDocuments({ session_id: sessionId, username, status: "pending" });
}

export async function insertPromptInput(input: {
  sessionId: string;
  kind: PromptInputKind;
  promptId: string | null;
  username: string;
  senderName: string;
  encryptionVersion: number;
  nonce: Buffer;
  ciphertext: Buffer;
}): Promise<string> {
  const database = await getDatabase();
  const result = await database.collection<PromptInputDocument>(PROMPT_INPUTS_COLLECTION).insertOne({
    session_id: input.sessionId,
    kind: input.kind,
    prompt_id: input.promptId,
    username: input.username,
    sender_name: input.senderName,
    status: "pending",
    refusal_reason: null,
    created_at: new Date(),
    processed_at: null,
    encryption_version: input.encryptionVersion,
    nonce: new Binary(input.nonce),
    ciphertext: new Binary(input.ciphertext),
  });
  return result.insertedId.toHexString();
}

/** Every input of a session, newest first, without content nor username. */
export async function listPromptInputs(
  sessionId: string,
  username: string,
): Promise<PromptInputSummary[]> {
  const database = await getDatabase();
  const documents = await database
    .collection<PromptInputDocument>(PROMPT_INPUTS_COLLECTION)
    .find({ session_id: sessionId }, { projection: { nonce: 0, ciphertext: 0 } })
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  return documents.map((document) => ({
    id: document._id!.toHexString(),
    kind: document.kind,
    prompt_id: document.prompt_id ?? null,
    sender_name: document.sender_name,
    status: document.status,
    refusal_reason: document.refusal_reason ?? null,
    created_at: document.created_at.toISOString(),
    is_mine: document.username === username,
  }));
}

type TerminalDocument = {
  session_id: string;
  prompt_id: string;
  step: TerminalStep;
  sequence: number;
  created_at: Date;
  encryption_version: number;
  nonce: Binary;
  ciphertext: Binary;
};

/** Encrypted output of Claude for one prompt, after the chunk `afterSequence`. */
export async function listTerminalChunks(
  sessionId: string,
  promptId: string,
  afterSequence: number,
): Promise<EncryptedTerminalChunk[]> {
  if (!SESSION_ID_PATTERN.test(sessionId) || !PROMPT_ID_PATTERN.test(promptId)) {
    return [];
  }
  const database = await getDatabase();
  const documents = await database
    .collection<TerminalDocument>(PROMPT_TERMINAL_COLLECTION)
    .find({ session_id: sessionId, prompt_id: promptId, sequence: { $gt: afterSequence } })
    .sort({ sequence: 1 })
    .limit(TERMINAL_CHUNKS_PER_REQUEST)
    .toArray();
  return documents.map((document) => ({
    sequence: document.sequence,
    step: document.step,
    created_at: document.created_at.toISOString(),
    encryption_version: document.encryption_version,
    nonce: toBase64(document.nonce),
    ciphertext: toBase64(document.ciphertext),
  }));
}
