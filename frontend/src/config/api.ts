// Dynamic API & WebSocket configuration with Intelligent Cloud Failover
// Seamlessly works on Desktop (localhost), Mobile on Wi-Fi (LAN IP), and Cloud Deployments
const isBrowser = typeof window !== 'undefined';
const hostname = isBrowser ? window.location.hostname : 'localhost';

// 1. 24/7 Permanent Cloud Backend (Render Cloud Web Service)
export const RENDER_CLOUD_HTTP = 'https://vertex-connect-backend.onrender.com';
export const RENDER_CLOUD_WS = 'wss://vertex-connect-backend.onrender.com';

// 2. Active Live Cloudflare Tunnel (Immediate High-Speed Access)
export const LIVE_TUNNEL_HTTP = 'https://roof-cotton-interference-suffered.trycloudflare.com';
export const LIVE_TUNNEL_WS = 'wss://roof-cotton-interference-suffered.trycloudflare.com';

function resolveBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL as string;
  if (isBrowser && window.localStorage.getItem('VERTEX_API_URL')) {
    return window.localStorage.getItem('VERTEX_API_URL')!;
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `http://${hostname}:8000`;
  }
  // Production Cloudflare Pages default: Live active tunnel
  return LIVE_TUNNEL_HTTP;
}

function resolveWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL as string;
  if (isBrowser && window.localStorage.getItem('VERTEX_WS_URL')) {
    return window.localStorage.getItem('VERTEX_WS_URL')!;
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:8000';
  }
  if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `ws://${hostname}:8000`;
  }
  return LIVE_TUNNEL_WS;
}

export const API_BASE_URL: string = resolveBaseUrl();
export const WS_BASE_URL: string = resolveWsUrl();

/**
 * Auto-detect and failover between active endpoints if current one is down
 */
export async function autoDetectHealthyBackend(): Promise<string> {
  const candidates = [
    resolveBaseUrl(),
    LIVE_TUNNEL_HTTP,
    RENDER_CLOUD_HTTP,
  ];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
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
