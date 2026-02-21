import { useState } from 'react'

/**
 * Reusable Tab Navigation Component
 * Reduces code duplication across portal pages
 * Usage: <TabNav tabs={[{label: 'Overview', id: 'overview', icon: <Home />}, ...]} />
 */
export default function TabNav({ 
    tabs,  // [{label: string, id: string, icon?: React.ReactNode}, ...]
    defaultTab = null,
    onTabChange = null,
    className = ''
}) {
    const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)

    const handleTabChange = (tabId) => {
        setActiveTab(tabId)
        onTabChange?.(tabId)
    }

    return (
        <div className={`flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto ${className}`}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`
                        flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap
                        transition-all border-b-2
                        ${activeTab === tab.id
                            ? 'border-b-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                            : 'border-b-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }
                    `}
                >
                    {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
                    {tab.label}
                </button>
            ))}
        </div>
    )
}

/**
 * Reusable Tab Content Container
 * Usage: <TabContent activeTab={activeTab} tabs={[...]} />
 */
export function TabContent({ 
    activeTab, 
    tabs,  // [{id: string, content: React.ReactNode}, ...]
    className = ''
}) {
    const activeContent = tabs.find(t => t.id === activeTab)?.content

    return (
        <div className={`animate-fadeIn ${className}`}>
            {activeContent || null}
        </div>
    )
}
