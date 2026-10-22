import 'alova';

declare module 'alova' {
  interface AlovaCustomTypes {
    meta: {
      /**
       * Skip waiting for the initial session initialization.
       * Used only for requests fired by initialization itself, to avoid a deadlock in beforeRequest.
       */
      skipAuthInit?: boolean;
    };
  }
}

/**
 * Authentication-related type definitions
 */

/**
 * Responses returned after each login method succeeds
 */
export interface LoginResult {
  tokenValue?: string;
  expiresAt?: string;
}

/** Account/password login request */
export interface HaloAccountLoginRequest {
  username: string;
  password: string;
}

/** Shared props for all login-method components */
export interface LoginMethodProps {
  /** Whether the agreements are checked (managed by LoginDrawer) */
  agreed: boolean;
}

/** Shared emits for all login-method components */
export interface LoginMethodEmits {
  /** Emitted on successful login, carrying LoginResult */
  success: [result: LoginResult];
}
