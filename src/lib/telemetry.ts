/**
 * Minimal error reporting (replaces the former Sentry integration). Keeps the
 * same call shape so call sites stay unchanged: real problems go to the
 * console; breadcrumbs and context are dropped.
 */

type ReportOptions = {
  extra?: Record<string, unknown>
  level?: string
  tags?: Record<string, unknown>
  [key: string]: unknown
}

export function captureException(
  error: unknown,
  options?: ReportOptions
): void {
  console.error(
    "[editor-lab]",
    error,
    options?.tags ?? "",
    options?.extra ?? ""
  )
}

export function captureMessage(message: string, options?: ReportOptions): void {
  console.warn(
    "[editor-lab]",
    message,
    options?.tags ?? "",
    options?.extra ?? ""
  )
}

export function addBreadcrumb(_breadcrumb: Record<string, unknown>): void {
  // Intentionally a no-op: breadcrumbs only mattered as context for reports.
}

export function setContext(_name: string, _context: unknown): void {
  // Intentionally a no-op.
}
