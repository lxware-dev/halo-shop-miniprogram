import type { CustomerDigitalResourceUcResponse } from '@halo-dev/api-client';
import { useAppConfig } from '@/config';
import { ensureSessionInitialized, refreshSession } from '@/services/session';
import { useUserStore } from '@/store';

const DOCUMENT_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const FILE_EXTENSION_PATTERN = /\.([a-z0-9]+)(?:[?#].*)?$/i;
const TRAILING_SLASH_PATTERN = /\/$/;

function resourceExtension(resource: CustomerDigitalResourceUcResponse) {
  const name = resource.resourceName ?? resource.resourceUrl ?? '';
  return FILE_EXTENSION_PATTERN.exec(name)?.[1]?.toLowerCase() ?? '';
}

function downloadUrl(publicId: string) {
  const baseURL = useAppConfig().halo.baseURL.replace(TRAILING_SLASH_PATTERN, '');
  return `${baseURL}/apis/uc.api.ecommerce.halo.run/v1alpha1/digital-resources/${encodeURIComponent(publicId)}/download`;
}

function downloadWithCredential(url: string, credential: string) {
  return new Promise<{ tempFilePath: string; statusCode: number }>((resolve, reject) => {
    uni.downloadFile({
      url,
      header: {
        Authorization: credential,
        'X-Sales-Channel': 'MINI_PROGRAM',
      },
      success: resolve,
      fail: reject,
    });
  });
}

function openDocument(filePath: string, fileType: string) {
  return new Promise<void>((resolve, reject) => {
    uni.openDocument({
      filePath,
      fileType,
      showMenu: true,
      success: () => resolve(),
      fail: reject,
    });
  });
}

function previewImage(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    uni.previewImage({
      urls: [filePath],
      current: filePath,
      success: () => resolve(),
      fail: reject,
    });
  });
}

function shareFile(filePath: string, fileName?: string) {
  return new Promise<void>((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.shareFileMessage({
      filePath,
      fileName,
      success: () => resolve(),
      fail: reject,
    });
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('Unsupported file type on this platform'));
    // #endif
  });
}

/** Validate purchase through Pro before downloading the temporary file. */
export async function openPurchasedDigitalResource(resource: CustomerDigitalResourceUcResponse) {
  if (import.meta.env.VITE_MOCK_ENABLED === 'true') {
    throw new Error('Mock resources do not provide downloadable files');
  }
  if (!resource.publicId) {
    throw new Error('Missing digital resource publicId');
  }

  await ensureSessionInitialized();
  const url = downloadUrl(resource.publicId);
  let response = await downloadWithCredential(url, useUserStore().credential);
  if (response.statusCode === 401) {
    await refreshSession();
    response = await downloadWithCredential(url, useUserStore().credential);
  }
  if (response.statusCode !== 200 || !response.tempFilePath) {
    throw new Error(`Digital resource download failed: ${response.statusCode}`);
  }

  const extension = resourceExtension(resource);
  if (IMAGE_EXTENSIONS.has(extension)) {
    await previewImage(response.tempFilePath);
  } else if (DOCUMENT_EXTENSIONS.has(extension)) {
    await openDocument(response.tempFilePath, extension);
  } else {
    await shareFile(response.tempFilePath, resource.resourceName);
  }
}
