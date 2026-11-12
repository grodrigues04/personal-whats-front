import { authenticate, jsonResponse } from "@/lib/auth/api";
import { validateInput } from "@/lib/prompt-sessions/inputs";
import {
  countPendingInputs,
  getPromptSessionState,
  insertPromptInput,
  listPromptInputs,
} from "@/lib/prompt-sessions/repository";
import { SESSION_ID_PATTERN } from "@/lib/prompt-sessions/statuses";
import { ENCRYPTION_VERSION } from "@/lib/encryption/decryption";

// prompt_automator reads the inputs every 5 seconds: more than this waiting means something is off
const MAXIMUM_PENDING_INPUTS_PER_USER = 3;

type Context = RouteContext<"/api/prompt-sessions/[sessionId]/inputs">;

/** Prompts and answers sent through the frontend to one session, without content. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  const authentication = await authenticate();
  if ("response" in authentication) {
    return authentication.response;
  }

  const { sessionId } = await context.params;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return jsonResponse({ error: "Sessão inválida" }, 400);
  }
  try {
    return jsonResponse({
      inputs: await listPromptInputs(sessionId, authentication.session.username),
    });
  } catch (error) {
    console.error(`Failed to list the inputs of session ${sessionId}`, error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}

/**
 * A prompt or an answer, encrypted in the browser. Who sent it comes from the login, never from the
 * body. prompt_automator checks it again (duplicates, limit) and marks it accepted or refused.
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  const authentication = await authenticate();
  if ("response" in authentication) {
    return authentication.response;
  }
  const { session } = authentication;

  const { sessionId } = await context.params;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return jsonResponse({ error: "Sessão inválida" }, 400);
  }
  const body = await request.json().catch(() => null);

  try {
    const sessionState = await getPromptSessionState(sessionId);
    if (!sessionState) {
      return jsonResponse({ error: "Sessão não encontrada" }, 404);
    }
    const validation = validateInput(body, sessionState);
    if ("error" in validation) {
      return jsonResponse({ error: validation.error }, 400);
    }
    if ((await countPendingInputs(sessionId, session.username)) >= MAXIMUM_PENDING_INPUTS_PER_USER) {
      return jsonResponse(
        { error: "Você já tem envios esperando o prompt_automator. Aguarde alguns segundos." },
        429,
      );
    }
    const inputId = await insertPromptInput({
      sessionId,
      kind: validation.input.kind,
      promptId: validation.input.promptId,
      username: session.username,
      senderName: session.name,
      expiresAt: sessionState.recordsExpireAt,
      encryptionVersion: ENCRYPTION_VERSION,
      nonce: validation.input.nonce,
      ciphertext: validation.input.ciphertext,
    });
    return jsonResponse({ id: inputId }, 201);
  } catch (error) {
    console.error(`Failed to save an input of session ${sessionId}`, error);
    return jsonResponse({ error: "Não foi possível gravar no MongoDB" }, 502);
  }
}
