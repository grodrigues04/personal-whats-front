import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hash stored in AUTH_PASSWORD_HASH:
 * `scrypt:<cost>:<block size>:<parallelization>:<salt base64>:<hash base64>`. The separator is not `$`
 * because Next.js expands `$NAME` inside .env files.
 */
const HASH_PREFIX = "scrypt";
const DEFAULT_COST = 2 ** 16;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;
const SALT_SIZE = 16;
const HASH_SIZE = 32;

function deriveHash(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  const memoryNeeded = 128 * (options.N ?? DEFAULT_COST) * (options.r ?? DEFAULT_BLOCK_SIZE);
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFC"),
      salt,
      HASH_SIZE,
      { ...options, maxmem: memoryNeeded * 2 },
      (error, hash) => (error ? reject(error) : resolve(hash)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new Error("password is required");
  }
  const salt = randomBytes(SALT_SIZE);
  const hash = await deriveHash(password, salt, {
    N: DEFAULT_COST,
    r: DEFAULT_BLOCK_SIZE,
    p: DEFAULT_PARALLELIZATION,
  });
  return [
    HASH_PREFIX,
    DEFAULT_COST,
    DEFAULT_BLOCK_SIZE,
    DEFAULT_PARALLELIZATION,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join(":");
}

/** Returns false for a wrong password or a malformed stored hash. Compares in constant time. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.trim().split(":");
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) {
    return false;
  }
  const [, cost, blockSize, parallelization, saltBase64, hashBase64] = parts;
  const expectedHash = Buffer.from(hashBase64, "base64");
  const options = { N: Number(cost), r: Number(blockSize), p: Number(parallelization) };
  if (expectedHash.length === 0 || !Object.values(options).every(Number.isSafeInteger)) {
    return false;
  }
  try {
    const hash = await deriveHash(password, Buffer.from(saltBase64, "base64"), options);
    return hash.length === expectedHash.length && timingSafeEqual(hash, expectedHash);
  } catch {
    return false;
  }
}
