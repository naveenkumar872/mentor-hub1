import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import '../styles/LanguageSwitcher.css';

const LanguageSwitcher = () => {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = React.useState(false);

    const languages = [
        { code: 'en', name: 'English', flag: '🇬🇧' },
        { code: 'es', name: 'Español', flag: '🇪🇸' },
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
        { code: 'ar', name: 'العربية', flag: '🇸🇦' },
        { code: 'hi', name: 'हिंदी', flag: '🇮🇳' },
        { code: 'zh', name: '中文', flag: '🇨🇳' },
        { code: 'ja', name: '日本語', flag: '🇯🇵' }
    ];

    const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

    const handleChangeLanguage = (code) => {
        i18n.changeLanguage(code);
        localStorage.setItem('language', code);
        setIsOpen(false);
    };

    return (
        <div className="language-switcher">
            <button
                className="language-toggle"
                onClick={() => setIsOpen(!isOpen)}
                title="Change Language"
            >
                <Globe size={20} />
                <span className="language-flag">{currentLanguage.flag}</span>
                <span className="language-label">{currentLanguage.code.toUpperCase()}</span>
            </button>

            {isOpen && (
                <div className="language-dropdown">
                    {languages.map(lang => (
                        <button
                            key={lang.code}
                            className={`language-option ${lang.code === i18n.language ? 'active' : ''}`}
                            onClick={() => handleChangeLanguage(lang.code)}
                        >
                            <span className="language-flag">{lang.flag}</span>
                            <span>{lang.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LanguageSwitcher;
