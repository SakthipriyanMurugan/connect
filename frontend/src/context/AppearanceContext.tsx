import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppearanceSettings, ThemeMode } from '../types';

const defaultSettings: AppearanceSettings = {
  theme: 'light',
  accent: '#7a7cff',
  fontSize: '14',
  fontFamily: 'system',
  compact: false,
  motion: false,
  labels: true,
};

interface AppearanceContextType {
  appearance: AppearanceSettings;
  updateAppearance: <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => void;
  resetAppearance: () => void;
  isCustomizerOpen: boolean;
  setIsCustomizerOpen: (open: boolean) => void;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
    try {
      const saved = localStorage.getItem('vertexAppearance');
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('vertexAppearance', JSON.stringify(appearance));
    } catch (e) {
      console.error('Failed to save appearance preferences', e);
    }

    let isDark = appearance.theme === 'dark';
    if (appearance.theme === 'system') {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    document.body.classList.toggle('dark', isDark);
    document.body.classList.toggle('compact', !!appearance.compact);
    document.body.classList.toggle('reduce-motion', !!appearance.motion);
    document.body.classList.toggle('hide-labels', !appearance.labels);

    document.documentElement.style.setProperty('--accent', appearance.accent);
    document.documentElement.style.setProperty('--font-scale', `${appearance.fontSize}px`);

    const fontMap = {
      system: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      inter: 'Inter, Arial, sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      mono: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    };
    document.body.style.fontFamily = fontMap[appearance.fontFamily] || fontMap.system;
  }, [appearance]);

  const updateAppearance = <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    setAppearance((prev) => ({ ...prev, [key]: value }));
  };

  const resetAppearance = () => {
    setAppearance(defaultSettings);
  };

  return (
    <AppearanceContext.Provider
      value={{
        appearance,
        updateAppearance,
        resetAppearance,
        isCustomizerOpen,
        setIsCustomizerOpen,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
};

export const useAppearance = () => {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }
  return context;
};
