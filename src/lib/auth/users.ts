/**
 * Users of the panel. Gustavo (AUTH_USERNAME and AUTH_PASSWORD_HASH) is the admin and sees
 * everything; the people of AUTH_PROMPT_USERS only see the Prompts tab. Kept free of Next.js
 * imports so it runs in the proxy, in route handlers and in the tests.
 *
 * AUTH_PROMPT_USERS is a JSON list:
 * `[{"username": "4899999999", "name": "Maria", "password_hash": "scrypt:..."}]`. A username made
 * of a phone number is compared without formatting, country code or the ninth digit, so
 * "+55 48 9 9999-9999" and "4899999999" are the same login.
 */
export const ROLES = ["admin", "prompts"] as const;

export type Role = (typeof ROLES)[number];

export type User = {
  username: string;
  name: string; // shown in the frontend and in the WhatsApp notices
  role: Role;
  passwordHash: string;
};

const PHONE_PATTERN = /^[\d\s()+.-]+$/;
const BRAZIL_COUNTRY_CODE = "55";
const MAXIMUM_NAME_LENGTH = 40;

/** Phone numbers become area code + 8 digits; any other username is only trimmed. */
export function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!PHONE_PATTERN.test(trimmed) || digits.length < 10) {
    return trimmed;
  }
  let number = digits;
  if (number.length >= 12 && number.startsWith(BRAZIL_COUNTRY_CODE)) {
    number = number.slice(BRAZIL_COUNTRY_CODE.length);
  }
  // Mobile numbers with the ninth digit: 48 9 9999-9999 -> 48 9999-9999
  if (number.length === 11 && number[2] === "9") {
    number = number.slice(0, 2) + number.slice(3);
  }
  return number;
}

type PromptUserEntry = { username?: unknown; name?: unknown; password_hash?: unknown };

function parsePromptUsers(value: string | undefined): User[] {
  if (!value?.trim()) {
    return [];
  }
  let entries: unknown;
  try {
    entries = JSON.parse(value);
  } catch {
    throw new Error("AUTH_PROMPT_USERS must be a JSON list");
  }
  if (!Array.isArray(entries)) {
    throw new Error("AUTH_PROMPT_USERS must be a JSON list");
  }
  return entries.map((entry: PromptUserEntry, index) => {
    const { username, name, password_hash: passwordHash } = entry ?? {};
    if (
      typeof username !== "string" ||
      !username.trim() ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > MAXIMUM_NAME_LENGTH ||
      typeof passwordHash !== "string" ||
      !passwordHash
    ) {
      throw new Error(`AUTH_PROMPT_USERS has an invalid user at position ${index}`);
    }
    return {
      username: normalizeUsername(username),
      name: name.trim(),
      role: "prompts" as const,
      passwordHash,
    };
  });
}

/** Throws when the admin is not configured or AUTH_PROMPT_USERS is malformed. */
export function loadUsers(environment: Record<string, string | undefined>): User[] {
  const adminUsername = environment.AUTH_USERNAME;
  const adminPasswordHash = environment.AUTH_PASSWORD_HASH;
  if (!adminUsername || !adminPasswordHash) {
    throw new Error("AUTH_USERNAME and AUTH_PASSWORD_HASH must be configured");
  }
  const users: User[] = [
    {
      username: normalizeUsername(adminUsername),
      name: environment.AUTH_NAME?.trim() || "Gustavo",
      role: "admin",
      passwordHash: adminPasswordHash,
    },
    ...parsePromptUsers(environment.AUTH_PROMPT_USERS),
  ];
  const usernames = new Set(users.map((user) => user.username));
  if (usernames.size !== users.length) {
    throw new Error("Two users have the same username");
  }
  return users;
}

/** Paths a user of the Prompts tab may open. Everything else is only for the admin. */
export function canAccessPath(role: Role, pathname: string): boolean {
  if (role === "admin") {
    return true;
  }
  return (
    pathname === "/prompts" ||
    pathname.startsWith("/api/prompt-sessions") ||
    pathname === "/api/prompt-key-check"
  );
}
