'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isLanguage, LANGUAGE_STORAGE_KEY, translate, type Language } from './index';
import {
  getStoredLanguage,
  syncLanguageSession,
  type LanguageApplication,
} from './language-session';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  application: LanguageApplication;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const savedAccountLanguage = (application: LanguageApplication): Language | null => {
  const key = application === 'admin'
    ? 'farmmitra_user'
    : application === 'shop'
      ? 'farmmitra_shop_user'
      : 'farmmitra_delivery_user';
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const preference: unknown = JSON.parse(raw).preferredLanguage;
    return isLanguage(preference) ? preference : null;
  } catch {
    return null;
  }
};

export function LanguageProvider({ children, application }: { children: ReactNode; application: LanguageApplication }) {
  const [language, updateLanguage] = useState<Language>('en');

  useEffect(() => {
    updateLanguage(getStoredLanguage(localStorage) ?? savedAccountLanguage(application) ?? 'en');
  }, [application]);

  useEffect(() => {
    document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    updateLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      return;
    }
  }, []);

  const value = useMemo(() => ({ language, setLanguage, application }), [language, setLanguage, application]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

export function useTranslation() {
  const { language } = useLanguage();
  return useMemo(() => ({
    language,
    t: (key: string, values?: Record<string, string | number>) => translate(key, language, values),
  }), [language]);
}

export function LanguageSelector() {
  const { language, setLanguage, application } = useLanguage();
  const [error, setError] = useState('');
  const [loginHref, setLoginHref] = useState('');

  const syncPreference = useCallback(async (next: Language) => {
    const result = await syncLanguageSession(localStorage, application, next);
    if (result.status === 'expired') {
      setLoginHref(result.loginHref);
      setError('Language is saved on this device. Your session expired; sign in again to sync it.');
    } else if (result.status === 'failed') {
      setError('Language is saved on this device; account sync failed.');
      setLoginHref('');
    } else if (result.status === 'synced') {
      setError('');
      setLoginHref('');
    }
  }, [application]);

  useEffect(() => {
    const onAuthenticated = () => {
      const storedLanguage = getStoredLanguage(localStorage);
      if (storedLanguage) void syncPreference(storedLanguage);
    };
    window.addEventListener('farmmitra:session-authenticated', onAuthenticated);
    return () => window.removeEventListener('farmmitra:session-authenticated', onAuthenticated);
  }, [syncPreference]);

  async function changeLanguage(next: Language) {
    setError('');
    setLoginHref('');
    setLanguage(next);
    await syncPreference(next);
  }

  return (
    <label className="fm-language-control">
      <span className="fm-language-label">Language</span>
      <select aria-label="Language" value={language} onChange={(event) => void changeLanguage(event.target.value as Language)}>
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
        <option value="hinglish">Hinglish</option>
      </select>
      {error && <span className="fm-language-error" role="status">{error}{loginHref && <> <a href={loginHref}>Sign in again</a></>}</span>}
      <style jsx>{`
        .fm-language-control { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#475569; }
        .fm-language-label { white-space:nowrap; }
        select { min-height:34px; border:1px solid #cbd5e1; border-radius:8px; padding:4px 8px; background:#fff; color:#172033; font:inherit; }
        .fm-language-error { position:absolute; top:100%; right:0; width:max-content; max-width:260px; color:#b42318; background:#fff; padding:4px 8px; border-radius:6px; box-shadow:0 2px 8px #0002; }
      `}</style>
    </label>
  );
}
