import "server-only";

import { ObjectId, type Binary } from "mongodb";

import type { EncryptedData } from "@/lib/encryption/decryption";
import { getDatabase } from "@/lib/messages/database";
import { PAGE_SIZE } from "@/lib/messages/statuses";

import {
  SESSION_ID_PATTERN,
  type PromptSessionPage,
  type PromptSessionStatus,
  type PromptStatus,
} from "./statuses";

/**
 * Read-only access to the prompt sessions written by prompt_automator: this project never inserts,
 * updates or deletes them. Callers must check the session before calling any function here.
 */
const PROMPT_SESSIONS_COLLECTION = "prompt_sessions";

type PromptDocument = {
  id: string;
  status: PromptStatus;
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
  prompts: PromptDocument[];
  created_at: Date;
  updated_at: Date;
};

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
      prompts: (document.prompts ?? []).map((prompt) => ({
        id: prompt.id,
        status: prompt.status,
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
