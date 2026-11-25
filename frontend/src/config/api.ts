// Dynamic API & WebSocket configuration with Intelligent Cloud Failover
// Seamlessly works on Desktop (localhost), Mobile on Wi-Fi (LAN IP), and Cloud Deployments
const isBrowser = typeof window !== 'undefined';
const hostname = isBrowser ? window.location.hostname : 'localhost';

// Clean up any stale temporary quick-tunnels or old cloud endpoints from localStorage
if (isBrowser) {
  try {
    const cachedWs = window.localStorage.getItem('VERTEX_WS_URL');
    if (cachedWs && (cachedWs.includes('trycloudflare.com') || cachedWs.includes('roof-cotton') || window.location.hostname.includes('pages.dev'))) {
      window.localStorage.removeItem('VERTEX_WS_URL');
    }
    const cachedApi = window.localStorage.getItem('VERTEX_API_URL');
    if (cachedApi && (cachedApi.includes('trycloudflare.com') || cachedApi.includes('roof-cotton') || window.location.hostname.includes('pages.dev'))) {
      window.localStorage.removeItem('VERTEX_API_URL');
    }
  } catch {}
}

export const ACTIVE_TUNNEL_HTTP = '';
export const ACTIVE_TUNNEL_WS = '';

export const CLOUD_WORKER_URL = 'https://vertex-api.feelit.workers.dev';
export const CLOUD_WORKER_WS_URL = 'wss://vertex-api.feelit.workers.dev';

function resolveBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL as string;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const cached = isBrowser ? window.localStorage.getItem('VERTEX_API_URL') : null;
    if (cached && !cached.includes('roof-cotton') && !cached.includes('trycloudflare.com')) {
      return cached;
    }
    return 'http://localhost:8000';
  }
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `http://${hostname}:8000`;
  }
  // On Cloudflare Pages / public domain: connect directly to stateful Durable Object + WebSocket Worker!
  return CLOUD_WORKER_URL;
}

function resolveWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL as string;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:8000';
  }
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `ws://${hostname}:8000`;
  }
  // Persistent real-time WebSocket Hibernation via Cloudflare Durable Objects (< 20ms latency!)
  return CLOUD_WORKER_WS_URL;
}

export const API_BASE_URL: string = resolveBaseUrl();
export const WS_BASE_URL: string = resolveWsUrl();

/**
 * Auto-detect and failover between active endpoints if current one is down
 */
export async function autoDetectHealthyBackend(): Promise<string> {
  if (isBrowser && window.location.hostname.includes('pages.dev')) {
    return CLOUD_WORKER_URL;
  }

  const candidates = [
    'http://localhost:8000',
  ];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${url}/api/v1/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        if (isBrowser) {
          window.localStorage.setItem('VERTEX_API_URL', url);
          const wsUrl = url.replace(/^http/, 'ws');
          window.localStorage.setItem('VERTEX_WS_URL', wsUrl);
        }
        return url;
      }
    } catch {
      // Continue to next candidate
    }
  }
  return API_BASE_URL;
}
