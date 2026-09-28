import type { LoginResult } from '@/types/auth';

export function createMockTokenResult(): LoginResult {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let tokenValue = '';
  for (let index = 0; index < 64; index += 1) {
    tokenValue += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return {
    tokenValue,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

export function createMockSilentLoginResult(): LoginResult {
  const result = createMockTokenResult();
  if (Math.random() > 0.5) {
    result.tokenValue = `anonymous_${result.tokenValue}`;
  }
  return result;
}
