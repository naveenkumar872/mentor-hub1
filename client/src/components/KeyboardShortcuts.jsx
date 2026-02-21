import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Keyboard, X, Save } from 'lucide-react';
import '../styles/KeyboardShortcuts.css';

const DEFAULT_SHORTCUTS = {
    // Navigation
    'goto-next-problem': { keys: 'Ctrl+]', description: 'Next Problem' },
    'goto-prev-problem': { keys: 'Ctrl+[', description: 'Previous Problem' },
    'goto-submissions': { keys: 'Ctrl+S', description: 'My Submissions' },
    'goto-dashboard': { keys: 'Ctrl+H', description: 'Dashboard' },

    // Editor
    'editor-submit': { keys: 'Ctrl+Enter', description: 'Submit Code' },
    'editor-run': { keys: 'Ctrl+R', description: 'Run Code' },
    'editor-format': { keys: 'Ctrl+Alt+L', description: 'Format Code' },
    'editor-fold': { keys: 'Ctrl+K Ctrl+0', description: 'Fold All' },
    'editor-unfold': { keys: 'Ctrl+K Ctrl+J', description: 'Unfold All' },

    // Quick Actions
    'quick-search': { keys: 'Ctrl+P', description: 'Quick Search' },
    'open-settings': { keys: 'Ctrl+,', description: 'Settings' },
    'toggle-theme': { keys: 'Ctrl+Shift+T', description: 'Toggle Theme' },
    'toggle-fullscreen': { keys: 'F11', description: 'Full Screen' },

    // Common
    'undo': { keys: 'Ctrl+Z', description: 'Undo' },
    'redo': { keys: 'Ctrl+Y', description: 'Redo' },
    'save': { keys: 'Ctrl+S', description: 'Save' },
    'help': { keys: 'F1', description: 'Help' }
};

const KeyboardShortcuts = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS);
    const [editingKey, setEditingKey] = useState(null);
    const [recordingKeys, setRecordingKeys] = useState({});
    const [showOnlyChanges, setShowOnlyChanges] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [category, setCategory] = useState('all');

    const token = localStorage.getItem('authToken');

    // Load shortcuts
    const loadShortcuts = async () => {
        try {
            const response = await fetch('/api/users/' + user?.id + '/preferences', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load');

            const data = await response.json();
            if (data.keyboard_shortcuts) {
                const parsed = typeof data.keyboard_shortcuts === 'string'
                    ? JSON.parse(data.keyboard_shortcuts)
                    : data.keyboard_shortcuts;
                setShortcuts({ ...DEFAULT_SHORTCUTS, ...parsed });
            }
        } catch (error) {
            console.error('Error loading shortcuts:', error);
        }
    };

    // Save shortcuts
    const saveShortcuts = async () => {
        try {
            const changedShortcuts = {};
            Object.entries(shortcuts).forEach(([key, value]) => {
                if (DEFAULT_SHORTCUTS[key]?.keys !== value.keys) {
                    changedShortcuts[key] = value;
                }
            });

            const response = await fetch('/api/users/' + user?.id + '/preferences', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    keyboard_shortcuts: changedShortcuts
                })
            });

            if (!response.ok) throw new Error('Failed to save');

            alert('✅ Keyboard shortcuts saved!');
        } catch (error) {
            console.error('Save error:', error);
            alert('❌ Failed to save shortcuts');
        }
    };

    // Record key combination
    const recordKey = (shortcutKey) => {
        setEditingKey(shortcutKey);
        setRecordingKeys({ [shortcutKey]: [] });
    };

    // Handle key recording
    useEffect(() => {
        if (!editingKey) return;

        const handleKeyDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const keys = [];
            if (e.ctrlKey) keys.push('Ctrl');
            if (e.altKey) keys.push('Alt');
            if (e.shiftKey) keys.push('Shift');

            const key = e.key === ' ' ? 'Space' : e.key.toUpperCase();
            if (!['CONTROL', 'ALT', 'SHIFT'].includes(key)) {
                keys.push(key);
            }

            const keyCombo = keys.join('+');

            setRecordingKeys({
                [editingKey]: keys
            });

            if (keys.length > 0) {
                // Auto-confirm after 500ms
                setTimeout(() => {
                    setShortcuts({ ...shortcuts, [editingKey]: { ...shortcuts[editingKey], keys: keyCombo } });
                    setEditingKey(null);
                    setRecordingKeys({});
                }, 500);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingKey, shortcuts]);

    useEffect(() => {
        if (user?.id) loadShortcuts();
    }, [user?.id]);

    // Filter shortcuts
    const getFilteredShortcuts = () => {
        let filtered = Object.entries(shortcuts);

        if (showOnlyChanges) {
            filtered = filtered.filter(([key, value]) => DEFAULT_SHORTCUTS[key]?.keys !== value.keys);
        }

        if (searchQuery) {
            filtered = filtered.filter(([_, value]) =>
                value.description.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Group by category
        const categories = {
            'Navigation': ['goto-next-problem', 'goto-prev-problem', 'goto-submissions', 'goto-dashboard'],
            'Editor': ['editor-submit', 'editor-run', 'editor-format', 'editor-fold', 'editor-unfold'],
            'Quick Actions': ['quick-search', 'open-settings', 'toggle-theme', 'toggle-fullscreen'],
            'Common': ['undo', 'redo', 'save', 'help']
        };

        if (category !== 'all') {
            const categoryKeys = categories[category] || [];
            filtered = filtered.filter(([key]) => categoryKeys.includes(key));
        }

        return filtered;
    };

    const filteredShortcuts = getFilteredShortcuts();

    return (
        <div className={`keyboard-shortcuts ${theme}`}>
            <div className="shortcuts-header">
                <h2>
                    <Keyboard size={24} />
                    Keyboard Shortcuts
                </h2>
                <p>Customize keyboard shortcuts for quick access to features</p>
            </div>

            {/* Controls */}
            <div className="shortcuts-controls">
                <input
                    type="text"
                    placeholder="Search shortcuts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                />

                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="category-select"
                >
                    <option value="all">All Categories</option>
                    <option value="Navigation">Navigation</option>
                    <option value="Editor">Editor</option>
                    <option value="Quick Actions">Quick Actions</option>
                    <option value="Common">Common</option>
                </select>

                <label className="checkbox">
                    <input
                        type="checkbox"
                        checked={showOnlyChanges}
                        onChange={(e) => setShowOnlyChanges(e.target.checked)}
                    />
                    <span>Show only custom</span>
                </label>
            </div>

            {/* Shortcuts List */}
            <div className="shortcuts-list">
                {filteredShortcuts.length === 0 ? (
                    <div className="empty-state">No shortcuts found</div>
                ) : (
                    filteredShortcuts.map(([key, shortcutData]) => {
                        const isChanged = DEFAULT_SHORTCUTS[key]?.keys !== shortcutData.keys;

                        return (
                            <div key={key} className={`shortcut-row ${isChanged ? 'changed' : ''}`}>
                                <div className="shortcut-description">
                                    {shortcutData.description}
                                    {isChanged && <span className="changed-badge">●</span>}
                                </div>

                                {editingKey === key ? (
                                    <div className="shortcut-input">
                                        <div className="recording">
                                            Listening for keys...
                                            {recordingKeys[key]?.length > 0 && (
                                                <div className="recorded-keys">
                                                    {recordingKeys[key].join('+')}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            className="btn-cancel"
                                            onClick={() => {
                                                setEditingKey(null);
                                                setRecordingKeys({});
                                            }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="shortcut-display">
                                        <kbd className="key-combo">{shortcutData.keys}</kbd>
                                        <button
                                            className="btn-edit"
                                            onClick={() => recordKey(key)}
                                        >
                                            Edit
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Action Buttons */}
            <div className="shortcuts-actions">
                <button className="btn-save" onClick={saveShortcuts}>
                    <Save size={18} />
                    Save Changes
                </button>
                <button
                    className="btn-reset"
                    onClick={() => {
                        if (window.confirm('Reset all shortcuts to defaults?')) {
                            setShortcuts(DEFAULT_SHORTCUTS);
                        }
                    }}
                >
                    ↺ Reset to Defaults
                </button>
            </div>

            {/* Info Box */}
            <div className="info-box">
                <strong>💡 Tips:</strong>
                <ul>
                    <li>Click "Edit" button to record a new shortcut</li>
                    <li>Press modifier keys (Ctrl, Alt, Shift) + any key</li>
                    <li>Changes are saved automatically when you click "Save Changes"</li>
                    <li>Custom shortcuts show a blue dot</li>
                </ul>
            </div>
        </div>
    );
};

export default KeyboardShortcuts;
