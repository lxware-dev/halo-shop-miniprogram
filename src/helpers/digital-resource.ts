import type { CustomerDigitalResourceUcResponse } from '@halo-dev/api-client';
import { useAppConfig } from '@/config';
import { ensureSessionInitialized, refreshSession } from '@/services/session';
import { useUserStore } from '@/store';
import { validHttpsResourceUrl } from '@/helpers/resource-url';

const DOCUMENT_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz']);
const WEB_PAGE_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'shtml',
  'php',
  'asp',
  'aspx',
  'jsp',
  'cgi',
  'cfm',
  'do',
  'action',
]);
const FILE_EXTENSION_PATTERN = /\.([a-z0-9]+)$/i;
const RESOURCE_URL_PATH_PATTERN = /^https:\/\/[^/?#]+([^?#]*)/i;
const FILE_NAME_PATH_SEPARATOR_PATTERN = /[/\\]/g;
const TRAILING_SLASH_PATTERN = /\/$/;

function fileExtension(fileName?: string) {
  return FILE_EXTENSION_PATTERN.exec(fileName?.trim() ?? '')?.[1]?.toLowerCase() ?? '';
}

function resourceUrlFileName(url?: string) {
  const path = RESOURCE_URL_PATH_PATTERN.exec(url?.trim() ?? '')?.[1] ?? '';
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(fileName).replace(FILE_NAME_PATH_SEPARATOR_PATTERN, '_');
  } catch {
    return fileName;
  }
}

function resourceExtension(resource: CustomerDigitalResourceUcResponse) {
  const nameExtension = fileExtension(resource.resourceName);
  if (resource.resourceType !== 'STATIC_URL') {
    return nameExtension;
  }
  const urlExtension = fileExtension(resourceUrlFileName(resource.resourceUrl));
  if (urlExtension) {
    return urlExtension;
  }
  // Opaque download URLs can still use a recognizable file name, but display
  // names such as "Manual v1.0" must not turn a web page into a file download.
  return DOCUMENT_EXTENSIONS.has(nameExtension) ||
    IMAGE_EXTENSIONS.has(nameExtension) ||
    ARCHIVE_EXTENSIONS.has(nameExtension)
    ? nameExtension
    : '';
}

function resourceFileName(resource: CustomerDigitalResourceUcResponse, extension: string) {
  const name = resource.resourceName?.trim();
  if (name && fileExtension(name) === extension) {
    return name;
  }
  const urlFileName = resourceUrlFileName(resource.resourceUrl);
  if (urlFileName && fileExtension(urlFileName) === extension) {
    return urlFileName;
  }
  return name;
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

function openDownloadedFile(
  filePath: string,
  extension: string,
  resource: CustomerDigitalResourceUcResponse,
) {
  if (IMAGE_EXTENSIONS.has(extension)) {
    return previewImage(filePath);
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return openDocument(filePath, extension);
  }
  return shareFile(filePath, resourceFileName(resource, extension));
}

/** Validate purchase through Pro before downloading the temporary file. */
export async function openPurchasedDigitalResource(resource: CustomerDigitalResourceUcResponse) {
  if (import.meta.env.VITE_MOCK_ENABLED === 'true' && resource.resourceType !== 'STATIC_URL') {
    throw new Error('Mock resources do not provide downloadable files');
  }
  if (resource.resourceType === 'STATIC_URL') {
    const url = staticResourceUrl(resource);
    const extension = resourceExtension(resource);
    if (!extension || WEB_PAGE_EXTENSIONS.has(extension)) {
      await openWebResource(url, resource.resourceName ?? '');
      return;
    }
    const response = await downloadPublicFile(url);
    if (response.statusCode !== 200 || !response.tempFilePath) {
      throw new Error(`Digital resource download failed: ${response.statusCode}`);
    }
    await openDownloadedFile(response.tempFilePath, extension, resource);
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

  await openDownloadedFile(response.tempFilePath, resourceExtension(resource), resource);
}
