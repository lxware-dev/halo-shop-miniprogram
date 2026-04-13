import { useRequest as useAlovaRequest, usePagination } from 'alova/client';
import type { AlovaGenerics, Method } from 'alova';
import { ref, watch } from 'vue';
import type { Ref, WatchSource } from 'vue';
import { useAuth } from '@/hooks/useAuth';

type AnyMethod = Method<AlovaGenerics>;
type Nullable<T> = T | null;

interface QueryState<TData, TParams> {
  data: Ref<Nullable<TData>>;
  loading: Ref<boolean>;
  error: Ref<unknown>;
  params: Ref<Nullable<TParams>>;
  reset: () => void;
}

async function ensureMethodReady<AG extends AlovaGenerics>(method: Method<AG>) {
  if (method.meta?.skipAuthInit) {
    return;
  }

  const { init } = useAuth();
  await init();
}

export function sendRequest<AG extends AlovaGenerics>(
  method: Method<AG>,
): Promise<AG['Responded']> {
  return ensureMethodReady(method).then(() => method.send());
}

function createQueryState<TData, TParams>(): QueryState<TData, TParams> {
  const data = ref<TData | null>(null) as Ref<TData | null>;
  const loading = ref(false);
  const error = ref<unknown>(null);
  const params = ref<TParams | null>(null) as Ref<TParams | null>;

  function reset() {
    data.value = null;
    error.value = null;
  }

  return {
    data,
    loading,
    error,
    params,
    reset,
  };
}

function hasParams<TParams>(value: Nullable<TParams>): value is TParams {
  return value != null;
}

function setupAutoRun<TParams>(
  options: UseQueryOptions<TParams> | undefined,
  handlers: {
    params: Ref<Nullable<TParams>>;
    run: (params: TParams) => unknown;
    refresh: () => unknown;
  },
) {
  const initialParams = options?.initialParams;
  const hasInitialParams = initialParams != null;

  if (options?.watchingStates?.length) {
    watch(options.watchingStates, () => {
      if (hasParams(handlers.params.value)) {
        void handlers.refresh();
        return;
      }

      if (hasInitialParams) {
        void handlers.run(initialParams as TParams);
      }
    });
  }

  if ((options?.immediate ?? true) && hasInitialParams) {
    void handlers.run(initialParams as TParams);
  }
}

function createRequestTracker() {
  let latestRequestToken = 0;

  function createToken() {
    latestRequestToken += 1;
    return latestRequestToken;
  }

  function isLatest(token: number) {
    return token === latestRequestToken;
  }

  return {
    createToken,
    isLatest,
  };
}

/**
 * Single-shot data request
 * Used for detail pages and one-time loading scenarios
 */
export function useFetch<AG extends AlovaGenerics>(method: Method<AG>, immediate = true) {
  const request = useAlovaRequest(method, { immediate: false });
  const rawSend = request.send.bind(request);

  const send: typeof request.send = async (...args) => {
    await ensureMethodReady(method);
    return rawSend(...args);
  };

  if (immediate) {
    void send().catch(() => {});
  }

  return Object.assign(request, { send });
}

interface UseQueryOptions<TParams> {
  immediate?: boolean;
  initialParams?: TParams;
  watchingStates?: WatchSource<unknown>[];
}

/**
 * Generic query
 * Used for parameter-driven one-time queries and provides run / refresh / reset
 */
export function useQuery<TData, TParams = void>(
  methodFactory: (params: TParams) => AnyMethod,
  options?: UseQueryOptions<TParams>,
) {
  const { data, loading, error, params, reset } = createQueryState<TData, TParams>();

  async function run(nextParams: TParams) {
    params.value = nextParams;
    loading.value = true;
    error.value = null;
    try {
      const response = await sendRequest(methodFactory(nextParams));
      data.value = response;
      return response as TData;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function refresh() {
    if (!hasParams(params.value)) {
      return null;
    }

    return run(params.value);
  }

  setupAutoRun(options, { params, run, refresh });

  return {
    data,
    loading,
    error,
    params,
    run,
    refresh,
    reset,
  };
}

/**
 * Generic async query (supports any Promise and fits composed request scenarios)
 */
export function useAsyncQuery<TData, TParams = void>(
  queryFn: (params: TParams) => Promise<TData>,
  options?: UseQueryOptions<TParams>,
) {
  const { data, loading, error, params, reset } = createQueryState<TData, TParams>();
  const requestTracker = createRequestTracker();

  async function run(nextParams: TParams) {
    const requestToken = requestTracker.createToken();
    params.value = nextParams;
    loading.value = true;
    error.value = null;
    try {
      const response = await queryFn(nextParams);
      if (!requestTracker.isLatest(requestToken)) {
        return null;
      }

      data.value = response;
      return response;
    } catch (err) {
      if (!requestTracker.isLatest(requestToken)) {
        return null;
      }

      error.value = err;
      throw err;
    } finally {
      if (requestTracker.isLatest(requestToken)) {
        loading.value = false;
      }
    }
  }

  async function refresh() {
    if (!hasParams(params.value)) {
      return null;
    }

    return run(params.value);
  }

  setupAutoRun(options, { params, run, refresh });

  return {
    data,
    loading,
    error,
    params,
    run,
    refresh,
    reset,
  };
}

interface UseInfiniteQueryOptions<TParams, TData, TItem> {
  pageSize?: number;
  immediate?: boolean;
  initialParams?: TParams;
  watchingStates?: WatchSource<unknown>[];
  getItems: (response: TData) => TItem[];
  getHasMore: (response: TData, page: number, pageSize: number, currentItems: TItem[]) => boolean;
}

/**
 * Infinite list query
 * Used for home/list pages and provides refresh / loadMore / reset
 */
export function useInfiniteQuery<TData, TItem, TParams = void>(
  methodFactory: (page: number, pageSize: number, params: TParams) => AnyMethod,
  options: UseInfiniteQueryOptions<TParams, TData, TItem>,
) {
  const pageSize = options.pageSize ?? 10;
  const list = ref<TItem[]>([]);
  const page = ref(0);
  const hasMore = ref(true);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<unknown>(null);
  const params = ref<TParams | null>(null) as Ref<TParams | null>;
  const requestTracker = createRequestTracker();

  async function requestPage(targetPage: number, append: boolean) {
    if (!hasParams(params.value)) {
      return [];
    }

    const requestToken = requestTracker.createToken();
    if (append) {
      loadingMore.value = true;
    } else {
      loading.value = true;
    }
    error.value = null;

    try {
      const response = await sendRequest(methodFactory(targetPage, pageSize, params.value));
      if (!requestTracker.isLatest(requestToken)) {
        return [];
      }

      const newItems = options.getItems(response) ?? [];
      const mergedItems = append ? [...list.value, ...newItems] : [...newItems];
      list.value = mergedItems as TItem[];
      page.value = targetPage;
      hasMore.value = options.getHasMore(response, targetPage, pageSize, mergedItems as TItem[]);
      return newItems;
    } catch (err) {
      if (!requestTracker.isLatest(requestToken)) {
        return [];
      }

      error.value = err;
      throw err;
    } finally {
      if (requestTracker.isLatest(requestToken)) {
        if (append) {
          loadingMore.value = false;
        } else {
          loading.value = false;
        }
      }
    }
  }

  async function run(nextParams: TParams) {
    params.value = nextParams;
    return requestPage(0, false);
  }

  async function refresh() {
    if (!hasParams(params.value)) {
      return [];
    }

    return requestPage(0, false);
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || loadingMore.value || !hasParams(params.value)) {
      return [];
    }

    return requestPage(page.value + 1, true);
  }

  function reset() {
    list.value = [];
    page.value = 0;
    hasMore.value = true;
    error.value = null;
  }

  setupAutoRun(options, { params, run, refresh });

  return {
    list,
    page,
    hasMore,
    loading,
    loadingMore,
    error,
    params,
    run,
    refresh,
    loadMore,
    reset,
  };
}

/**
 * Paginated / infinite-scrolling list
 * Used for list pages that load more data
 */
export function usePageList<T>(
  methodFactory: (page: number, pageSize: number) => any,
  options?: {
    pageSize?: number;
    watchingStates?: any[];
    immediate?: boolean;
  },
) {
  const pageSize = options?.pageSize ?? 10;

  const { loading, data, error, page, pageCount, isLastPage, send, reload } = usePagination(
    (p: number, ps: number) => methodFactory(p, ps),
    {
      data: (res: any) => res?.items ?? [],
      total: (res: any) => res?.total ?? 0,
      pageSize,
      watchingStates: options?.watchingStates,
      immediate: options?.immediate ?? true,
    },
  );

  return {
    list: data as unknown as T[],
    loading,
    error,
    page,
    pageCount,
    noMore: isLastPage,
    loadMore: () => send(page.value + 1, pageSize),
    refresh: reload,
  };
}
