const SKIP_LOG_PATHS = new Set(['/health', '/metrics', '/api/health', '/api/metrics']);

export function shouldSkipRequestLogging(url?: string): boolean {
  if (!url) {
    return false;
  }

  const pathname = url.split('?')[0].toLowerCase();

  if (SKIP_LOG_PATHS.has(pathname)) {
    return true;
  }

  return (
    pathname.startsWith('/health/') ||
    pathname.startsWith('/api/health/') ||
    pathname.startsWith('/metrics/') ||
    pathname.startsWith('/api/metrics/')
  );
}
