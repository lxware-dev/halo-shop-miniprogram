import { alovaInst } from '@/utils/request';
import type {
  LoginResult,
  PhoneCodeLoginRequest,
  EmailLoginRequest,
  HaloAccountLoginRequest,
  SendCodeRequest,
} from '@/types/auth';
import { getPlatform } from '@/helpers/platform';

const api = alovaInst;
const platform = getPlatform();

export const authApi = {
  /**
   * Exchange Mini Program code for a token
   * Send the code returned by uni.login() to the backend to obtain either a bound-user token or an anonymous token
   */
  silentLogin: (loginCode: string, params?: Record<string, any>) => {
    return api.Post<LoginResult>(
      `/login/mp/${platform}`,
      { code: loginCode, ...(params ?? {}) },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        meta: { skipAuthInit: true },
      },
    );
  },

  /**
   * One-tap phone login (WeChat quick phone-number component, MP-WEIXIN only)
   * phoneCode comes from the WeChat getPhoneNumber callback; the request only needs the current token
   */
  loginByPhoneQuick: (code: string) =>
    api.Post<LoginResult>(
      `/login/mp/${platform}/phone-quick`,
      { code },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    ),

  /**
   * Phone number + SMS verification code login
   */
  loginByPhoneCode: (params: PhoneCodeLoginRequest) =>
    api.Post<LoginResult>(`/login/mp/${platform}/phone-code`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }),

  /**
   * Email + verification code login
   */
  loginByEmail: (params: EmailLoginRequest) =>
    api.Post<LoginResult>(`/login/mp/${platform}/email`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }),

  /**
   * Account/password login
   */
  loginByHaloAccount: (params: HaloAccountLoginRequest) =>
    api.Post<LoginResult>(`/login/mp/${platform}/username`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }),

  /**
   * Send SMS or email verification code
   */
  sendCode: (params: SendCodeRequest) => api.Post<void>(`/login/send-code`, params),
};
