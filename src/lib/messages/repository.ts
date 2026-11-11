import "server-only";

import { ObjectId, type Binary, type Filter } from "mongodb";

import type { EncryptedData } from "@/lib/encryption/decryption";

import { getDatabase } from "./database";
import {
  PAGE_SIZE,
  VIEW_STATUSES,
  type MessagePage,
  type MessageStatus,
  type MessageView,
} from "./statuses";

/**
 * Read-only access to the queue: this project never inserts, updates or deletes messages. Callers
 * must check the session before calling any function here.
 */
const MESSAGES_COLLECTION = "messages";
const SETTINGS_COLLECTION = "settings";
const KEY_CHECK_ID = "key_check";

type MessageDocument = {
  _id: ObjectId;
  source: string;
  status: MessageStatus;
  encryption_version: number;
  nonce: Binary;
  ciphertext: Binary;
  attempts: number;
  error: string | null;
  created_at: Date;
  updated_at: Date;
  validated_at?: Date | null;
  sent_at?: Date | null;
  next_attempt_at?: Date | null;
};

type SettingsDocument = {
  _id: string;
  nonce: Binary;
  ciphertext: Binary;
};

export type MessageQuery = {
  view: MessageView;
  status?: MessageStatus;
  source?: string;
  page: number;
};

function toIsoString(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export async function listMessages(query: MessageQuery): Promise<MessagePage> {
  const database = await getDatabase();
  const messages = database.collection<MessageDocument>(MESSAGES_COLLECTION);
  const viewStatuses: readonly MessageStatus[] = VIEW_STATUSES[query.view];

  const filter: Filter<MessageDocument> = {
    status: query.status ? query.status : { $in: [...viewStatuses] },
  };
  if (query.source) {
    filter.source = query.source;
  }

  const [documents, total, sources] = await Promise.all([
    messages
      .find(filter, { projection: { nonce: 0, ciphertext: 0 } })
      .sort({ created_at: -1, _id: -1 })
      .skip((query.page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
    messages.countDocuments(filter),
    messages.distinct("source", { status: { $in: [...viewStatuses] } }),
  ]);

  return {
    messages: documents.map((document) => ({
      id: document._id.toHexString(),
      source: document.source,
      status: document.status,
      attempts: document.attempts ?? 0,
      error: document.error ?? null,
      created_at: document.created_at.toISOString(),
      updated_at: document.updated_at.toISOString(),
      validated_at: toIsoString(document.validated_at),
      sent_at: toIsoString(document.sent_at),
      next_attempt_at: toIsoString(document.next_attempt_at),
    })),
    total,
    page: query.page,
    page_size: PAGE_SIZE,
    sources: (sources as string[]).sort(),
  };
}

export type EncryptedMessage = EncryptedData & { encryptionVersion: number };

/** Returns null when the id is invalid or the message does not exist (anymore: TTL index). */
export async function getEncryptedMessage(messageId: string): Promise<EncryptedMessage | null> {
  if (!ObjectId.isValid(messageId) || messageId.length !== 24) {
    return null;
  }
  const database = await getDatabase();
  const document = await database
    .collection<MessageDocument>(MESSAGES_COLLECTION)
    .findOne(
      { _id: new ObjectId(messageId) },
      { projection: { nonce: 1, ciphertext: 1, encryption_version: 1 } },
    );
  if (!document) {
    return null;
  }
  return {
    encryptionVersion: document.encryption_version,
    nonceBase64: Buffer.from(document.nonce.buffer).toString("base64"),
    ciphertextBase64: Buffer.from(document.ciphertext.buffer).toString("base64"),
  };
}

/** Returns null when the validator never started (no key check written yet). */
export async function getKeyCheck(): Promise<EncryptedData | null> {
  const database = await getDatabase();
  const document = await database
    .collection<SettingsDocument>(SETTINGS_COLLECTION)
    .findOne({ _id: KEY_CHECK_ID });
  if (!document) {
    return null;
  }
  return {
    nonceBase64: Buffer.from(document.nonce.buffer).toString("base64"),
    ciphertextBase64: Buffer.from(document.ciphertext.buffer).toString("base64"),
  };
}
