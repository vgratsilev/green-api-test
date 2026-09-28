export type RuntimeConfig = { defaultApiUrl: string };

export const defaultApiUrl = 'https://api.green-api.com';

export function getRuntimeConfig(apiUrl?: string): RuntimeConfig {
  return { defaultApiUrl: normalizeApiUrl(apiUrl) ?? defaultApiUrl };
}

export function normalizeApiUrl(apiUrl?: string): string | undefined {
  if (!apiUrl) return undefined;

  try {
    const url = new URL(apiUrl);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
}
