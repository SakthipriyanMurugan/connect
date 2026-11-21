// Dynamic API & WebSocket configuration
// Seamlessly works on Desktop (localhost), Mobile on Wi-Fi (LAN IP), and Cloud Deployments
const isBrowser = typeof window !== 'undefined';
const hostname = isBrowser ? window.location.hostname : 'localhost';

// Cloudflare Tunnel Edge URL for global cloud deployment
const CLOUD_TUNNEL_HTTP = 'https://container-union-folding-subsidiary.trycloudflare.com';
const CLOUD_TUNNEL_WS = 'wss://container-union-folding-subsidiary.trycloudflare.com';

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string) ||
  (isBrowser && window.localStorage.getItem('VERTEX_API_URL')) ||
  (hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')
    ? `http://${hostname}:8000`
    : CLOUD_TUNNEL_HTTP);

export const WS_BASE_URL: string =
  (import.meta.env.VITE_WS_URL as string) ||
  (isBrowser && window.localStorage.getItem('VERTEX_WS_URL')) ||
  (hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'ws://localhost:8000'
    : hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')
    ? `ws://${hostname}:8000`
    : CLOUD_TUNNEL_WS);
