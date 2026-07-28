const crypto = require('crypto');

const ENCRYPTED_VALUE_PREFIX = 'seenary:v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;

function parseEncryptionKey(value) {
  const encoded = String(value || '').trim();
  if (!encoded) return null;

  const key = /^[0-9a-f]{64}$/i.test(encoded)
    ? Buffer.from(encoded, 'hex')
    : Buffer.from(encoded, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a base64 or hexadecimal encoded 32-byte key.'
    );
  }

  return key;
}

const encryptionKey = parseEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY);

if (!encryptionKey && process.env.NODE_ENV === 'production') {
  throw new Error('TOKEN_ENCRYPTION_KEY must be configured in production.');
}

function isEncryptedSecret(value) {
  return String(value || '').startsWith(ENCRYPTED_VALUE_PREFIX);
}

function encryptSecret(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isEncryptedSecret(value)) return value;
  if (!encryptionKey) return String(value);

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    `${ENCRYPTED_VALUE_PREFIX}${iv.toString('base64url')}`,
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

function decryptSecret(value) {
  if (value === null || value === undefined || value === '') return value;
  if (!isEncryptedSecret(value)) return String(value);
  if (!encryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required to decrypt stored OAuth tokens.');
  }

  const parts = String(value).slice(ENCRYPTED_VALUE_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Stored OAuth token has an invalid encrypted format.');
  }

  const [iv, authTag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
};
