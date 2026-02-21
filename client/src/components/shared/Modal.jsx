import { X } from 'lucide-react'

/**
 * Reusable Modal/Dialog Component
 * Reduces code duplication for modals across portals
 * Usage: <Modal isOpen={open} onClose={handleClose} title="Confirm" children={...} />
 */
export default function Modal({
    isOpen = false,
    onClose = () => {},
    title = '',
    children = null,
    actions = null,  // [{label: string, onClick: fn, variant: 'primary'|'secondary'|'danger'}, ...]
    size = 'md',  // 'sm', 'md', 'lg', 'xl'
    closeButton = true,
    className = '',
    overlayClassName = ''
}) {
    if (!isOpen) return null

    const sizeClasses = {
        'sm': 'max-w-sm',
        'md': 'max-w-md',
        'lg': 'max-w-lg',
        'xl': 'max-w-2xl'
    }

    const variantClasses = {
        'primary': 'bg-blue-600 hover:bg-blue-700 text-white',
        'secondary': 'bg-slate-600 hover:bg-slate-700 text-white',
        'danger': 'bg-red-600 hover:bg-red-700 text-white'
    }

    return (
        <div 
            className={`
                fixed inset-0 z-50 flex items-center justify-center
                bg-black/50 backdrop-blur-sm ${overlayClassName}
            `}
            onClick={onClose}
        >
            <div
                className={`
                    bg-white dark:bg-slate-800 rounded-lg shadow-xl
                    ${sizeClasses[size]} w-11/12 max-h-[90vh] overflow-y-auto
                    ${className}
                `}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                {(title || closeButton) && (
                    <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                        {title && <h2 className="text-xl font-bold">{title}</h2>}
                        {!title && <div />}
                        {closeButton && (
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="p-6">
                    {children}
                </div>

                {/* Footer with Actions */}
                {actions && actions.length > 0 && (
                    <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700 justify-end">
                        {actions.map((action, idx) => (
                            <button
                                key={idx}
                                onClick={action.onClick}
                                className={`
                                    px-4 py-2 rounded-lg font-medium transition-all
                                    ${variantClasses[action.variant || 'secondary']}
                                    ${action.className || ''}
                                `}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
