import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Palette, Settings } from 'lucide-react';
import '../styles/IDEThemes.css';

const IDE_THEMES = {
    'vs-light': {
        name: 'VS Light',
        colors: { bg: '#ffffff', fg: '#000000', primary: '#0066cc' },
        category: 'Light'
    },
    'vs-dark': {
        name: 'VS Dark',
        colors: { bg: '#1e1e1e', fg: '#d4d4d4', primary: '#569cd6' },
        category: 'Dark'
    },
    'dracula': {
        name: 'Dracula',
        colors: { bg: '#282a36', fg: '#f8f8f2', primary: '#ff79c6' },
        category: 'Dark'
    },
    'monokai': {
        name: 'Monokai',
        colors: { bg: '#272822', fg: '#f8f8f2', primary: '#66d9ef' },
        category: 'Dark'
    },
    'solarized-light': {
        name: 'Solarized Light',
        colors: { bg: '#fdf6e3', fg: '#657b83', primary: '#268bd2' },
        category: 'Light'
    },
    'solarized-dark': {
        name: 'Solarized Dark',
        colors: { bg: '#002b36', fg: '#839496', primary: '#268bd2' },
        category: 'Dark'
    },
    'nord': {
        name: 'Nord',
        colors: { bg: '#2e3440', fg: '#eceff4', primary: '#81a1c1' },
        category: 'Dark'
    },
    'atom-one': {
        name: 'Atom One',
        colors: { bg: '#282c34', fg: '#abb2bf', primary: '#61afef' },
        category: 'Dark'
    },
    'github-light': {
        name: 'GitHub Light',
        colors: { bg: '#f6f8fa', fg: '#24292e', primary: '#0366d6' },
        category: 'Light'
    },
    'tomorrow-night': {
        name: 'Tomorrow Night',
        colors: { bg: '#1d1f21', fg: '#c5c8c6', primary: '#81a2be' },
        category: 'Dark'
    }
};

const IDEThemeCustomizer = () => {
    const { theme, updateIDETheme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [selectedTheme, setSelectedTheme] = useState('vs-dark');
    const [showPreview, setShowPreview] = useState(false);
    const [fontSettings, setFontSettings] = useState({
        fontSize: 14,
        fontFamily: 'Fira Code',
        lineHeight: 1.5,
        letterSpacing: 0
    });
    const [editorSettings, setEditorSettings] = useState({
        minimap: true,
        wordWrap: true,
        renderWhitespace: true,
        smoothScrolling: true,
        bracketPairColorization: true,
        formatOnPaste: true,
        autoFold: true
    });

    const token = localStorage.getItem('authToken');

    // Load preferences
    const loadPreferences = async () => {
        try {
            const response = await fetch('/api/users/' + user?.id + '/preferences', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load');

            const data = await response.json();
            if (data.ide_theme) setSelectedTheme(data.ide_theme);
            if (data.custom_ide_settings) {
                const settings = JSON.parse(typeof data.custom_ide_settings === 'string'
                    ? data.custom_ide_settings
                    : JSON.stringify(data.custom_ide_settings));
                setFontSettings({ ...fontSettings, ...settings?.font || {} });
                setEditorSettings({ ...editorSettings, ...settings?.editor || {} });
            }
        } catch (error) {
            console.error('Error loading preferences:', error);
        }
    };

    // Save preferences
    const savePreferences = async () => {
        try {
            const response = await fetch('/api/users/' + user?.id + '/preferences', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ide_theme: selectedTheme,
                    custom_ide_settings: JSON.stringify({
                        font: fontSettings,
                        editor: editorSettings
                    })
                })
            });

            if (!response.ok) throw new Error('Failed to save');

            updateIDETheme(selectedTheme);
            alert('✅ IDE theme preferences saved!');
        } catch (error) {
            console.error('Error saving:', error);
            alert('❌ Failed to save preferences');
        }
    };

    useEffect(() => {
        if (user?.id) loadPreferences();
    }, [user?.id]);

    return (
        <div className={`ide-theme-customizer ${theme}`}>
            <div className="customizer-header">
                <h2>
                    <Palette size={24} />
                    IDE Theme Customizer
                </h2>
                <p>Customize your code editor appearance</p>
            </div>

            <div className="customizer-content">
                {/* Theme Selection */}
                <div className="section">
                    <h3>🎨 Theme Selection</h3>
                    <div className="theme-grid">
                        {Object.entries(IDE_THEMES).map(([key, themeData]) => (
                            <button
                                key={key}
                                className={`theme-tile ${selectedTheme === key ? 'selected' : ''}`}
                                onClick={() => setSelectedTheme(key)}
                                title={themeData.name}
                            >
                                <div
                                    className="theme-preview"
                                    style={{
                                        background: themeData.colors.bg,
                                        border: `2px solid ${themeData.colors.primary}`
                                    }}
                                >
                                    <div
                                        className="preview-text"
                                        style={{ color: themeData.colors.fg }}
                                    >
                                        {'{}'
                                        }
                                    </div>
                                </div>
                                <div className="theme-name">{themeData.name}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Font Settings */}
                <div className="section">
                    <h3>✏️ Font Settings</h3>
                    <div className="settings-grid">
                        <div className="setting">
                            <label>Font Size</label>
                            <div className="input-group">
                                <input
                                    type="range"
                                    min="12"
                                    max="24"
                                    value={fontSettings.fontSize}
                                    onChange={(e) =>
                                        setFontSettings({ ...fontSettings, fontSize: parseInt(e.target.value) })
                                    }
                                />
                                <span className="value">{fontSettings.fontSize}px</span>
                            </div>
                        </div>

                        <div className="setting">
                            <label>Line Height</label>
                            <div className="input-group">
                                <input
                                    type="range"
                                    min="1"
                                    max="2.5"
                                    step="0.1"
                                    value={fontSettings.lineHeight}
                                    onChange={(e) =>
                                        setFontSettings({ ...fontSettings, lineHeight: parseFloat(e.target.value) })
                                    }
                                />
                                <span className="value">{fontSettings.lineHeight}</span>
                            </div>
                        </div>

                        <div className="setting">
                            <label>Letter Spacing</label>
                            <div className="input-group">
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="0.5"
                                    value={fontSettings.letterSpacing}
                                    onChange={(e) =>
                                        setFontSettings({ ...fontSettings, letterSpacing: parseFloat(e.target.value) })
                                    }
                                />
                                <span className="value">{fontSettings.letterSpacing}px</span>
                            </div>
                        </div>

                        <div className="setting full-width">
                            <label>Font Family</label>
                            <select
                                value={fontSettings.fontFamily}
                                onChange={(e) =>
                                    setFontSettings({ ...fontSettings, fontFamily: e.target.value })
                                }
                            >
                                <option>Fira Code</option>
                                <option>JetBrains Mono</option>
                                <option>Inconsolata</option>
                                <option>Courier New</option>
                                <option>Consolas</option>
                                <option>Monaco</option>
                                <option>Ubuntu Mono</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Editor Settings */}
                <div className="section">
                    <h3>
                        <Settings size={18} />
                        Editor Features
                    </h3>
                    <div className="toggles-grid">
                        {Object.entries(editorSettings).map(([key, value]) => (
                            <label key={key} className="toggle">
                                <input
                                    type="checkbox"
                                    checked={value}
                                    onChange={() =>
                                        setEditorSettings({ ...editorSettings, [key]: !value })
                                    }
                                />
                                <span className="toggle-label">
                                    {key
                                        .replace(/([A-Z])/g, ' $1')
                                        .trim()
                                        .replace(/^./, (s) => s.toUpperCase())}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Live Preview */}
                {showPreview && (
                    <div className="section">
                        <h3>👀 Live Preview</h3>
                        <div
                            className="code-preview"
                            style={{
                                background: IDE_THEMES[selectedTheme].colors.bg,
                                color: IDE_THEMES[selectedTheme].colors.fg,
                                fontSize: `${fontSettings.fontSize}px`,
                                fontFamily: fontSettings.fontFamily,
                                lineHeight: fontSettings.lineHeight,
                                letterSpacing: `${fontSettings.letterSpacing}px`
                            }}
                        >
                            <pre>{`function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(result);`}</pre>
                        </div>
                    </div>
                )}

                {/* Preview Toggle */}
                <button className="btn-preview" onClick={() => setShowPreview(!showPreview)}>
                    {showPreview ? '👀 Hide Preview' : '👀 Show Preview'}
                </button>

                {/* Save Button */}
                <div className="action-buttons">
                    <button className="btn-save" onClick={savePreferences}>
                        ✅ Save Preferences
                    </button>
                    <button
                        className="btn-reset"
                        onClick={() => {
                            setSelectedTheme('vs-dark');
                            setFontSettings({ fontSize: 14, fontFamily: 'Fira Code', lineHeight: 1.5, letterSpacing: 0 });
                            setEditorSettings({
                                minimap: true,
                                wordWrap: true,
                                renderWhitespace: true,
                                smoothScrolling: true,
                                bracketPairColorization: true,
                                formatOnPaste: true,
                                autoFold: true
                            });
                        }}
                    >
                        ↺ Reset to Default
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IDEThemeCustomizer;
