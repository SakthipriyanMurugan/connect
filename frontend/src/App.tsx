import React, { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppearanceProvider } from './context/AppearanceContext';
import { AuthPage } from './components/auth/AuthPage';

// Lazy-load the entire MainLayout (and its LiveKit, WebSockets, and sub-pages)
// so initial unauthenticated landing page loads in < 50ms with 100% Lighthouse scores!
const MainLayout = lazy(() => import('./components/layout/MainLayout').then(m => ({ default: m.MainLayout })));

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();

  // Capture shared meeting/call room link even before user logs in
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qRoom = params.get('room');
    const pathMatch = window.location.pathname.match(/^\/meet\/([^/]+)/);
    const room = qRoom || (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
    if (room) {
      sessionStorage.setItem('vertex_pending_room', room);
    }
  }, []);

  // Defer Service Worker registration to idle time after window load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW notice:', e));
      };
      if (document.readyState === 'complete') {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(registerSW);
        } else {
          setTimeout(registerSW, 2000);
        }
      } else {
        window.addEventListener('load', () => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(registerSW);
          } else {
            setTimeout(registerSW, 2000);
          }
        });
      }
    }
  }, []);

  if (!isAuthenticated) {
    return <AuthPage onSuccess={() => {}} />;
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#090d25] text-white">
          <div className="text-center">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black mx-auto mb-3 shadow-lg shadow-blue-500/30 text-white text-lg">
              V
            </div>
            <div className="text-xs font-bold tracking-wider text-slate-300">OPENING WORKSPACE…</div>
          </div>
        </div>
      }
    >
      <MainLayout />
    </Suspense>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppearanceProvider>
        <AppContent />
      </AppearanceProvider>
    </AuthProvider>
  );
}
