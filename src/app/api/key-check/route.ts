import { jsonResponse, unauthorizedResponseIfNoSession } from "@/lib/auth/api";
import { getKeyCheck } from "@/lib/messages/repository";

/** Key check written by the validator: the browser decrypts it to confirm the typed password. */
export async function GET(): Promise<Response> {
  const unauthorizedResponse = await unauthorizedResponseIfNoSession();
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const keyCheck = await getKeyCheck();
    if (!keyCheck) {
      return jsonResponse(
        { error: "A verificação de senha não existe: o validator do personalWhats nunca subiu" },
        404,
      );
    }
    return jsonResponse({ nonce: keyCheck.nonceBase64, ciphertext: keyCheck.ciphertextBase64 });
  } catch (error) {
    console.error("Failed to read the key check", error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}
