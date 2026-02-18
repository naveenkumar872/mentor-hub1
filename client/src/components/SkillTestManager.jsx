import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Brain, Plus, Trash2, ToggleLeft, ToggleRight, Users, CheckCircle, XCircle,
    Eye, X, ChevronDown, ChevronUp, Settings, Tag, FileText, Code, Database,
    MessageSquare, Clock, Target, Search, Hash, BarChart2, Shield, Sparkles, Zap,
    Camera, Mic, Maximize, ClipboardX, ScanFace, Video, Smartphone, Monitor,
    Check, Bot
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const SKILL_CATEGORIES = {
    'Languages': ['Python', 'JavaScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'TypeScript'],
    'Frontend': ['React', 'Angular', 'Vue.js', 'HTML', 'CSS'],
    'Backend': ['Node.js', 'Express.js', 'Django', 'Flask', 'Spring Boot'],
    'Databases': ['SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis'],
    'CS Fundamentals': ['Data Structures', 'Algorithms', 'System Design', 'OOP', 'Design Patterns'],
    'DevOps & Cloud': ['Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git', 'Linux'],
    'API & Web': ['REST API', 'GraphQL', 'Networking', 'Security', 'Testing'],
    'AI / ML': ['Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision']
};

const ALL_SKILLS = Object.values(SKILL_CATEGORIES).flat();

// Section card helper
const SectionCard = ({ icon, title, subtitle, color, children }) => (
    <div style={{
        background: '#1e293b', borderRadius: '14px', border: '1px solid #334155',
        overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
        <div style={{
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px',
            borderBottom: '1px solid #334155', background: `linear-gradient(135deg, ${color}18, ${color}08)`
        }}>
            <div style={{
                width: '32px', height: '32px', borderRadius: '8px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: `${color}25`, color: color
            }}>{icon}</div>
            <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>{title}</div>
                {subtitle && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{subtitle}</div>}
            </div>
        </div>
        <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
);

// Number input with +/- buttons
const NumberInput = ({ label, value, onChange, min, max, icon, color, suffix }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {icon} {label}
        </label>
        <div style={{
            display: 'flex', alignItems: 'center', borderRadius: '10px',
            border: '1px solid #475569', overflow: 'hidden', background: '#0f172a'
        }}>
            <button onClick={() => onChange(Math.max(min, value - 1))} style={{
                width: '36px', height: '40px', border: 'none', background: '#1e293b',
                cursor: 'pointer', fontSize: '18px', color: '#94a3b8', fontWeight: 600,
                borderRight: '1px solid #475569'
            }}>−</button>
            <input type="number" value={value} min={min} max={max}
                onChange={e => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
                style={{
                    flex: 1, textAlign: 'center', border: 'none', outline: 'none',
                    fontSize: '16px', fontWeight: 700, color: color || '#f1f5f9',
                    padding: '8px 4px', width: '100%', boxSizing: 'border-box',
                    background: 'transparent'
                }}
            />
            <button onClick={() => onChange(Math.min(max, value + 1))} style={{
                width: '36px', height: '40px', border: 'none', background: '#1e293b',
                cursor: 'pointer', fontSize: '18px', color: '#94a3b8', fontWeight: 600,
                borderLeft: '1px solid #475569'
            }}>+</button>
        </div>
        {suffix && <span style={{ fontSize: '10px', color: '#64748b', textAlign: 'center' }}>{suffix}</span>}
    </div>
);

export default function SkillTestManager() {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [viewAttempts, setViewAttempts] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({
        title: '', description: '', skills: [],
        difficulty_level: 'mixed',
        mcq_count: 10, coding_count: 3, sql_count: 3, interview_count: 5,
        attempt_limit: 1, mcq_duration_minutes: 30, coding_duration_minutes: 45, sql_duration_minutes: 45, interview_duration_minutes: 30,
        mcq_passing_score: 60, coding_passing_score: 50, sql_passing_score: 50, interview_passing_score: 6,
        proctoring_enabled: true,
        proctoring_config: {
            camera: true, mic: true, fullscreen: true,
            paste_disabled: true, face_detection: true,
            camera_block_detect: true, phone_detect: true
        }
    });
    const [skillSearch, setSkillSearch] = useState('');
    const [expandedCategory, setExpandedCategory] = useState(null);
    const [error, setError] = useState('');
    const [allStudents, setAllStudents] = useState([]);
    const [showStudentAllocationModal, setShowStudentAllocationModal] = useState(false);
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [allocatingTestId, setAllocatingTestId] = useState(null);
    const [studentSearchTerm, setStudentSearchTerm] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => { loadTests(); }, []);

    const loadTests = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`${API}/api/skill-tests/all`);
            setTests(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const createTest = async () => {
        if (!form.title.trim()) return setError('Title is required');
        if (form.skills.length === 0) return setError('Select at least one skill');
        setError('');
        setCreating(true);
        try {
            await axios.post(`${API}/api/skill-tests/create`, form);
            setShowCreate(false);
            setForm({ title: '', description: '', skills: [], difficulty_level: 'mixed', mcq_count: 10, coding_count: 3, sql_count: 3, interview_count: 5, attempt_limit: 1, mcq_duration_minutes: 30, coding_duration_minutes: 45, sql_duration_minutes: 45, interview_duration_minutes: 30, mcq_passing_score: 60, coding_passing_score: 50, sql_passing_score: 50, interview_passing_score: 6, proctoring_enabled: true, proctoring_config: { camera: true, mic: true, fullscreen: true, paste_disabled: true, face_detection: true, camera_block_detect: true, phone_detect: true } });
            loadTests();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setCreating(false);
        }
    };

    const toggleTest = async (id) => {
        try {
            await axios.put(`${API}/api/skill-tests/${id}/toggle`);
            loadTests();
        } catch (err) {
            setError(err.message);
        }
    };

    const deleteTest = async (id) => {
        if (!window.confirm('Delete this test and all its attempts?')) return;
        try {
            await axios.delete(`${API}/api/skill-tests/${id}`);
            loadTests();
        } catch (err) {
            setError(err.message);
        }
    };

    const fetchAllStudents = async () => {
        try {
            const { data } = await axios.get(`${API}/api/users?role=student`);
            setAllStudents(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Error fetching students:', e);
            setAllStudents([]);
        }
    };

    const openStudentAllocationModal = async (testId) => {
        await fetchAllStudents();
        setAllocatingTestId(testId);

        try {
            const { data } = await axios.get(`${API}/api/tests/${testId}/allocated-students`);
            setSelectedStudents(data.studentIds || []);
        } catch (e) {
            console.error('Error loading allocations:', e);
            setSelectedStudents([]);
        }

        setShowStudentAllocationModal(true);
    };

    const toggleStudentSelection = (studentId) => {
        setSelectedStudents(prev =>
            prev.includes(studentId)
                ? prev.filter(id => id !== studentId)
                : [...prev, studentId]
        );
    };

    const saveStudentAllocations = async () => {
        try {
            await axios.post(`${API}/api/tests/${allocatingTestId}/allocate-students`, {
                studentIds: selectedStudents
            });
            setShowStudentAllocationModal(false);
            setSelectedStudents([]);
            setAllocatingTestId(null);
            loadTests();
        } catch (e) {
            setError('Error saving allocations: ' + (e.response?.data?.error || e.message));
        }
    };

    const toggleSkill = (skill) => {
        setForm(f => ({
            ...f,
            skills: f.skills.includes(skill) ? f.skills.filter(s => s !== skill) : [...f.skills, skill]
        }));
    };

    const selectAllInCategory = (category) => {
        const catSkills = SKILL_CATEGORIES[category] || [];
        const allSelected = catSkills.every(s => form.skills.includes(s));
        setForm(f => ({
            ...f,
            skills: allSelected
                ? f.skills.filter(s => !catSkills.includes(s))
                : [...new Set([...f.skills, ...catSkills])]
        }));
    };

    const filteredSkills = skillSearch
        ? ALL_SKILLS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase()))
        : [];

    const stageColors = { passed: '#22c55e', failed: '#ef4444', in_progress: '#f59e0b', pending: '#6b7280' };

    // Filtered tests based on search
    const filteredTests = tests.filter(t =>
        (t.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.skills || []).some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Load attempts for a specific test
    const loadAttempts = async (testId) => {
        if (viewAttempts === testId) {
            setViewAttempts(null);
            return;
        }
        try {
            const { data } = await axios.get(`${API}/api/skill-tests/${testId}/attempts`);
            setAttempts(Array.isArray(data) ? data : []);
            setViewAttempts(testId);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setAttempts([]);
            setViewAttempts(testId);
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '12px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                    }}>
                        <Brain size={22} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f1f5f9' }}>Skill Test Management</h2>
                        <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>Create & manage AI-powered assessments</p>
                    </div>
                </div>
                <button onClick={() => { setShowCreate(!showCreate); setError(''); }} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 22px',
                    background: showCreate ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer',
                    fontWeight: 700, fontSize: '14px', boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
                    transition: 'all 0.2s'
                }}>
                    {showCreate ? <X size={18} /> : <Plus size={18} />}
                    {showCreate ? 'Cancel' : 'Create Test'}
                </button>
            </div>

            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: '#fca5a5',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px'
                }}>
                    <span><XCircle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{error}</span>
                    <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '4px' }}><X size={16} /></button>
                </div>
            )}

            {/* Create Form — Redesigned */}
            {showCreate && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(109,40,217,0.05))',
                    borderRadius: '16px', padding: '24px', marginBottom: '28px',
                    border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                }}>
                    {/* Form Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                        <Sparkles size={20} color="#8b5cf6" />
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#c4b5fd' }}>Create New Assessment</h3>
                    </div>

                    {/* Step 1: Basic Info */}
                    <SectionCard icon={<FileText size={16} />} title="Basic Information" subtitle="Name your assessment" color="#3b82f6">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>
                                    Test Title <span style={{ color: '#f87171' }}>*</span>
                                </label>
                                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="e.g., Full Stack Developer Assessment"
                                    style={{
                                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                                        border: '2px solid ' + (form.title ? '#8b5cf6' : '#475569'),
                                        fontSize: '14px', boxSizing: 'border-box', outline: 'none',
                                        transition: 'border-color 0.2s', background: '#0f172a', color: '#f1f5f9'
                                    }} />
                            </div>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>Description</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Brief description of this test"
                                    style={{
                                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                                        border: '2px solid #475569', fontSize: '14px', boxSizing: 'border-box',
                                        outline: 'none', transition: 'border-color 0.2s', background: '#0f172a', color: '#f1f5f9'
                                    }} />
                            </div>
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 2: Skills */}
                    <SectionCard icon={<Tag size={16} />} title="Skills Selection"
                        subtitle={`${form.skills.length} skill${form.skills.length !== 1 ? 's' : ''} selected`} color="#8b5cf6">

                        {/* Selected Skills Chips */}
                        {form.skills.length > 0 && (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px',
                                padding: '10px', background: 'rgba(139,92,246,0.1)', borderRadius: '10px', border: '1px dashed rgba(139,92,246,0.4)'
                            }}>
                                {form.skills.map(s => (
                                    <span key={s} onClick={() => toggleSkill(s)} style={{
                                        padding: '5px 12px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                        color: 'white', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600,
                                        boxShadow: '0 1px 3px rgba(139,92,246,0.3)', transition: 'transform 0.15s'
                                    }}>
                                        {s} <X size={12} />
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Search */}
                        <div style={{ position: 'relative', marginBottom: '12px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input value={skillSearch} onChange={e => setSkillSearch(e.target.value)}
                                placeholder="Search skills..." style={{
                                    width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px',
                                    border: '2px solid #475569', fontSize: '13px', boxSizing: 'border-box',
                                    outline: 'none', transition: 'border-color 0.2s', background: '#0f172a', color: '#f1f5f9'
                                }} />
                        </div>

                        {/* Search Results */}
                        {skillSearch && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', padding: '10px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px' }}>
                                {filteredSkills.length === 0 ? (
                                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>No skills found for "{skillSearch}"</span>
                                ) : filteredSkills.map(s => (
                                    <span key={s} onClick={() => toggleSkill(s)} style={{
                                        padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                                        fontWeight: 500, transition: 'all 0.15s',
                                        background: form.skills.includes(s) ? '#8b5cf6' : '#0f172a',
                                        color: form.skills.includes(s) ? 'white' : '#cbd5e1',
                                        border: '1px solid ' + (form.skills.includes(s) ? '#7c3aed' : '#475569'),
                                        boxShadow: form.skills.includes(s) ? '0 1px 3px rgba(139,92,246,0.3)' : 'none'
                                    }}>
                                        {form.skills.includes(s) ? '✓ ' : ''}{s}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Categorized Skills */}
                        {!skillSearch && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {Object.entries(SKILL_CATEGORIES).map(([category, skills]) => {
                                    const selectedInCat = skills.filter(s => form.skills.includes(s)).length;
                                    const isExpanded = expandedCategory === category;
                                    return (
                                        <div key={category} style={{
                                            border: '1px solid ' + (selectedInCat > 0 ? 'rgba(139,92,246,0.4)' : '#475569'),
                                            borderRadius: '10px', overflow: 'hidden',
                                            background: selectedInCat > 0 ? 'rgba(139,92,246,0.08)' : '#0f172a',
                                            transition: 'all 0.2s'
                                        }}>
                                            <div onClick={() => setExpandedCategory(isExpanded ? null : category)} style={{
                                                padding: '10px 14px', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>{category}</span>
                                                    {selectedInCat > 0 && (
                                                        <span style={{
                                                            padding: '1px 8px', borderRadius: '10px', fontSize: '11px',
                                                            background: '#8b5cf6', color: 'white', fontWeight: 700
                                                        }}>{selectedInCat}/{skills.length}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button onClick={(e) => { e.stopPropagation(); selectAllInCategory(category); }} style={{
                                                        padding: '3px 8px', borderRadius: '6px', border: '1px solid #475569',
                                                        background: selectedInCat === skills.length ? '#8b5cf6' : '#1e293b',
                                                        color: selectedInCat === skills.length ? 'white' : '#94a3b8',
                                                        fontSize: '10px', fontWeight: 600, cursor: 'pointer'
                                                    }}>
                                                        {selectedInCat === skills.length ? 'Deselect All' : 'Select All'}
                                                    </button>
                                                    {isExpanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div style={{
                                                    padding: '8px 14px 12px', borderTop: '1px solid #334155',
                                                    display: 'flex', flexWrap: 'wrap', gap: '6px'
                                                }}>
                                                    {skills.map(s => (
                                                        <span key={s} onClick={() => toggleSkill(s)} style={{
                                                            padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
                                                            cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s',
                                                            background: form.skills.includes(s) ? '#8b5cf6' : '#1e293b',
                                                            color: form.skills.includes(s) ? 'white' : '#cbd5e1',
                                                            border: '1px solid ' + (form.skills.includes(s) ? '#7c3aed' : '#475569'),
                                                            boxShadow: form.skills.includes(s) ? '0 1px 3px rgba(139,92,246,0.3)' : 'none'
                                                        }}>
                                                            {form.skills.includes(s) ? '✓ ' : ''}{s}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 3: Difficulty Level */}
                    <SectionCard icon={<Target size={16} />} title="Difficulty Level" subtitle="Set overall difficulty" color="#f59e0b">
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {[
                                { value: 'easy', label: 'Easy', desc: 'Beginner friendly', color: '#22c55e' },
                                { value: 'medium', label: 'Medium', desc: 'Intermediate level', color: '#f59e0b' },
                                { value: 'hard', label: 'Hard', desc: 'Advanced concepts', color: '#ef4444' },
                                { value: 'mixed', label: 'Mixed', desc: '30% easy, 50% medium, 20% hard', color: '#8b5cf6' }
                            ].map(d => (
                                <button key={d.value} onClick={() => setForm({ ...form, difficulty_level: d.value })} style={{
                                    flex: '1 1 140px', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                                    background: form.difficulty_level === d.value ? `${d.color}18` : '#0f172a',
                                    border: `2px solid ${form.difficulty_level === d.value ? d.color : '#475569'}`,
                                    textAlign: 'center', transition: 'all 0.2s'
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: '14px', color: form.difficulty_level === d.value ? d.color : '#e2e8f0', marginBottom: '4px' }}>{d.label}</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{d.desc}</div>
                                </button>
                            ))}
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 4: Proctoring Mode */}
                    <SectionCard icon={<Shield size={16} />} title="Proctoring Mode" subtitle={form.proctoring_enabled ? 'Enabled — configure options' : 'Disabled'} color="#ef4444">
                        {/* Master Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: form.proctoring_enabled ? '16px' : '0', padding: '10px 14px', background: '#0f172a', borderRadius: '10px', border: '1px solid #334155' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>Enable Proctoring</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Monitor students during test</div>
                            </div>
                            <button onClick={() => setForm({ ...form, proctoring_enabled: !form.proctoring_enabled })} style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0
                            }}>
                                {form.proctoring_enabled
                                    ? <ToggleRight size={36} color="#22c55e" />
                                    : <ToggleLeft size={36} color="#475569" />}
                            </button>
                        </div>

                        {/* Proctoring Options Grid */}
                        {form.proctoring_enabled && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                {[
                                    { key: 'camera', label: 'Camera', desc: 'Webcam monitoring', icon: <Camera size={16} />, color: '#3b82f6' },
                                    { key: 'mic', label: 'Microphone', desc: 'Audio monitoring', icon: <Mic size={16} />, color: '#8b5cf6' },
                                    { key: 'fullscreen', label: 'Fullscreen', desc: 'Force fullscreen mode', icon: <Maximize size={16} />, color: '#06b6d4' },
                                    { key: 'paste_disabled', label: 'Paste Disabled', desc: 'Block copy-paste', icon: <ClipboardX size={16} />, color: '#f59e0b' },
                                    { key: 'face_detection', label: 'Face Movement', desc: 'Detect face away/moving', icon: <ScanFace size={16} />, color: '#10b981' },
                                    { key: 'camera_block_detect', label: 'Camera Block', desc: 'Detect covered camera', icon: <Video size={16} />, color: '#ef4444' },
                                    { key: 'phone_detect', label: 'Phone Detection', desc: 'Detect mobile phone', icon: <Smartphone size={16} />, color: '#ec4899' }
                                ].map(opt => {
                                    const enabled = form.proctoring_config[opt.key];
                                    return (
                                        <button key={opt.key} onClick={() => setForm({
                                            ...form,
                                            proctoring_config: { ...form.proctoring_config, [opt.key]: !enabled }
                                        })} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
                                            borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                                            background: enabled ? `${opt.color}12` : '#0f172a',
                                            border: `1.5px solid ${enabled ? opt.color : '#475569'}`,
                                            transition: 'all 0.2s'
                                        }}>
                                            <div style={{
                                                width: '34px', height: '34px', borderRadius: '8px', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                background: enabled ? `${opt.color}25` : '#1e293b', color: enabled ? opt.color : '#64748b'
                                            }}>{opt.icon}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: '13px', color: enabled ? '#f1f5f9' : '#94a3b8' }}>{opt.label}</div>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>{opt.desc}</div>
                                            </div>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: enabled ? opt.color : '#475569', flexShrink: 0 }} />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 5: Question Counts */}
                    <SectionCard icon={<Hash size={16} />} title="Question Configuration"
                        subtitle="Set number of questions per section" color="#10b981">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <NumberInput label="MCQ Questions" value={form.mcq_count}
                                onChange={v => setForm({ ...form, mcq_count: v })}
                                min={5} max={50} icon={<Brain size={12} />} color="#8b5cf6" suffix="5–50 questions" />
                            <NumberInput label="Coding Problems" value={form.coding_count}
                                onChange={v => setForm({ ...form, coding_count: v })}
                                min={1} max={10} icon={<Code size={12} />} color="#3b82f6" suffix="1–10 problems" />
                            <NumberInput label="SQL Problems" value={form.sql_count}
                                onChange={v => setForm({ ...form, sql_count: v })}
                                min={1} max={10} icon={<Database size={12} />} color="#10b981" suffix="1–10 problems" />
                            <NumberInput label="Interview Qs" value={form.interview_count}
                                onChange={v => setForm({ ...form, interview_count: v })}
                                min={3} max={15} icon={<MessageSquare size={12} />} color="#f59e0b" suffix="3–15 questions" />
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 4: Passing Criteria & Settings */}
                    <SectionCard icon={<Target size={16} />} title="Passing Criteria & Settings"
                        subtitle="Configure passing scores and limits" color="#ef4444">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '14px' }}>
                            <NumberInput label="MCQ Pass %" value={form.mcq_passing_score}
                                onChange={v => setForm({ ...form, mcq_passing_score: v })}
                                min={30} max={100} icon={<BarChart2 size={12} />} color="#8b5cf6" suffix="min 30%" />
                            <NumberInput label="Coding Pass %" value={form.coding_passing_score}
                                onChange={v => setForm({ ...form, coding_passing_score: v })}
                                min={30} max={100} icon={<BarChart2 size={12} />} color="#3b82f6" suffix="min 30%" />
                            <NumberInput label="SQL Pass %" value={form.sql_passing_score}
                                onChange={v => setForm({ ...form, sql_passing_score: v })}
                                min={30} max={100} icon={<BarChart2 size={12} />} color="#10b981" suffix="min 30%" />
                            <NumberInput label="Interview Pass (/10)" value={form.interview_passing_score}
                                onChange={v => setForm({ ...form, interview_passing_score: v })}
                                min={3} max={10} icon={<BarChart2 size={12} />} color="#f59e0b" suffix="out of 10" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '14px' }}>
                            <NumberInput label="MCQ Time (m)" value={form.mcq_duration_minutes}
                                onChange={v => setForm({ ...form, mcq_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#8b5cf6" suffix="minutes" />
                            <NumberInput label="Coding Time (m)" value={form.coding_duration_minutes}
                                onChange={v => setForm({ ...form, coding_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#3b82f6" suffix="minutes" />
                            <NumberInput label="SQL Time (m)" value={form.sql_duration_minutes}
                                onChange={v => setForm({ ...form, sql_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#10b981" suffix="minutes" />
                            <NumberInput label="Interview Time (m)" value={form.interview_duration_minutes}
                                onChange={v => setForm({ ...form, interview_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#f59e0b" suffix="minutes" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <NumberInput label="Max Attempts" value={form.attempt_limit}
                                onChange={v => setForm({ ...form, attempt_limit: v })}
                                min={1} max={5} icon={<Shield size={12} />} color="#6366f1" suffix="per student" />
                        </div>
                    </SectionCard>

                    <div style={{ height: '18px' }} />

                    {/* Summary & Submit */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 18px', background: '#1e293b', borderRadius: '12px',
                        border: '1px solid #334155', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span><Brain size={13} style={{ verticalAlign: 'middle' }} /> {form.mcq_count} MCQ</span>
                            <span><Code size={13} style={{ verticalAlign: 'middle' }} /> {form.coding_count} Coding</span>
                            <span><Database size={13} style={{ verticalAlign: 'middle' }} /> {form.sql_count} SQL</span>
                            <span><MessageSquare size={13} style={{ verticalAlign: 'middle' }} /> {form.interview_count} Interview</span>
                            <span><Clock size={13} style={{ verticalAlign: 'middle' }} /> {form.mcq_duration_minutes}m+{form.coding_duration_minutes}m+{form.sql_duration_minutes}m+{form.interview_duration_minutes}m</span>
                            <span style={{ color: { easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444', mixed: '#8b5cf6' }[form.difficulty_level] }}>
                                <Target size={13} style={{ verticalAlign: 'middle' }} /> {form.difficulty_level}
                            </span>
                            <span style={{ color: form.proctoring_enabled ? '#22c55e' : '#ef4444' }}>
                                <Shield size={13} style={{ verticalAlign: 'middle' }} /> {form.proctoring_enabled ? 'Proctored' : 'No Proctor'}
                            </span>
                        </div>
                        <button onClick={createTest} disabled={creating} style={{
                            padding: '12px 32px',
                            background: creating ? '#a78bfa' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                            color: 'white', border: 'none', borderRadius: '10px', cursor: creating ? 'not-allowed' : 'pointer',
                            fontWeight: 800, fontSize: '15px', boxShadow: '0 2px 10px rgba(139,92,246,0.35)',
                            display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                        }}>
                            {creating ? <><Zap size={16} /> Creating...</> : <><Sparkles size={16} /> Create Assessment</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            {!showCreate && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search assessments..."
                            style={{
                                padding: '10px 14px 10px 36px', borderRadius: '10px',
                                border: '1px solid #475569', background: '#0f172a', color: '#f1f5f9',
                                fontSize: '13px', width: '280px', outline: 'none'
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Tests List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #e5e7eb', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ fontSize: '14px', fontWeight: 500 }}>Loading assessments...</p>
                </div>
            ) : filteredTests.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '5rem', background: 'var(--bg-card)', borderRadius: '20px', border: '1px dashed var(--border-color)' }}>
                    <Brain size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.3 }} />
                    <h3 style={{ color: 'var(--text-main)' }}>No tests found</h3>
                    <p style={{ color: 'var(--text-muted)' }}>{searchTerm ? 'Try a different search term' : 'Create your first skill test to get started'}</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, padding: '0 4px' }}>
                        {filteredTests.length} assessment{filteredTests.length !== 1 ? 's' : ''}
                    </div>
                    {filteredTests.map(test => (
                        <div key={test.id} style={{
                            background: '#1e293b', border: '1px solid #334155', borderRadius: '14px',
                            padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            borderLeft: `4px solid ${test.is_active ? '#8b5cf6' : '#475569'}`,
                            transition: 'box-shadow 0.2s'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f1f5f9' }}>{test.title}</h3>
                                        <span style={{
                                            padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                            background: test.is_active ? '#dcfce7' : '#fee2e2',
                                            color: test.is_active ? '#16a34a' : '#dc2626'
                                        }}>
                                            {test.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    {test.description && <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>{test.description}</p>}

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
                                        {(test.skills || []).map(s => (
                                            <span key={s} style={{
                                                padding: '3px 10px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                                                borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                                border: '1px solid rgba(139,92,246,0.25)'
                                            }}>{s}</span>
                                        ))}
                                    </div>

                                    <div style={{
                                        display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px',
                                        padding: '8px 12px', background: '#0f172a', borderRadius: '8px'
                                    }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#8b5cf6', fontWeight: 600 }}>
                                            <Brain size={12} /> {test.mcq_count} MCQ
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#3b82f6', fontWeight: 600 }}>
                                            <Code size={12} /> {test.coding_count} Coding
                                        </span>
                                        {test.config?.interview?.enabled && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '20px', fontSize: '0.75rem', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                                <Bot size={14} /> AI Interview
                                            </div>
                                        )}
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#10b981', fontWeight: 600 }}>
                                            <Database size={12} /> {test.sql_count} SQL
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontWeight: 600 }}>
                                            <MessageSquare size={12} /> {test.interview_count} Interview
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#94a3b8' }}>
                                            <Clock size={12} /> {test.mcq_duration_minutes}m
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#94a3b8' }}>
                                            <Shield size={12} /> {test.attempt_limit} attempt{test.attempt_limit > 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {test.attempt_stats && (
                                        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '12px' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                                                <Users size={14} /> {test.attempt_stats.total || 0} attempts
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#22c55e' }}>
                                                <CheckCircle size={14} /> {test.attempt_stats.completed || 0} passed
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}>
                                                <XCircle size={14} /> {test.attempt_stats.failed || 0} failed
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '6px', marginLeft: '16px' }}>
                                    <button onClick={() => loadAttempts(test.id)} title="View Attempts" style={{
                                        padding: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                                    }}><Eye size={16} color="#34d399" /></button>
                                    <button
                                        onClick={() => openStudentAllocationModal(test.id)}
                                        title="Assign Students"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.6rem 1rem',
                                            background: 'rgba(167, 139, 250, 0.1)',
                                            color: '#a78bfa',
                                            border: '1px solid rgba(167, 139, 250, 0.2)',
                                            borderRadius: '10px',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(167, 139, 250, 0.2)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(167, 139, 250, 0.1)'}
                                    >
                                        <Users size={16} /> Assign
                                    </button>
                                    <button onClick={() => toggleTest(test.id)} title={test.is_active ? 'Deactivate' : 'Activate'} style={{
                                        padding: '8px', background: test.is_active ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                                        border: '1px solid ' + (test.is_active ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'),
                                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                                    }}>
                                        {test.is_active ? <ToggleRight size={16} color="#fbbf24" /> : <ToggleLeft size={16} color="#34d399" />}
                                    </button>
                                    <button onClick={() => deleteTest(test.id)} title="Delete" style={{
                                        padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                                    }}><Trash2 size={16} color="#f87171" /></button>
                                </div>
                            </div>

                            {/* Attempts Panel */}
                            {viewAttempts === test.id && (
                                <div style={{ marginTop: '16px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Users size={15} /> Student Attempts
                                        </h4>
                                        <button onClick={() => setViewAttempts(null)} style={{
                                            background: '#334155', border: 'none', cursor: 'pointer', color: '#94a3b8',
                                            borderRadius: '6px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px',
                                            fontSize: '11px', fontWeight: 600
                                        }}>Close <ChevronUp size={14} /></button>
                                    </div>
                                    {attempts.length === 0 ? (
                                        <p style={{ color: '#9ca3af', fontSize: '13px' }}>No attempts yet</p>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                <thead>
                                                    <tr style={{ background: '#0f172a' }}>
                                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Student</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Attempt</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Stage</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>MCQ</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Coding</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>SQL</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Interview</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attempts.map(a => (
                                                        <tr key={a.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                                            <td style={{ padding: '8px', color: '#e2e8f0' }}>{a.student_name || a.student_id}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: '#cbd5e1' }}>#{a.attempt_number}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>{a.current_stage}</span>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.mcq_status] }}>
                                                                {a.mcq_status !== 'pending' ? `${Math.round(a.mcq_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.coding_status] }}>
                                                                {a.coding_status !== 'pending' ? `${Math.round(a.coding_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.sql_status] }}>
                                                                {a.sql_status !== 'pending' ? `${Math.round(a.sql_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.interview_status] }}>
                                                                {a.interview_status !== 'pending' ? `${(a.interview_score || 0).toFixed(1)}/10` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                                                    background: a.overall_status === 'completed' ? 'rgba(16,185,129,0.15)' : a.overall_status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                                    color: a.overall_status === 'completed' ? '#6ee7b7' : a.overall_status === 'failed' ? '#fca5a5' : '#fcd34d'
                                                                }}>
                                                                    {a.overall_status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Student Allocation Modal */}
            {showStudentAllocationModal && (
                <div className="modal-overlay" onClick={() => setShowStudentAllocationModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                        maxWidth: '800px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '24px',
                        overflow: 'hidden',
                        padding: 0,
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div className="modal-header" style={{
                            padding: '1.5rem 2rem',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--bg-card)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '14px',
                                    background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 8px 16px rgba(167, 139, 250, 0.2)'
                                }}>
                                    <Users size={24} color="white" />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-main)', fontWeight: 800 }}>Assign Students</h2>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Manage student participation for this skill test</p>
                                </div>
                            </div>
                            <button onClick={() => setShowStudentAllocationModal(false)} className="modal-close" style={{ background: 'var(--bg-secondary)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{
                            padding: '1.25rem 2rem',
                            background: 'var(--bg-secondary)',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1.5rem'
                        }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    placeholder="Search by student name, username or batch..."
                                    value={studentSearchTerm}
                                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.85rem 1rem 0.85rem 2.75rem',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-main)',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}
                                />
                            </div>
                            <button
                                onClick={() => {
                                    const filtered = allStudents.filter(s =>
                                        (s.name || s.username || '').toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
                                        (s.batch || '').toLowerCase().includes(studentSearchTerm.toLowerCase())
                                    );
                                    const allInFilteredSelected = filtered.every(s => selectedStudents.includes(s.id));
                                    if (allInFilteredSelected) {
                                        setSelectedStudents(prev => prev.filter(id => !filtered.find(s => s.id === id)));
                                    } else {
                                        const newIds = filtered.map(s => s.id).filter(id => !selectedStudents.includes(id));
                                        setSelectedStudents(prev => [...prev, ...newIds]);
                                    }
                                }}
                                style={{
                                    padding: '0.85rem 1.5rem',
                                    background: 'var(--bg-card)',
                                    color: 'var(--text-main)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {allStudents.filter(s =>
                                    (s.name || s.username || '').toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
                                    (s.batch || '').toLowerCase().includes(studentSearchTerm.toLowerCase())
                                ).every(s => selectedStudents.includes(s.id)) ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>

                        <div className="modal-body" style={{
                            padding: '2rem',
                            overflowY: 'auto',
                            maxHeight: '50vh',
                            background: 'var(--bg-card)'
                        }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                gap: '1rem'
                            }}>
                                {allStudents.filter(s =>
                                    (s.name || s.username || '').toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
                                    (s.batch || '').toLowerCase().includes(studentSearchTerm.toLowerCase())
                                ).length === 0 ? (
                                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                                        <Users size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                        <p>No students found matching your search.</p>
                                    </div>
                                ) : (
                                    allStudents.filter(s =>
                                        (s.name || s.username || '').toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
                                        (s.batch || '').toLowerCase().includes(studentSearchTerm.toLowerCase())
                                    ).map(student => (
                                        <div
                                            key={student.id}
                                            onClick={() => toggleStudentSelection(student.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '1rem',
                                                padding: '1rem',
                                                borderRadius: '16px',
                                                background: selectedStudents.includes(student.id) ? 'rgba(167, 139, 250, 0.1)' : 'var(--bg-secondary)',
                                                border: `2px solid ${selectedStudents.includes(student.id) ? '#a78bfa' : 'transparent'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <div style={{
                                                width: '44px',
                                                height: '44px',
                                                borderRadius: '12px',
                                                background: selectedStudents.includes(student.id) ? '#a78bfa' : 'var(--bg-card)',
                                                color: selectedStudents.includes(student.id) ? 'white' : 'var(--primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '1.1rem',
                                                fontWeight: 800,
                                                boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                                            }}>
                                                {(student.name || student.username || 'S').charAt(0).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {student.name || student.username}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                                                    <span style={{ padding: '2px 6px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                                        {student.batch || 'General'}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{student.email?.split('@')[0]}</span>
                                                </div>
                                            </div>
                                            {selectedStudents.includes(student.id) && (
                                                <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    background: '#a78bfa',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    boxShadow: '0 2px 4px rgba(167, 139, 250, 0.4)'
                                                }}>
                                                    <Check size={14} strokeWidth={3} />
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="modal-footer" style={{
                            padding: '1.5rem 2rem',
                            borderTop: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--bg-card)'
                        }}>
                            <div style={{ color: 'var(--text-main)' }}>
                                <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.25rem' }}>{selectedStudents.length}</span>
                                <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>students selected</span>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={() => setShowStudentAllocationModal(false)}
                                    className="btn-reset"
                                    style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: 600 }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveStudentAllocations}
                                    style={{
                                        padding: '0.75rem 2.5rem',
                                        background: 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        fontSize: '1rem',
                                        cursor: 'pointer',
                                        boxShadow: '0 8px 20px var(--primary-alpha)',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                >
                                    Confirm Assignments
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
