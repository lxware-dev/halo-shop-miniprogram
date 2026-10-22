import type { LoginMethod } from '@/config/types';

const supportedMethods = new Set<LoginMethod>(['phoneQuick', 'haloAccount']);

function isLoginMethod(value: unknown): value is LoginMethod {
  return typeof value === 'string' && supportedMethods.has(value as LoginMethod);
}

/** Keep older local configuration from exposing login routes Halo Pro does not provide. */
export function normalizeLoginMethods(value: unknown): {
  primary: LoginMethod;
  supported: LoginMethod[];
} {
  const input = value && typeof value === 'object' ? value : {};
  const primary = 'primary' in input ? input.primary : undefined;
  const alternatives =
    'supported' in input && Array.isArray(input.supported)
      ? [...new Set(input.supported.filter(isLoginMethod))]
      : [];
  // Account login does not enable phone registration when a legacy configuration is invalid.
  const selected = isLoginMethod(primary) ? primary : (alternatives[0] ?? 'haloAccount');
  return { primary: selected, supported: alternatives.filter((method) => method !== selected) };
}
