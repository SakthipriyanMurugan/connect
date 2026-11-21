// Dynamic API & WebSocket configuration
// Seamlessly works on Desktop (localhost), Mobile on Wi-Fi (LAN IP), and Cloud Deployments
const isBrowser = typeof window !== 'undefined';
const hostname = isBrowser ? window.location.hostname : 'localhost';

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string) ||
  (hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : `http://${hostname}:8000`);

export const WS_BASE_URL: string =
  (import.meta.env.VITE_WS_URL as string) ||
  (hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'ws://localhost:8000'
    : `ws://${hostname}:8000`);
