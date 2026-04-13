import type { PageResponse } from '@/types/api';

/**
 * Infer whether there is a next page from a Spring-style paginated response.
 * Prefer explicit pagination fields, and fall back to the current page size when they are missing.
 */
export function getPageResponseHasMore<T>(
  response: PageResponse<T>,
  fallbackPageSize: number,
): boolean {
  if (typeof response.last === 'boolean') {
    return !response.last;
  }

  if (typeof response.number === 'number' && typeof response.totalPages === 'number') {
    return response.number < response.totalPages - 1;
  }

  if (typeof response.totalElements === 'number') {
    const size = response.size ?? fallbackPageSize;
    const currentPage = response.number ?? 0;
    return (currentPage + 1) * size < response.totalElements;
  }

  const currentCount = response.numberOfElements ?? response.content?.length ?? 0;
  const size = response.size ?? fallbackPageSize;
  return currentCount >= size && currentCount > 0;
}
