export interface PageShareOptions {
  title: string;
  path: string;
  imageUrl?: string;
  query?: string;
}

type PageShareResolver = () => PageShareOptions;

function normalizeSharePath(path: string): string {
  if (!path) {
    return '/pages/home/index';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function resolveTimelineQuery(path: string, query?: string): string {
  if (query) {
    return query;
  }
  const normalizedPath = normalizeSharePath(path);
  const [, search = ''] = normalizedPath.split('?');
  return search;
}

export function usePageShare(resolveShareOptions: PageShareResolver) {
  function showShareMenu() {
    // #ifdef MP-WEIXIN
    uni.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline'],
    });
    // #endif
  }

  function createShareAppMessage() {
    const options = resolveShareOptions();

    return {
      title: options.title,
      path: normalizeSharePath(options.path),
      imageUrl: options.imageUrl || undefined,
    };
  }

  function createShareTimeline() {
    const options = resolveShareOptions();

    return {
      title: options.title,
      query: resolveTimelineQuery(options.path, options.query),
      imageUrl: options.imageUrl || undefined,
    };
  }

  return {
    showShareMenu,
    createShareAppMessage,
    createShareTimeline,
  };
}
