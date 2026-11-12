import { verifyPassword } from "./password";
import { normalizeUsername, type User } from "./users";

// Checked when the username does not exist, so a wrong username takes as long as a wrong password
const UNKNOWN_USER_HASH =
  "scrypt:65536:8:1:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/** Returns the user when the username and the password match, null otherwise. */
export async function verifyCredentials(
  username: string,
  password: string,
  users: User[],
): Promise<User | null> {
  const normalizedUsername = normalizeUsername(username);
  const user = users.find((candidate) => candidate.username === normalizedUsername);
  const isPasswordValid = await verifyPassword(password, user?.passwordHash ?? UNKNOWN_USER_HASH);
  return user && isPasswordValid ? user : null;
}
