import React, { useContext, useState } from 'react';
import { ThemeContext } from '../App';
import {
    Download, FileText, Table2, FileSpreadsheet,
    CheckCircle2, Calendar, BarChart2, ClipboardList,
    TrendingUp, Award, Tag, Layers, ChevronRight
} from 'lucide-react';

const REPORT_TYPES = [
    { value: 'performance',  label: 'Performance Report',  icon: TrendingUp,    desc: 'Scores, pass rates & trends',       color: '#6366f1' },
    { value: 'progress',     label: 'Progress Report',     icon: BarChart2,     desc: 'Skill growth over time',            color: '#0ea5e9' },
    { value: 'analytics',   label: 'Analytics Report',    icon: ClipboardList, desc: 'Detailed submission analytics',     color: '#f59e0b' },
    { value: 'achievements', label: 'Achievements Report', icon: Award,         desc: 'Badges & milestones earned',        color: '#10b981' },
];

const DATE_RANGES = [
    { value: 'week',    label: 'Last 7 Days' },
    { value: 'month',   label: 'Last 30 Days' },
    { value: 'quarter', label: 'Last 90 Days' },
    { value: 'year',    label: 'Last Year' },
    { value: 'alltime', label: 'All Time' },
];

const FORMATS = [
    { id: 'pdf',  label: 'PDF',   icon: FileText,        desc: 'Printable – opens in new tab',              color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, desc: 'Open in Excel or Google Sheets',           color: '#16a34a', bg: 'rgba(22,163,74,0.12)'  },
    { id: 'csv',  label: 'CSV',   icon: Table2,          desc: 'Universal spreadsheet format',             color: '#2563eb', bg: 'rgba(37,99,235,0.12)'  },
];

const INCLUDES = [
    { icon: ClipboardList, text: 'Problems solved and success rate' },
    { icon: TrendingUp,    text: 'Score trends and skill progression' },
    { icon: Award,         text: 'Achievements and badges earned' },
    { icon: Layers,        text: 'Category-wise performance breakdown' },
    { icon: Tag,           text: 'Difficulty distribution analysis' },
    { icon: Calendar,      text: 'Full submission history with dates' },
];

const s = {
    page: (dark) => ({
        padding: '32px',
        minHeight: '100%',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: dark ? '#e2e8f0' : '#1e293b',
        maxWidth: '1100px',
    }),
    header: {
        marginBottom: '32px',
    },
    headerTop: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        marginBottom: '6px',
    },
    headerIcon: {
        width: '48px',
        height: '48px',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        flexShrink: 0,
        boxShadow: '0 4px 14px rgba(79,70,229,0.4)',
    },
    title: { fontSize: '24px', fontWeight: 800, margin: 0 },
    subtitle: { fontSize: '14px', opacity: 0.5, margin: '4px 0 0 62px' },
    layout: {
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: '24px',
        alignItems: 'start',
    },
    card: (dark) => ({
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '16px',
        border: `1px solid ${dark ? '#2d3748' : '#e2e8f0'}`,
        background: dark ? '#1a2035' : '#ffffff',
        boxShadow: dark ? 'none' : '0 1px 6px rgba(0,0,0,0.06)',
    }),
    cardLabel: {
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        opacity: 0.4,
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    typeBtn: (dark, active, color) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        padding: '12px 14px',
        borderRadius: '10px',
        border: `1.5px solid ${active ? color : 'transparent'}`,
        background: active ? `${color}18` : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        marginBottom: '6px',
        color: dark ? '#e2e8f0' : '#1e293b',
    }),
    typeIconWrap: (active, color) => ({
        width: '34px',
        height: '34px',
        borderRadius: '9px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: active ? color : `${color}20`,
        color: active ? '#fff' : color,
        transition: 'all 0.15s',
    }),
    typeLabel: { fontSize: '13px', fontWeight: 600, display: 'block' },
    typeDesc: { fontSize: '11px', opacity: 0.5, display: 'block', marginTop: '1px' },
    pills: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
    pill: (dark, active) => ({
        padding: '6px 14px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: 600,
        border: `1.5px solid ${active ? '#4f46e5' : (dark ? '#2d3748' : '#cbd5e1')}`,
        background: active ? '#4f46e5' : 'transparent',
        color: active ? '#fff' : (dark ? '#94a3b8' : '#64748b'),
        cursor: 'pointer',
        transition: 'all 0.15s',
    }),
    includesList: { listStyle: 'none', margin: 0, padding: 0 },
    includesItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '13px',
        padding: '7px 0',
        borderBottom: '1px solid transparent',
        opacity: 0.75,
    },
    right: { display: 'flex', flexDirection: 'column', gap: '14px' },
    summaryBanner: (dark, color) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 18px',
        borderRadius: '12px',
        border: `1px solid ${color}40`,
        background: `${color}12`,
        color: color,
        fontWeight: 600,
        fontSize: '14px',
    }),
    fmtCard: (dark) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '18px 20px',
        borderRadius: '14px',
        border: `1px solid ${dark ? '#2d3748' : '#e2e8f0'}`,
        background: dark ? '#1a2035' : '#ffffff',
        boxShadow: dark ? 'none' : '0 1px 6px rgba(0,0,0,0.06)',
        transition: 'transform 0.15s, box-shadow 0.15s',
    }),
    fmtIconBox: (bg, color) => ({
        width: '46px',
        height: '46px',
        borderRadius: '12px',
        background: bg,
        color: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    }),
    fmtLabel: { fontSize: '15px', fontWeight: 700, marginBottom: '2px' },
    fmtDesc: { fontSize: '12px', opacity: 0.5 },
    fmtBtn: (color, disabled) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 18px',
        borderRadius: '9px',
        border: 'none',
        fontSize: '13px',
        fontWeight: 700,
        color: '#fff',
        background: color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'opacity 0.15s, transform 0.15s',
        boxShadow: disabled ? 'none' : `0 4px 12px ${color}55`,
    }),
    feedback: (type) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 500,
        background: type === 'success' ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
        color: type === 'success' ? '#16a34a' : '#ef4444',
    }),
    tipsBox: (dark) => ({
        padding: '16px 18px',
        borderRadius: '12px',
        border: `1px dashed ${dark ? '#2d3748' : '#cbd5e1'}`,
        background: dark ? '#131929' : '#f8fafc',
        fontSize: '12.5px',
    }),
    tipsLabel: {
        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.8px', opacity: 0.4, marginBottom: '10px',
    },
};

const ExportReports = () => {
    const { theme } = useContext(ThemeContext);
    const dark = theme === 'dark';
    const [reportType, setReportType] = useState('performance');
    const [dateRange, setDateRange]   = useState('month');
    const [loadingFmt, setLoadingFmt] = useState(null);
    const [success, setSuccess]       = useState(null);
    const [error, setError]           = useState(null);
    const token = localStorage.getItem('authToken');

    const handleExport = async (format) => {
        setLoadingFmt(format);
        setError(null);
        setSuccess(null);
        try {
            const response = await fetch('/api/reports/export', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ format, reportType, dateRange }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Server error ${response.status}`);
            }
            if (format === 'pdf') {
                const html = await response.text();
                const win = window.open('', '_blank');
                win.document.write(html);
                win.document.close();
            } else {
                const blob = await response.blob();
                const ext  = format === 'xlsx' ? 'xls' : 'csv';
                const url  = window.URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
            const label = format === 'pdf' ? 'opened in new tab' : 'downloaded';
            setSuccess(`${format.toUpperCase()} report ${label} successfully!`);
            setTimeout(() => setSuccess(null), 5000);
        } catch (err) {
            setError(err.message || 'Export failed. Please try again.');
        } finally {
            setLoadingFmt(null);
        }
    };

    const selectedReport = REPORT_TYPES.find(r => r.value === reportType);
    const selectedRange  = DATE_RANGES.find(d => d.value === dateRange);

    return (
        <div style={s.page(dark)}>
            {/* Header */}
            <div style={s.header}>
                <div style={s.headerTop}>
                    <div style={s.headerIcon}><Download size={22} /></div>
                    <div>
                        <h1 style={s.title}>Export Reports</h1>
                    </div>
                </div>
                <p style={s.subtitle}>Generate and download your performance data in multiple formats</p>
            </div>

            <div style={s.layout}>
                {/* Left */}
                <div>
                    {/* Report Type */}
                    <div style={s.card(dark)}>
                        <div style={s.cardLabel}><BarChart2 size={13}/> Report Type</div>
                        {REPORT_TYPES.map(rt => {
                            const active = reportType === rt.value;
                            const Icon = rt.icon;
                            return (
                                <button
                                    key={rt.value}
                                    style={s.typeBtn(dark, active, rt.color)}
                                    onClick={() => setReportType(rt.value)}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = dark ? '#2d3748' : '#f1f5f9'; }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={s.typeIconWrap(active, rt.color)}>
                                        <Icon size={16} />
                                    </div>
                                    <div>
                                        <span style={s.typeLabel}>{rt.label}</span>
                                        <span style={s.typeDesc}>{rt.desc}</span>
                                    </div>
                                    {active && <ChevronRight size={14} style={{ marginLeft: 'auto', color: rt.color }} />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Date Range */}
                    <div style={s.card(dark)}>
                        <div style={s.cardLabel}><Calendar size={13}/> Date Range</div>
                        <div style={s.pills}>
                            {DATE_RANGES.map(dr => (
                                <button
                                    key={dr.value}
                                    style={s.pill(dark, dateRange === dr.value)}
                                    onClick={() => setDateRange(dr.value)}
                                >
                                    {dr.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* What's Included */}
                    <div style={s.card(dark)}>
                        <div style={s.cardLabel}><CheckCircle2 size={13}/> What's Included</div>
                        <ul style={s.includesList}>
                            {INCLUDES.map((item, i) => {
                                const Icon = item.icon;
                                return (
                                    <li key={i} style={{
                                        ...s.includesItem,
                                        borderBottom: i < INCLUDES.length - 1
                                            ? `1px solid ${dark ? '#2d374850' : '#e2e8f040'}` : 'none'
                                    }}>
                                        <Icon size={14} style={{ color: '#4f46e5', flexShrink: 0 }} />
                                        <span>{item.text}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>

                {/* Right */}
                <div style={s.right}>
                    {/* Summary Banner */}
                    <div style={s.summaryBanner(dark, selectedReport?.color || '#4f46e5')}>
                        {selectedReport && React.createElement(selectedReport.icon, { size: 20 })}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, fontSize: '15px' }}>{selectedReport?.label}</span>
                            <span style={{ fontSize: '12px', opacity: 0.65, fontWeight: 400 }}>{selectedRange?.label} Â· Ready to export</span>
                        </div>
                    </div>

                    {/* Format Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {FORMATS.map(fmt => {
                            const Icon = fmt.icon;
                            const isLoading  = loadingFmt === fmt.id;
                            const isDisabled = loadingFmt !== null;
                            return (
                                <div key={fmt.id} style={s.fmtCard(dark)}>
                                    <div style={s.fmtIconBox(fmt.bg, fmt.color)}>
                                        <Icon size={22} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={s.fmtLabel}>{fmt.label}</div>
                                        <div style={s.fmtDesc}>{fmt.desc}</div>
                                    </div>
                                    <button
                                        style={s.fmtBtn(fmt.color, isDisabled)}
                                        onClick={() => handleExport(fmt.id)}
                                        disabled={isDisabled}
                                        onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                                    >
                                        {isLoading ? (
                                            <>
                                                <span style={{
                                                    width: '14px', height: '14px',
                                                    border: '2px solid rgba(255,255,255,0.35)',
                                                    borderTopColor: '#fff', borderRadius: '50%',
                                                    display: 'inline-block',
                                                    animation: 'er-spin 0.7s linear infinite',
                                                }} />
                                                Generatingâ€¦
                                            </>
                                        ) : (
                                            <><Download size={14} /> Download</>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {success && (
                        <div style={s.feedback('success')}>
                            <CheckCircle2 size={16} /> {success}
                        </div>
                    )}
                    {error && (
                        <div style={s.feedback('error')}>
                            âš  {error}
                        </div>
                    )}

                    {/* Tips */}
                    <div style={s.tipsBox(dark)}>
                        <div style={s.tipsLabel}>Format Guide</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.7, lineHeight: 1.6 }}>
                            <div><strong>PDF</strong> â€” Opens styled report in new tab. Press <kbd style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '11px', background: dark ? '#2d3748' : '#e2e8f0', fontFamily: 'monospace' }}>Ctrl+P</kbd> â†’ Save as PDF to download.</div>
                            <div><strong>Excel</strong> â€” Downloads a spreadsheet you can open directly in Excel or Google Sheets.</div>
                            <div><strong>CSV</strong> â€” Universal format compatible with any spreadsheet or data tool.</div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`@keyframes er-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default ExportReports;

