import { jwtVerify, SignJWT } from "jose";

import { ROLES, type Role, type User } from "./users";

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
  name: string;
  role: Role;
  expiresAt: Date;
};

function encodeSecret(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must have at least ${MINIMUM_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  user: Pick<User, "username" | "name" | "role">,
  secret: string | undefined,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(user.username)
    .setIssuer(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_DURATION_SECONDS)
    .sign(encodeSecret(secret));
}

/**
 * Returns null for a missing, expired, tampered or otherwise invalid token. Tokens from before the
 * roles existed have no role and are invalid: the user logs in again.
 */
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
    const { name, role } = payload;
    if (
      !payload.sub ||
      !payload.exp ||
      typeof name !== "string" ||
      !ROLES.includes(role as Role)
    ) {
      return null;
    }
    return {
      username: payload.sub,
      name,
      role: role as Role,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    return null;
  }
}
