import { jwtVerify, SignJWT } from "jose";

/**
 * Session token: JWT HS256 signed with AUTH_SECRET. Kept free of Next.js imports so it runs in the
 * proxy, in route handlers and in the tests.
 */
export const SESSION_COOKIE_NAME = "personal_whats_session";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const ALGORITHM = "HS256";
const ISSUER = "personal-whats-front";
const MINIMUM_SECRET_LENGTH = 32;

export type Session = {
  username: string;
  expiresAt: Date;
};

function encodeSecret(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must have at least ${MINIMUM_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  username: string,
  secret: string | undefined,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(username)
    .setIssuer(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_DURATION_SECONDS)
    .sign(encodeSecret(secret));
}

/** Returns null for a missing, expired, tampered or otherwise invalid token. */
export async function verifySession(
  token: string | undefined,
  secret: string | undefined,
  now: Date = new Date(),
): Promise<Session | null> {
  if (!token) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, encodeSecret(secret), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      currentDate: now,
    });
    if (!payload.sub || !payload.exp) {
      return null;
    }
    return { username: payload.sub, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}
