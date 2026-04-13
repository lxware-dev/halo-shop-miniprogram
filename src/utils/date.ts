/**
 * Check whether the given time is already past the current time.
 * Supports ISO time strings and Date objects.
 */
export function isTimeExpired(time?: string | Date | null): boolean {
  if (!time) {
    return false;
  }

  const timestamp = new Date(time).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp <= Date.now();
}
