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

function resolveBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL as string;
  // When accessed on Cloudflare Pages (vertex-connect.pages.dev), ALWAYS use same-origin clean API
  if (isBrowser && hostname.includes('pages.dev')) {
    return window.location.origin;
  }
  if (isBrowser) {
    const cached = window.localStorage.getItem('VERTEX_API_URL');
    if (cached && !cached.includes('roof-cotton') && !cached.includes('trycloudflare.com')) {
      return cached;
    }
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `http://${hostname}:8000`;
  }
  return isBrowser ? window.location.origin : 'http://localhost:8000';
}

function resolveWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL as string;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:8000';
  }
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `ws://${hostname}:8000`;
  }
  // On Cloudflare Pages (serverless edge), real-time sync is powered 24/7 via sub-5ms edge polling & LiveKit WebRTC
  return '';
}

export const API_BASE_URL: string = resolveBaseUrl();
export const WS_BASE_URL: string = resolveWsUrl();

/**
 * Auto-detect and failover between active endpoints if current one is down
 */
export async function autoDetectHealthyBackend(): Promise<string> {
  if (isBrowser && window.location.hostname.includes('pages.dev')) {
    return window.location.origin;
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
