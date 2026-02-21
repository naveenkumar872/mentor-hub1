import React, { useContext, useState } from 'react';
import { ThemeContext } from '../App';
import {
    Download, FileText, Table2, FileSpreadsheet,
    CheckCircle2, Calendar, BarChart2, ClipboardList,
    TrendingUp, Award, Tag, Layers
} from 'lucide-react';
import '../styles/ExportReports.css';

const REPORT_TYPES = [
    { value: 'performance',  label: 'Performance Report',  icon: TrendingUp,    desc: 'Scores, pass rates & trends' },
    { value: 'progress',     label: 'Progress Report',     icon: BarChart2,     desc: 'Skill growth over time' },
    { value: 'analytics',   label: 'Analytics Report',    icon: ClipboardList, desc: 'Detailed submission analytics' },
    { value: 'achievements', label: 'Achievements Report', icon: Award,         desc: 'Badges & milestones earned' },
];

const DATE_RANGES = [
    { value: 'week',    label: 'Last 7 Days' },
    { value: 'month',   label: 'Last 30 Days' },
    { value: 'quarter', label: 'Last 90 Days' },
    { value: 'year',    label: 'Last Year' },
    { value: 'alltime', label: 'All Time' },
];

const FORMATS = [
    {
        id: 'pdf',
        label: 'PDF',
        icon: FileText,
        description: 'Printable report — opens print dialog in new tab',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)',
    },
    {
        id: 'xlsx',
        label: 'Excel',
        icon: FileSpreadsheet,
        description: 'Open directly in Microsoft Excel or Google Sheets',
        color: '#16a34a',
        bg: 'rgba(22,163,74,0.12)',
    },
    {
        id: 'csv',
        label: 'CSV',
        icon: Table2,
        description: 'Comma-separated values, works in any spreadsheet app',
        color: '#2563eb',
        bg: 'rgba(37,99,235,0.12)',
    },
];

const INCLUDES = [
    { icon: ClipboardList, text: 'Problems solved and success rate' },
    { icon: TrendingUp,    text: 'Score trends and skill progression' },
    { icon: Award,         text: 'Achievements and badges earned' },
    { icon: Layers,        text: 'Category-wise performance breakdown' },
    { icon: Tag,           text: 'Difficulty distribution analysis' },
    { icon: Calendar,      text: 'Full submission history with dates' },
];

const ExportReports = () => {
    const { theme } = useContext(ThemeContext);
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
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ format, reportType, dateRange }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Server error ${response.status}`);
            }

            if (format === 'pdf') {
                const html = await response.text();
                const win  = window.open('', '_blank');
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
            console.error('Export error:', err);
            setError(err.message || 'Export failed. Please try again.');
        } finally {
            setLoadingFmt(null);
        }
    };

    const selectedReport = REPORT_TYPES.find(r => r.value === reportType);
    const selectedRange  = DATE_RANGES.find(d => d.value === dateRange);

    return (
        <div className={`er-page ${theme}`}>
            {/* Page Header */}
            <div className="er-page-header">
                <div className="er-header-icon">
                    <Download size={22} />
                </div>
                <div>
                    <h1 className="er-page-title">Export Reports</h1>
                    <p className="er-page-subtitle">
                        Generate and download your performance data in multiple formats
                    </p>
                </div>
            </div>

            <div className="er-layout">
                {/* ── Left Column ── */}
                <div className="er-left">

                    {/* Report Type */}
                    <div className="er-card">
                        <div className="er-card-header">
                            <BarChart2 size={15} />
                            <span>Report Type</span>
                        </div>
                        <div className="er-type-list">
                            {REPORT_TYPES.map(rt => {
                                const Icon = rt.icon;
                                return (
                                    <button
                                        key={rt.value}
                                        className={`er-type-btn ${reportType === rt.value ? 'active' : ''}`}
                                        onClick={() => setReportType(rt.value)}
                                    >
                                        <span className="er-type-icon-wrap">
                                            <Icon size={16} />
                                        </span>
                                        <span className="er-type-text">
                                            <span className="er-type-label">{rt.label}</span>
                                            <span className="er-type-desc">{rt.desc}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date Range */}
                    <div className="er-card">
                        <div className="er-card-header">
                            <Calendar size={15} />
                            <span>Date Range</span>
                        </div>
                        <div className="er-pills">
                            {DATE_RANGES.map(dr => (
                                <button
                                    key={dr.value}
                                    className={`er-pill ${dateRange === dr.value ? 'active' : ''}`}
                                    onClick={() => setDateRange(dr.value)}
                                >
                                    {dr.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* What's Included */}
                    <div className="er-card er-includes-card">
                        <div className="er-card-header">
                            <CheckCircle2 size={15} />
                            <span>What's Included</span>
                        </div>
                        <ul className="er-includes">
                            {INCLUDES.map((item, i) => {
                                const Icon = item.icon;
                                return (
                                    <li key={i}>
                                        <Icon size={13} />
                                        <span>{item.text}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>

                {/* ── Right Column ── */}
                <div className="er-right">

                    {/* Selection Summary Banner */}
                    <div className="er-summary-banner">
                        {selectedReport && React.createElement(selectedReport.icon, { size: 18 })}
                        <div className="er-summary-text">
                            <span className="er-summary-title">{selectedReport?.label}</span>
                            <span className="er-summary-range">· {selectedRange?.label}</span>
                        </div>
                    </div>

                    {/* Download Format Cards */}
                    <div className="er-formats">
                        {FORMATS.map(fmt => {
                            const Icon = fmt.icon;
                            const isLoading  = loadingFmt === fmt.id;
                            const isDisabled = loadingFmt !== null;
                            return (
                                <div
                                    key={fmt.id}
                                    className={`er-fmt-card ${isLoading ? 'loading' : ''}`}
                                >
                                    <div className="er-fmt-icon" style={{ background: fmt.bg, color: fmt.color }}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="er-fmt-body">
                                        <div className="er-fmt-label">{fmt.label}</div>
                                        <div className="er-fmt-desc">{fmt.description}</div>
                                    </div>
                                    <button
                                        className="er-fmt-btn"
                                        style={{ '--btn-color': fmt.color }}
                                        onClick={() => handleExport(fmt.id)}
                                        disabled={isDisabled}
                                    >
                                        {isLoading
                                            ? <><span className="er-spinner" /> Generating…</>
                                            : <><Download size={14} /> Download</>
                                        }
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Feedback */}
                    {success && (
                        <div className="er-feedback success">
                            <CheckCircle2 size={15} />
                            {success}
                        </div>
                    )}
                    {error && (
                        <div className="er-feedback error">
                            ⚠ {error}
                        </div>
                    )}

                    {/* Tips */}
                    <div className="er-tips">
                        <div className="er-tips-title">Format Guide</div>
                        <ul>
                            <li>
                                <strong>PDF</strong> — Opens a styled report in a new tab.
                                Press <kbd>Ctrl+P</kbd> → <em>Save as PDF</em> to download.
                            </li>
                            <li>
                                <strong>Excel (.xls)</strong> — Downloads a spreadsheet you can
                                open directly in Excel or Google Sheets.
                            </li>
                            <li>
                                <strong>CSV</strong> — A universal format compatible with any
                                spreadsheet or data tool. Includes UTF-8 BOM for proper encoding.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportReports;
