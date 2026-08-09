import type { AIProvider } from '../types/project';

const DEFAULT_9ROUTER_URL = 'http://localhost:20128/v1';

export function isLocalAIEndpoint(url: string) {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url.trim());
}

export function getAIModeLabel(provider: AIProvider, baseUrl = '') {
  if (provider === 'ollama') return 'Local AI';
  if (provider === '9router' && isLocalAIEndpoint(baseUrl || DEFAULT_9ROUTER_URL)) return 'Local AI';
  return 'Cloud AI';
}
