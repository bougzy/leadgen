// Authentication library for LeadGen
// Uses Node.js crypto for password hashing and jose for JWT tokens

import { pbkdf2Sync, randomBytes } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'leadgen-session';

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

// --------------- Password Hashing ---------------

export function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return hash === storedHash;
}

// --------------- JWT Sessions ---------------

function getJwtSecret(): Uint8Array {
  const key = process.env.ENCRYPTION_KEY || 'b49191699185b32bc97228352f3219d8f2b9c6e836ad3a27a454c06ede0e4d45';
  return new TextEncoder().encode(key);
}

export async function createSession(): Promise<string> {
  const secret = getJwtSecret();
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject('leadgen-user')
    .sign(secret);
  return token;
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    const secret = getJwtSecret();
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}
