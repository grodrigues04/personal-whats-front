import { jsonResponse, unauthorizedResponseIfNoSession } from "@/lib/auth/api";
import { getEncryptedPrompts } from "@/lib/prompt-sessions/repository";
import { SESSION_ID_PATTERN } from "@/lib/prompt-sessions/statuses";

/** Nonce and ciphertext of every prompt of one session, decrypted only in the browser. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/prompt-sessions/[sessionId]/encrypted">,
): Promise<Response> {
  const unauthorizedResponse = await unauthorizedResponseIfNoSession();
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const { sessionId } = await context.params;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return jsonResponse({ error: "Sessão inválida" }, 400);
  }
  try {
    const encryptedPrompts = await getEncryptedPrompts(sessionId);
    if (!encryptedPrompts) {
      return jsonResponse({ error: "Sessão não encontrada" }, 404);
    }
    return jsonResponse({
      prompts: encryptedPrompts.map((encryptedPrompt) => ({
        id: encryptedPrompt.id,
        encryption_version: encryptedPrompt.encryptionVersion,
        nonce: encryptedPrompt.nonceBase64,
        ciphertext: encryptedPrompt.ciphertextBase64,
      })),
    });
  } catch (error) {
    console.error(`Failed to read prompt session ${sessionId}`, error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}
