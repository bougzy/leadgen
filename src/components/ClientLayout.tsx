'use client';

import { useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/ui/Sidebar';
import { ToastProvider } from '@/components/ui/Toast';
import OnboardingWizard from '@/components/OnboardingWizard';
import { getSettings, saveSettings } from '@/lib/db';
import type { UserSettings } from '@/types';

export default function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('leadgen-dark-mode');
    if (saved !== null) {
      setDarkMode(saved === 'true');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    }

    // Don't load settings on login page
    if (isLoginPage) return;

    // Load settings and check onboarding status
    getSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      if (!loadedSettings.onboardingComplete) {
        setShowOnboarding(true);
      }
    }).catch(() => {
      // Settings load failed — may be unauthenticated, middleware handles redirect
    });
  }, [isLoginPage]);

  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle('dark', darkMode);
      localStorage.setItem('leadgen-dark-mode', String(darkMode));
    }
  }, [darkMode, mounted]);

  // Background processors now run server-side via instrumentation.ts
  // No browser-based polling needed

  async function handleOnboardingComplete(updatedSettings: UserSettings) {
    await saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setShowOnboarding(false);
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Login page: render without sidebar/shell
  if (isLoginPage) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
          {children}
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
          <div className="p-3 sm:p-4 lg:p-8 pb-20 lg:pb-8">
            {children}
          </div>
        </main>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="fixed bottom-4 left-4 z-30 p-2.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all lg:left-[17rem]"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        {showOnboarding && settings && (
          <OnboardingWizard
            settings={settings}
            onComplete={handleOnboardingComplete}
          />
        )}
      </div>
    </ToastProvider>
  );
}
