import { createHash, timingSafeEqual } from "node:crypto";

import { verifyPassword } from "./password";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value.normalize("NFC")).digest();
}

/**
 * Checks the single user configured by AUTH_USERNAME and AUTH_PASSWORD_HASH. The password hash is
 * always computed, so a wrong username takes as long as a wrong password.
 */
export async function verifyCredentials(
  username: string,
  password: string,
  expectedUsername: string | undefined,
  expectedPasswordHash: string | undefined,
): Promise<boolean> {
  if (!expectedUsername || !expectedPasswordHash) {
    throw new Error("AUTH_USERNAME and AUTH_PASSWORD_HASH must be configured");
  }
  const isUsernameValid = timingSafeEqual(sha256(username), sha256(expectedUsername));
  const isPasswordValid = await verifyPassword(password, expectedPasswordHash);
  return isUsernameValid && isPasswordValid;
}
