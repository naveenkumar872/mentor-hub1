// i18n configuration for multi-language support
// Supports: English, Spanish, French, German, Arabic, Hindi, Chinese, Japanese

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';
import frTranslations from './locales/fr.json';
import deTranslations from './locales/de.json';
import arTranslations from './locales/ar.json';
import hiTranslations from './locales/hi.json';
import zhTranslations from './locales/zh.json';
import jaTranslations from './locales/ja.json';

const resources = {
    en: { translation: enTranslations },
    es: { translation: esTranslations },
    fr: { translation: frTranslations },
    de: { translation: deTranslations },
    ar: { translation: arTranslations },
    hi: { translation: hiTranslations },
    zh: { translation: zhTranslations },
    ja: { translation: jaTranslations }
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        debug: false,
        interpolation: {
            escapeValue: false
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage']
        }
    });

export default i18n;
