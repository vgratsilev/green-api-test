export type RuntimeConfig =
  | { apiUrl: string }
  | { error: 'Укажите публичный HTTPS-адрес API GREEN-API в VITE_GREEN_API_URL.' }

const configurationError =
  'Укажите публичный HTTPS-адрес API GREEN-API в VITE_GREEN_API_URL.' as const

export function getRuntimeConfig(apiUrl = import.meta.env.VITE_GREEN_API_URL): RuntimeConfig {
  if (!apiUrl) {
    return { error: configurationError }
  }

  try {
    const url = new URL(apiUrl)

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return { error: configurationError }
    }

    return { apiUrl: url.origin }
  } catch {
    return { error: configurationError }
  }
}
