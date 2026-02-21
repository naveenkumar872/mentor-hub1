/**
 * Admin Plagiarism Detection Dashboard
 * Comprehensive plagiarism monitoring and management for administrators
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, TrendingUp, Flag, CheckCircle, XCircle, MessageCircle } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

export default function AdminPlagiarismDashboard({ adminId, adminName }) {
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [filterIntensity, setFilterIntensity] = useState('HIGH');
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewingId, setReviewingId] = useState(null);

  // Load dashboard stats
  useEffect(() => {
    fetchDashboardStats();
    fetchReports();
  }, [filterIntensity]);

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/plagiarism/dashboard-stats?timeRange=30&minIntensity=${filterIntensity}`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/plagiarism/reports?minIntensity=${filterIntensity}&limit=50`);
      setReports(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = async (reportId) => {
    try {
      await axios.put(`${API_BASE}/plagiarism/reports/${reportId}/review`, {
        reviewedBy: adminId,
        reviewNotes: reviewNotes,
        finalDecision: 'needs_investigation'
      });
      setReviewNotes('');
      setReviewingId(null);
      fetchReports();
      alert('Report reviewed successfully');
    } catch (error) {
      alert('Error reviewing report: ' + error.message);
    }
  };

  const getIntensityColor = (intensity) => {
    switch (intensity) {
      case 'CRITICAL': return '#e74c3c';
      case 'HIGH': return '#f39c12';
      case 'MEDIUM': return '#f1c40f';
      case 'LOW': return '#27ae60';
      default: return '#95a5a6';
    }
  };

  const getIntensityBgColor = (intensity) => {
    switch (intensity) {
      case 'CRITICAL': return '#fadbd8';
      case 'HIGH': return '#fdebd0';
      case 'MEDIUM': return '#fef5e7';
      case 'LOW': return '#d4edda';
      default: return '#ecf0f1';
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', color: '#1e293b', margin: '0 0 8px 0' }}>
          🔒 Plagiarism Detection Dashboard
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>Monitor code similarity and academic integrity across all submissions</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Flag size={20} color='#e74c3c' />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Flagged Submissions</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1e293b' }}>{stats.flaggedCount || 0}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Last 30 days</div>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <TrendingUp size={20} color='#f39c12' />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Avg Suspicion Score</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1e293b' }}>{stats.averageSuspicion}%</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Across all flagged</div>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <MessageCircle size={20} color='#3498db' />
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Pending Reviews</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1e293b' }}>{stats.pendingReviews || 0}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Awaiting action</div>
          </div>
        </div>
      )}

      {/* Intensity Distribution */}
      {stats && stats.intensityBreakdown && (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 16px 0' }}>Violation Intensity Distribution</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(intensity => (
              <div key={intensity} style={{
                padding: '16px',
                borderRadius: '8px',
                background: getIntensityBgColor(intensity),
                border: `2px solid ${getIntensityColor(intensity)}`,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: getIntensityColor(intensity) }}>{intensity}</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: getIntensityColor(intensity), marginTop: '8px' }}>
                  {stats.intensityBreakdown[intensity] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <label style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Filter by Intensity:</label>
        <select
          value={filterIntensity}
          onChange={(e) => setFilterIntensity(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <option value='CRITICAL'>🔴 Critical (&gt;85%)</option>
          <option value='HIGH'>🟠 High (&gt;70%)</option>
          <option value='MEDIUM'>🟡 Medium (&gt;50%)</option>
          <option value='LOW'>🟢 All Flagged</option>
        </select>
      </div>

      {/* Reports List */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Plagiarism Reports</h3>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{reports.length} reports</span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading reports...</div>
        ) : reports.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No reports found</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Student</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Problem</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Score</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Intensity</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Matches</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{report.studentName}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#64748b' }}>{report.problemTitle || 'N/A'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: getIntensityBgColor(report.intensity),
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: getIntensityColor(report.intensity)
                      }}>
                        {report.suspicionScore}%
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: getIntensityBgColor(report.intensity),
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: getIntensityColor(report.intensity)
                      }}>
                        {report.intensity}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>{report.suspiciousMatches}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {report.reviewStatus === 'reviewed' ? (
                        <span style={{ color: '#27ae60', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <CheckCircle size={14} /> Reviewed
                        </span>
                      ) : (
                        <span style={{ color: '#f39c12', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <AlertTriangle size={14} /> Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => setSelectedReport(report.id === selectedReport ? null : report.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#3498db',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {selectedReport === report.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Report Details */}
      {selectedReport && (
        <div style={{ marginTop: '32px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 16px 0' }}>Report Details</h3>

          {/* Review Section */}
          <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', display: 'block', marginBottom: '8px' }}>
              Review Notes:
            </label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder='Enter your review notes...'
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                fontFamily: 'inherit',
                minHeight: '100px',
                resize: 'vertical'
              }}
            />
            <button
              onClick={() => handleReviewSubmit(selectedReport)}
              style={{
                marginTop: '12px',
                padding: '10px 16px',
                background: '#27ae60',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Submit Review
            </button>
          </div>

          {/* Recommendation */}
          <div style={{ background: '#fff', padding: '16px', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: '0 0 12px 0' }}>Recommended Actions:</h4>
            <ul style={{ color: '#64748b', fontSize: '14px', margin: 0, paddingLeft: '20px' }}>
              <li>Review the flagged submission with the student</li>
              <li>Compare with similar submissions</li>
              <li>Request explanation from student</li>
              <li>Document findings for records</li>
              <li>Take appropriate academic action if verified</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
