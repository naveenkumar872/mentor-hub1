import { TrendingUp, TrendingDown } from 'lucide-react'

/**
 * Reusable Stats Card Component
 * Reduces duplication across dashboard pages
 * Usage: <StatsCard label="Problems Completed" value={42} change={15} icon={<Award />} />
 */
export default function StatsCard({ 
    label,
    value, 
    subtext = '',
    change = null,  // % change
    changeType = 'up',  // 'up', 'down', or 'neutral'
    icon = null,
    onClick = null,
    className = '',
    trend = null  // Custom trend component
}) {
    const isUp = changeType === 'up'
    const isDown = changeType === 'down'
    
    const changeColor = isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-slate-400'
    const bgColor = isUp ? 'bg-green-500/10' : isDown ? 'bg-red-500/10' : 'bg-slate-500/10'

    return (
        <div 
            onClick={onClick}
            className={`
                bg-white dark:bg-slate-800 rounded-lg shadow-md p-6 
                hover:shadow-lg transition-all border border-slate-200 dark:border-slate-700
                ${onClick ? 'cursor-pointer' : ''}
                ${className}
            `}
        >
            <div className="flex items-start justify-between gap-4">
                {/* Left: Content */}
                <div className="flex-1">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                        {label}
                    </p>
                    <p className="text-3xl font-bold dark:text-white">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </p>
                    
                    {/* Subtext or Change */}
                    {change !== null ? (
                        <p className={`text-sm font-medium mt-2 flex items-center gap-1 ${changeColor}`}>
                            {isUp && <TrendingUp size={16} />}
                            {isDown && <TrendingDown size={16} />}
                            {Math.abs(change)}% {isUp ? 'increase' : isDown ? 'decrease' : 'change'}
                        </p>
                    ) : subtext ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            {subtext}
                        </p>
                    ) : null}
                </div>

                {/* Right: Icon */}
                {icon && (
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${bgColor} ${changeColor}`}>
                        {icon}
                    </div>
                )}
            </div>

            {/* Custom Trend Component */}
            {trend && (
                <div className="mt-4">
                    {trend}
                </div>
            )}
        </div>
    )
}
