import crypto from 'crypto';

export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};
