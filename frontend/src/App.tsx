import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppearanceProvider } from './context/AppearanceContext';
import { AuthPage } from './components/auth/AuthPage';
import { Sidebar, NavPage } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { CustomizerDrawer } from './components/layout/CustomizerDrawer';
import { CallBar } from './components/calling/CallBar';
import { MessagesPage } from './components/pages/MessagesPage';
import { MeetingsPage } from './components/pages/MeetingsPage';
import { IntelligencePage } from './components/pages/IntelligencePage';
import { TeamsPage } from './components/pages/TeamsPage';
import { FilesPage } from './components/pages/FilesPage';
import { AnalyticsPage } from './components/pages/AnalyticsPage';
import { SettingsPage } from './components/pages/SettingsPage';

const MainLayout: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<NavPage>('messages');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCallTitle, setActiveCallTitle] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  };

  const handleStartCall = (title: string) => {
    setActiveCallTitle(title);
    showToast(`Joining call: ${title}. WebRTC active.`);
  };

  const handleEndCall = () => {
    setActiveCallTitle(null);
    showToast('Call ended. Generating AI Call Scorecard review...');
  };

  if (!isAuthenticated) {
    return <AuthPage onSuccess={() => showToast('Welcome to Vertex Connect!')} />;
  }

  return (
    <div className="flex min-h-screen text-[var(--ink)]">
      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onPageChange={(p) => {
          setCurrentPage(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={(q) => setSearchQuery(q)}
          onShowNotificationToast={showToast}
        />

        <main className="flex-1 p-6 sm:p-8 max-w-[1600px] w-full mx-auto">
          {currentPage === 'messages' && (
            <MessagesPage onStartCall={handleStartCall} onShowToast={showToast} />
          )}
          {currentPage === 'meetings' && (
            <MeetingsPage onStartCall={handleStartCall} onShowToast={showToast} />
          )}
          {currentPage === 'intelligence' && <IntelligencePage onShowToast={showToast} />}
          {currentPage === 'teams' && <TeamsPage onShowToast={showToast} />}
          {currentPage === 'files' && <FilesPage onShowToast={showToast} />}
          {currentPage === 'analytics' && <AnalyticsPage />}
          {currentPage === 'settings' && <SettingsPage onShowToast={showToast} />}
        </main>
      </div>

      {/* Slide-out Customizer Drawer */}
      <CustomizerDrawer />

      {/* Active Call Floating Bar */}
      <CallBar
        activeCallTitle={activeCallTitle}
        onEndCall={handleEndCall}
        onShowToast={showToast}
      />

      {/* Global Toast Alert */}
      {toastMessage && (
        <div className="fixed top-24 right-8 z-50 px-4 py-3 rounded-2xl bg-[#141b43]/95 border border-white/20 text-white text-xs font-semibold shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppearanceProvider>
        <MainLayout />
      </AppearanceProvider>
    </AuthProvider>
  );
}
