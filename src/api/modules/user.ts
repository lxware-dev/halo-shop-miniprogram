import { useUserStore } from '@/store';
import { useAppConfig } from '@/config';
import { alovaInst } from '@/utils/request';
import type { DetailedUser, User } from '@halo-dev/api-client';

const api = alovaInst;
const TRAILING_SLASH_RE = /\/$/;

function getUploadErrorMessage(responseData: string, statusCode: number) {
  try {
    const parsed = JSON.parse(responseData) as {
      detail?: string;
      message?: string;
      title?: string;
    };
    return parsed.detail || parsed.message || parsed.title || `头像上传失败，状态码：${statusCode}`;
  } catch {
    return responseData || `头像上传失败，状态码：${statusCode}`;
  }
}

export const userApi = {
  /**
   * Fetch current logged-in user info
   */
  getProfile: (options: { skipAuthInit?: boolean } = {}) =>
    api.Get<DetailedUser>('/apis/api.console.halo.run/v1alpha1/users/-', {
      meta: {
        skipAuthInit: options.skipAuthInit ?? false,
      },
    }),

  /**
   * Update current user info (displayName, bio, etc.)
   */
  updateProfile: (payload: Partial<User['spec']>) => {
    const userStore = useUserStore();
    const { profile } = userStore;
    if (!profile) {
      throw new Error('User not found');
    }
    return api.Put<User>('/apis/api.console.halo.run/v1alpha1/users/-', {
      ...profile,
      spec: { ...profile.spec, ...payload },
    });
  },
  /**
   * Upload user avatar
   *
   * Uses uni.uploadFile directly since multipart/form-data is not supported by alova in mini-programs.
   * In mock mode, skips the actual upload and returns the temp path as the avatar URL.
   */
  uploadAvatar: (filePath: string): Promise<User> => {
    if (import.meta.env.VITE_MOCK_ENABLED === 'true') {
      return new Promise((resolve) => {
        setTimeout(() => {
          const userStore = useUserStore();
          const user = userStore.profile!;
          resolve({
            ...user,
            spec: { ...user.spec, avatar: filePath },
          });
        }, 400);
      });
    }

    const userStore = useUserStore();
    const { halo } = useAppConfig();
    const baseURL = halo.baseURL.replace(TRAILING_SLASH_RE, '');
    return new Promise<User>((resolve, reject) => {
      uni.uploadFile({
        url: `${baseURL}/apis/api.console.halo.run/v1alpha1/users/-/avatar`,
        filePath,
        name: 'file',
        header: {
          Accept: 'application/json, text/plain, */*',
          Authorization: userStore.credential,
          'X-Sales-Channel': 'MINI_PROGRAM',
        },
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(res.data) as User);
            } catch {
              reject(new Error('解析响应失败'));
            }
          } else {
            reject(new Error(getUploadErrorMessage(res.data, res.statusCode)));
          }
        },
        fail(err) {
          reject(err);
        },
      });
    });
  },
};
