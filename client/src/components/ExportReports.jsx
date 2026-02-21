import React, { useContext, useState } from 'react';
import { ThemeContext } from '../App';
import { Download, FileText, BarChart3 } from 'lucide-react';
import '../styles/ExportReports.css';

const ExportReports = () => {
    const { theme } = useContext(ThemeContext);
    const [exporting, setExporting] = useState(false);
    const [reportType, setReportType] = useState('performance');
    const [dateRange, setDateRange] = useState('month');
    const token = localStorage.getItem('authToken');

    const handleExport = async (format) => {
        setExporting(true);
        try {
            const response = await fetch(
                `/api/reports/export?type=${reportType}&range=${dateRange}&format=${format}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `report-${reportType}-${format}`;
                a.click();
            }
        } catch (error) {
            console.error('Export error:', error);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className={`export-reports ${theme}`}>
            <div className="export-header">
                <h2>
                    <Download size={24} />
                    Export Reports
                </h2>
            </div>

            <div className="export-options">
                <div className="option-group">
                    <label>Report Type</label>
                    <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
                        <option value="performance">Performance Report</option>
                        <option value="progress">Progress Report</option>
                        <option value="analytics">Analytics Report</option>
                        <option value="achievements">Achievements Report</option>
                    </select>
                </div>

                <div className="option-group">
                    <label>Date Range</label>
                    <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="quarter">Last 90 Days</option>
                        <option value="year">Last Year</option>
                        <option value="alltime">All-Time</option>
                    </select>
                </div>
            </div>

            <div className="export-formats">
                <button 
                    className="export-btn pdf"
                    onClick={() => handleExport('pdf')}
                    disabled={exporting}
                >
                    <FileText size={20} />
                    Download PDF
                </button>
                <button 
                    className="export-btn excel"
                    onClick={() => handleExport('xlsx')}
                    disabled={exporting}
                >
                    <BarChart3 size={20} />
                    Download Excel
                </button>
                <button 
                    className="export-btn csv"
                    onClick={() => handleExport('csv')}
                    disabled={exporting}
                >
                    <Download size={20} />
                    Download CSV
                </button>
            </div>

            {exporting && <div className="exporting">Generating report...</div>}

            <div className="report-info">
                <h4>Report Includes:</h4>
                <ul>
                    <li>✓ Problems solved and success rate</li>
                    <li>✓ Time spent and skill progression</li>
                    <li>✓ Achievements and badges earned</li>
                    <li>✓ Category-wise performance</li>
                    <li>✓ Ranking and percentile</li>
                    <li>✓ Detailed analytics and trends</li>
                </ul>
            </div>
        </div>
    );
};

export default ExportReports;
