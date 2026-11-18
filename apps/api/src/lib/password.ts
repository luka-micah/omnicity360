// Password hashing utilities
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Basic password policy check (server-side) */
export function validatePasswordStrength(password: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (password.length < 8) reasons.push('Must be at least 8 characters');
  if (password.length > 128) reasons.push('Must be at most 128 characters');
  if (!/[a-z]/.test(password)) reasons.push('Must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) reasons.push('Must contain an uppercase letter');
  if (!/[0-9]/.test(password)) reasons.push('Must contain a number');
  return { valid: reasons.length === 0, reasons };
}
