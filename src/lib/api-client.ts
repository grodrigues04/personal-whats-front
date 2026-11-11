/** Browser side calls to the route handlers. A 401 means the session expired: back to login. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (response.status === 401) {
    // Full navigation on purpose: drops the in-memory key and every decrypted message
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new ApiError("Sessão expirada", 401);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.error ?? `Erro ${response.status}`, response.status);
  }
  return body as T;
}

export type EncryptedResponse = { nonce: string; ciphertext: string; encryption_version?: number };
