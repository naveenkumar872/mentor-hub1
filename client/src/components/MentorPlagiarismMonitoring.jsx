/**
 * Mentor Plagiarism Monitoring
 * Monitors plagiarism among mentor's assigned students
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, TrendingUp, Users, Zap } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';

export default function MentorPlagiarismMonitoring({ mentorId, mentorName }) {
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [problemStats, setProblemStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load mentor's plagiarism data
  useEffect(() => {
    fetchMentorPlagiarismStats();
  }, []);

  const fetchMentorPlagiarismStats = async () => {
    try {
      setLoading(true);

      // Get reports for this mentor's students
      const response = await axios.get(`${API_BASE}/plagiarism/reports?limit=100`, {
        params: { mentorId }
      });

      setReports(response.data.data || response.data);

      // Calculate stats
      const critical = response.data.data?.filter(r => r.intensity === 'CRITICAL').length || 0;
      const high = response.data.data?.filter(r => r.intensity === 'HIGH').length || 0;
      const suspicious = critical + high;
      const avgScore = response.data.data?.length > 0
        ? Math.round(
          response.data.data.reduce((sum, r) => sum + Number(r.suspicionScore), 0) /
          response.data.data.length
        )
        : 0;

      setStats({
        totalReports: response.data.data?.length || 0,
        suspiciousSubmissions: suspicious,
        criticalFlags: critical,
        highFlags: high,
        averageSuspicion: avgScore
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProblemStats = async (problemId) => {
    try {
      const response = await axios.get(`${API_BASE}/plagiarism/problem-stats/${problemId}`);
      setProblemStats(response.data);
    } catch (error) {
      console.error('Failed to load problem stats:', error);
    }
  };

  const handleAnalyzeProblem = async (problemId, problemTitle) => {
    try {
      const result = await axios.post(`${API_BASE}/plagiarism/batch-analyze/${problemId}`);
      alert(`✅ Analysis complete!\n\n${result.data.reportsGenerated} reports generated for "${problemTitle}"`);
      fetchMentorPlagiarismStats();
    } catch (error) {
      alert('Error analyzing problem: ' + error.message);
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
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', color: '#1e293b', margin: '0 0 8px 0' }}>
          👀 Plagiarism Monitoring - Your Students
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>Monitor code similarity among your assigned students</p>
      </div>

      {/* Quick Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <div style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Total Reports</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>{stats.totalReports}</div>
          </div>

          <div style={{
            background: '#fadbd8',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #e74c3c',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#c0392b', marginBottom: '8px' }}>Critical Flags</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#e74c3c' }}>{stats.criticalFlags}</div>
          </div>

          <div style={{
            background: '#fdebd0',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #f39c12',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#d68910', marginBottom: '8px' }}>High Priority</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f39c12' }}>{stats.highFlags}</div>
          </div>

          <div style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Avg Suspicion %</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>{stats.averageSuspicion}%</div>
          </div>
        </div>
      )}

      {/* Risk Breakdown */}
      <div style={{
        background: '#fff',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '32px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 16px 0' }}>Risk Assessment</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[
            {
              label: '🔴 Critical (>85%)',
              count: stats?.criticalFlags || 0,
              action: 'Immediate Review'
            },
            {
              label: '🟠 High (70-85%)',
              count: stats?.highFlags || 0,
              action: 'Follow Up'
            },
            {
              label: '🟡 Medium (50-70%)',
              count: reports?.filter(r => r.intensity === 'MEDIUM').length || 0,
              action: 'Monitor'
            },
            {
              label: '🟢 Low (<50%)',
              count: reports?.filter(r => r.intensity === 'LOW').length || 0,
              action: 'Watch'
            }
          ].map((risk, idx) => (
            <div key={idx} style={{
              padding: '16px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>{risk.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3498db', marginBottom: '8px' }}>{risk.count}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{risk.action}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Student Reports */}
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Student Submissions - Flagged</h3>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{reports.length} submissions</span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading reports...</div>
        ) : reports.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>✅ No suspicious plagiarism detected</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#64748b' }}>STUDENT</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#64748b' }}>PROBLEM</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b' }}>SCORE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b' }}>INTENSITY</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b' }}>MATCHES</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#64748b' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {reports.slice(0, 20).map((report, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
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
                      <button
                        onClick={() => setSelectedProblem(report.id === selectedProblem ? null : report.id)}
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
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tips Section */}
      <div style={{
        marginTop: '32px',
        background: '#e8f4f8',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #3498db',
        borderLeft: '4px solid #3498db'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 12px 0' }}>💡 Best Practices</h3>
        <ul style={{ color: '#1e293b', fontSize: '14px', margin: 0, paddingLeft: '20px' }}>
          <li>Review flagged submissions immediately with students</li>
          <li>Discuss coding patterns and approaches with students</li>
          <li>Encourage peer learning but maintain academic integrity</li>
          <li>DocumentConversations and findings for records</li>
          <li>Use this as a teaching tool, not just punishment</li>
        </ul>
      </div>
    </div>
  );
}
