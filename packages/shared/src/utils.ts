/**
 * Format a ticket ID from prefix and nextId counter.
 * Uses 3-digit minimum padding, no upper cap.
 * Examples: formatId("APP", 1) → "APP-001", formatId("APP", 1000) → "APP-1000"
 */
export function formatId(prefix: string, nextId: number): string {
  return `${prefix}-${String(nextId).padStart(3, '0')}`
}
