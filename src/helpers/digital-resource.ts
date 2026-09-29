import type { CustomerDigitalResourceUcResponse } from '@halo-dev/api-client';
import { useAppConfig } from '@/config';
import { ensureSessionInitialized, refreshSession } from '@/services/session';
import { useUserStore } from '@/store';
import { validHttpsResourceUrl } from '@/helpers/resource-url';

const DOCUMENT_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const FILE_EXTENSION_PATTERN = /\.([a-z0-9]+)(?:[?#].*)?$/i;
const TRAILING_SLASH_PATTERN = /\/$/;

function resourceExtension(resource: CustomerDigitalResourceUcResponse) {
  return (
    FILE_EXTENSION_PATTERN.exec(resource.resourceName ?? '')?.[1]?.toLowerCase() ??
    FILE_EXTENSION_PATTERN.exec(resource.resourceUrl ?? '')?.[1]?.toLowerCase() ??
    ''
  );
}

function staticResourceUrl(resource: CustomerDigitalResourceUcResponse) {
  const url = validHttpsResourceUrl(resource.resourceUrl);
  if (!url) {
    throw new Error('Invalid digital resource URL');
  }
  return url;
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

function downloadPublicFile(url: string) {
  return new Promise<{ tempFilePath: string; statusCode: number }>((resolve, reject) => {
    uni.downloadFile({ url, success: resolve, fail: reject });
  });
}

function openWebResource(url: string, title: string) {
  return new Promise<void>((resolve, reject) => {
    uni.navigateTo({
      url: `/subpkg-common/webview/index?resourceUrl=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
      success: () => resolve(),
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
  if (import.meta.env.VITE_MOCK_ENABLED === 'true' && resource.resourceType !== 'STATIC_URL') {
    throw new Error('Mock resources do not provide downloadable files');
  }
  if (resource.resourceType === 'STATIC_URL') {
    const url = staticResourceUrl(resource);
    const extension = resourceExtension(resource);
    if (!DOCUMENT_EXTENSIONS.has(extension) && !IMAGE_EXTENSIONS.has(extension)) {
      await openWebResource(url, resource.resourceName ?? '');
      return;
    }
    try {
      const response = await downloadPublicFile(url);
      if (response.statusCode !== 200 || !response.tempFilePath) {
        throw new Error(`Digital resource download failed: ${response.statusCode}`);
      }
      if (IMAGE_EXTENSIONS.has(extension)) {
        await previewImage(response.tempFilePath);
      } else {
        await openDocument(response.tempFilePath, extension);
      }
    } catch {
      await openWebResource(url, resource.resourceName ?? '');
    }
    return;
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
