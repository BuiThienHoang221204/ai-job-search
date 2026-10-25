import { randomBytes } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export const newReferralCode = () =>
  [...randomBytes(CODE_LENGTH)]
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join('');
