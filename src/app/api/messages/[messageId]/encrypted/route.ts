import { jsonResponse, unauthorizedResponseIfNoSession } from "@/lib/auth/api";
import { getEncryptedMessage } from "@/lib/messages/repository";

/** Nonce and ciphertext of one message, decrypted only in the browser. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/messages/[messageId]/encrypted">,
): Promise<Response> {
  const unauthorizedResponse = await unauthorizedResponseIfNoSession();
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const { messageId } = await context.params;
  try {
    const encryptedMessage = await getEncryptedMessage(messageId);
    if (!encryptedMessage) {
      return jsonResponse({ error: "Mensagem não encontrada" }, 404);
    }
    return jsonResponse({
      encryption_version: encryptedMessage.encryptionVersion,
      nonce: encryptedMessage.nonceBase64,
      ciphertext: encryptedMessage.ciphertextBase64,
    });
  } catch (error) {
    console.error(`Failed to read message ${messageId}`, error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}
