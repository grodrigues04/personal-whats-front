import { jsonResponse, unauthorizedResponseIfNoSession } from "@/lib/auth/api";
import { getPromptKeyCheck } from "@/lib/prompt-sessions/repository";

/** Key check of the prompts, written by prompt_automator: confirms the password of the prompts. */
export async function GET(): Promise<Response> {
  const unauthorizedResponse = await unauthorizedResponseIfNoSession();
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const keyCheck = await getPromptKeyCheck();
    if (!keyCheck) {
      return jsonResponse(
        { error: "A verificação da senha dos prompts não existe: o prompt_automator nunca subiu" },
        404,
      );
    }
    return jsonResponse({ nonce: keyCheck.nonceBase64, ciphertext: keyCheck.ciphertextBase64 });
  } catch (error) {
    console.error("Failed to read the prompt key check", error);
    return jsonResponse({ error: "Não foi possível consultar o MongoDB" }, 502);
  }
}
