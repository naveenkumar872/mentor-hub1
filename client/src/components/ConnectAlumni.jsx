import { useState, useEffect, useRef } from 'react'
import {
    UserPlus, Users, MessageSquare, ThumbsUp, Share2, Briefcase, MapPin, GraduationCap,
    Search, Send, X, Image, Link, Award, ChevronDown, ChevronUp, Bell, BellOff,
    CheckCircle, Clock, XCircle, MoreHorizontal, Bookmark, ExternalLink,
    Building, Globe, Heart, Repeat2, TrendingUp, Star, Filter, BookOpen
} from 'lucide-react'
import axios from 'axios'
import { useAuth } from '../App'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

// ─── MOCK DATA (graceful fallback until backend tables are ready) ────────────
const MOCK_ALUMNI = [
    { id: 'a1', name: 'Priya Sharma', avatar: null, role: 'alumni', company: 'Google', job_title: 'Senior Software Engineer', location: 'Bangalore, India', batch_year: 2019, skills: ['React', 'Node.js', 'System Design'], bio: 'Passionate about building scalable systems. Love mentoring junior devs!', connection_status: 'none', mutual_connections: 3 },
    { id: 'a2', name: 'Arjun Mehta', avatar: null, role: 'alumni', company: 'Microsoft', job_title: 'Product Manager', location: 'Hyderabad, India', batch_year: 2018, skills: ['Product Strategy', 'Agile', 'Data Analysis'], bio: 'PM at Microsoft TEAMS. Previously SWE. Happy to guide career transitions!', connection_status: 'connected', mutual_connections: 5 },
    { id: 'a3', name: 'Sneha Reddy', avatar: null, role: 'alumni', company: 'Amazon', job_title: 'Data Scientist', location: 'Chennai, India', batch_year: 2020, skills: ['Python', 'ML', 'AWS', 'TensorFlow'], bio: 'Data Science @ Amazon. Open to coffee chats about ML careers.', connection_status: 'pending', mutual_connections: 2 },
    { id: 'a4', name: 'Karthik Iyer', avatar: null, role: 'alumni', company: 'Flipkart', job_title: 'Staff Engineer', location: 'Mumbai, India', batch_year: 2017, skills: ['Java', 'Microservices', 'Kafka', 'Go'], bio: 'Building Flipkart supply chain at scale. Batch of 2017 🎓', connection_status: 'none', mutual_connections: 7 },
    { id: 'a5', name: 'Divya Nair', avatar: null, role: 'alumni', company: 'Razorpay', job_title: 'Frontend Lead', location: 'Pune, India', batch_year: 2021, skills: ['Vue.js', 'TypeScript', 'Design Systems'], bio: 'Building fintech UIs. Ex-Zomato, Ex-CRED. Let\'s connect!', connection_status: 'none', mutual_connections: 1 },
    { id: 'a6', name: 'Rahul Verma', avatar: null, role: 'alumni', company: 'Infosys', job_title: 'Cloud Architect', location: 'Delhi, India', batch_year: 2016, skills: ['AWS', 'Azure', 'Kubernetes', 'Terraform'], bio: 'Cloud solutions architect. Helping teams migrate to cloud.', connection_status: 'none', mutual_connections: 4 },
]

const MOCK_POSTS = [
    {
        id: 'p1', author_id: 'a1', author_name: 'Priya Sharma', author_company: 'Google', author_title: 'Senior Software Engineer',
        content: '🎉 Just completed Google\'s internal hackathon — our team built a real-time collaborative code editor using WebSockets and CRDTs. \n\nKey learnings:\n• Operational transforms vs CRDTs — CRDTs won for us\n• Redis Pub/Sub for low-latency sync\n• Monaco editor has great extensibility APIs\n\nFor students: system design interviews love these patterns! Start small, think distributed. 💡\n\n#SystemDesign #Hackathon #GoogleLife',
        created_at: new Date(Date.now() - 2 * 3600000).toISOString(), likes: 142, comments: 28, shares: 19, liked_by_me: false, saved: false,
        tags: ['SystemDesign', 'Hackathon', 'GoogleLife'], type: 'update'
    },
    {
        id: 'p2', author_id: 'a2', author_name: 'Arjun Mehta', author_company: 'Microsoft', author_title: 'Product Manager',
        content: '📢 We\'re HIRING at Microsoft Teams!\n\n📍 Hyderabad & Bangalore\n💼 SDE-1, SDE-2, PM Roles\n🎓 2023–2025 batch welcome\n\nSkills we look for:\n✅ Strong DSA\n✅ System Design basics\n✅ Communication skills\n✅ Curiosity to learn\n\nDM me or apply through the link below. Happy to do mock interviews for alumni network members! 🙌\n\n#Hiring #MicrosoftCareers #JobOpportunity',
        created_at: new Date(Date.now() - 5 * 3600000).toISOString(), likes: 387, comments: 92, shares: 156, liked_by_me: true, saved: true,
        tags: ['Hiring', 'MicrosoftCareers'], type: 'job'
    },
    {
        id: 'p3', author_id: 'a3', author_name: 'Sneha Reddy', author_company: 'Amazon', author_title: 'Data Scientist',
        content: 'Just finished reading "Designing Machine Learning Systems" by Chip Huyen. 📚\n\nTop 3 takeaways for aspiring MLE students:\n\n1️⃣ Feature engineering > model selection in production systems\n2️⃣ Data distribution shift is THE hardest problem — not accuracy\n3️⃣ Monitoring is a first-class citizen, not an afterthought\n\nHighly recommend if you\'re aiming for ML roles. It bridges the gap between "Kaggle ML" and "production ML" beautifully.\n\n#MachineLearning #MLBooks #DataScience',
        created_at: new Date(Date.now() - 1 * 86400000).toISOString(), likes: 89, comments: 21, shares: 34, liked_by_me: false, saved: false,
        tags: ['MachineLearning', 'DataScience'], type: 'update'
    },
    {
        id: 'p4', author_id: 'a4', author_name: 'Karthik Iyer', author_company: 'Flipkart', author_title: 'Staff Engineer',
        content: 'Thread 🧵 on how I cracked Staff Engineer promotion:\n\n1/ It\'s not about writing the most code — it\'s about the multiplier effect on others\n\n2/ Sponsorship > Mentorship. Actually fight for people\'s promotions in closed rooms\n\n3/ Technical vision matters. Write RFCs, ADRs. Document your architectural decisions\n\n4/ Manage up effectively. Your manager can\'t advocate for what they don\'t know\n\n5/ Build cross-team reputation. Who do OTHER teams think of when they have a hard problem?\n\nWhat questions do you have about Staff+ eng careers? Drop a comment 👇\n\n#EngineeringCareer #StaffEngineer #TechLeadership',
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(), likes: 521, comments: 143, shares: 78, liked_by_me: false, saved: false,
        tags: ['EngineeringCareer', 'TechLeadership'], type: 'insight'
    },
]

const MOCK_REQUESTS = [
    { id: 'r1', from_id: 'a5', from_name: 'Divya Nair', from_company: 'Razorpay', from_title: 'Frontend Lead', message: 'Hi! I saw your skills in React. Would love to connect and share career tips!', created_at: new Date(Date.now() - 3600000).toISOString() },
]

function getInitials(name = '') {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getAvatarColor(name = '') {
    const colors = ['#3b82f6', '#10b981', '#a78bfa', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']
    let hash = 0
    for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) % colors.length
    return colors[hash]
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    return new Date(dateStr).toLocaleDateString()
}

// ─── AVATAR COMPONENT ────────────────────────────────────────────────────────
function Avatar({ name, size = 40, src }) {
    const bg = getAvatarColor(name)
    const initials = getInitials(name)
    if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', background: bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0
        }}>{initials}</div>
    )
}

// ─── CONNECTION BUTTON ────────────────────────────────────────────────────────
function ConnectButton({ status, onConnect, onWithdraw, size = 'md' }) {
    const pad = size === 'sm' ? '0.35rem 0.8rem' : '0.5rem 1.1rem'
    const fs = size === 'sm' ? '0.78rem' : '0.85rem'
    if (status === 'connected') return (
        <button style={{ padding: pad, fontSize: fs, border: '1.5px solid var(--primary)', borderRadius: 20, background: 'var(--primary-alpha)', color: 'var(--primary)', fontWeight: 600, cursor: 'default', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} /> Connected
        </button>
    )
    if (status === 'pending') return (
        <button onClick={onWithdraw} style={{ padding: pad, fontSize: fs, border: '1.5px solid var(--border-color)', borderRadius: 20, background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} /> Pending
        </button>
    )
    return (
        <button onClick={onConnect} style={{ padding: pad, fontSize: fs, border: '1.5px solid var(--primary)', borderRadius: 20, background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.18s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
        >
            <UserPlus size={14} /> Connect
        </button>
    )
}

// ─── ALUMNI PROFILE CARD (compact) ───────────────────────────────────────────
function AlumniCard({ alumni, onConnect, onMessage, onWithdraw }) {
    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 12, padding: '1.2rem', display: 'flex', flexDirection: 'column',
            gap: '0.8rem', transition: 'box-shadow 0.2s',
        }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 24px rgba(59,130,246,0.1)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
        >
            {/* Header */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <Avatar name={alumni.name} size={52} src={alumni.avatar} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{alumni.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{alumni.job_title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Building size={11} /> {alumni.company}
                    </div>
                    {alumni.location && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <MapPin size={11} /> {alumni.location}
                        </div>
                    )}
                </div>
            </div>

            {/* Batch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <GraduationCap size={13} /> Batch of {alumni.batch_year}
                {alumni.mutual_connections > 0 && (
                    <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
                        <Users size={11} style={{ marginRight: 3 }} />{alumni.mutual_connections} mutual
                    </span>
                )}
            </div>

            {/* Skills */}
            {alumni.skills?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {alumni.skills.slice(0, 3).map(s => (
                        <span key={s} style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', background: 'var(--primary-alpha)', color: 'var(--primary)', borderRadius: 20, fontWeight: 500 }}>{s}</span>
                    ))}
                    {alumni.skills.length > 3 && (
                        <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', background: 'var(--bg-secondary)', color: 'var(--text-muted)', borderRadius: 20 }}>+{alumni.skills.length - 3}</span>
                    )}
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <ConnectButton status={alumni.connection_status} onConnect={() => onConnect(alumni.id)} onWithdraw={() => onWithdraw(alumni.id)} size="sm" />
                {alumni.connection_status === 'connected' && (
                    <button onClick={() => onMessage(alumni)} style={{ padding: '0.35rem 0.8rem', fontSize: '0.78rem', border: '1.5px solid var(--border-color)', borderRadius: 20, background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MessageSquare size={13} /> Message
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── POST CARD ────────────────────────────────────────────────────────────────
function PostCard({ post, onLike, onSave, currentUser, onComment }) {
    const [showComments, setShowComments] = useState(false)
    const [commentText, setCommentText] = useState('')
    const [localComments, setLocalComments] = useState([])
    const [showFull, setShowFull] = useState(false)

    const postTypeColors = { job: '#10b981', insight: '#a78bfa', update: '#3b82f6' }
    const postTypeLabels = { job: '💼 Job Opportunity', insight: '💡 Career Insight', update: '📢 Update' }

    const submitComment = () => {
        if (!commentText.trim()) return
        setLocalComments(prev => [...prev, {
            id: Date.now(), name: currentUser?.name || 'You', text: commentText.trim(), time: 'just now'
        }])
        setCommentText('')
    }

    const isLong = post.content.length > 280

    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', marginBottom: '1rem' }}>
            {/* Post Type Badge */}
            {post.type !== 'update' && (
                <div style={{ background: postTypeColors[post.type] + '18', borderBottom: '1px solid ' + postTypeColors[post.type] + '30', padding: '0.45rem 1rem', fontSize: '0.78rem', fontWeight: 700, color: postTypeColors[post.type] }}>
                    {postTypeLabels[post.type]}
                </div>
            )}

            <div style={{ padding: '1rem 1.2rem' }}>
                {/* Author */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                    <Avatar name={post.author_name} size={44} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>{post.author_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{post.author_title} · {post.author_company}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{timeAgo(post.created_at)}</div>
                    </div>
                    <button onClick={() => onSave(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: post.saved ? 'var(--primary)' : 'var(--text-muted)', padding: 4 }}>
                        <Bookmark size={16} fill={post.saved ? 'var(--primary)' : 'none'} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.65, whiteSpace: 'pre-line', marginBottom: '0.75rem' }}>
                    {isLong && !showFull ? post.content.slice(0, 280) + '…' : post.content}
                    {isLong && (
                        <button onClick={() => setShowFull(!showFull)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', marginLeft: 4, fontWeight: 600 }}>
                            {showFull ? 'show less' : 'see more'}
                        </button>
                    )}
                </div>

                {/* Tags */}
                {post.tags?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.75rem' }}>
                        {post.tags.map(t => (
                            <span key={t} style={{ fontSize: '0.75rem', color: 'var(--primary)', cursor: 'pointer' }}>#{t}</span>
                        ))}
                    </div>
                )}

                {/* Stats */}
                <div style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '0.45rem 0', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>{post.likes + (post.liked_by_me ? 0 : 0) > 0 ? `${post.likes} likes` : ''}</span>
                    <span style={{ cursor: 'pointer' }} onClick={() => setShowComments(!showComments)}>{(localComments.length + post.comments) > 0 ? `${localComments.length + post.comments} comments` : ''}</span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {[
                        { icon: <ThumbsUp size={16} fill={post.liked_by_me ? 'var(--primary)' : 'none'} />, label: 'Like', action: () => onLike(post.id), active: post.liked_by_me },
                        { icon: <MessageSquare size={16} />, label: 'Comment', action: () => setShowComments(!showComments), active: showComments },
                        { icon: <Repeat2 size={16} />, label: 'Repost', action: () => { }, active: false },
                        { icon: <Share2 size={16} />, label: 'Share', action: () => { }, active: false },
                    ].map(btn => (
                        <button key={btn.label} onClick={btn.action} style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                            padding: '0.45rem', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                            background: btn.active ? 'var(--primary-alpha)' : 'none',
                            color: btn.active ? 'var(--primary)' : 'var(--text-muted)',
                            transition: 'all 0.15s'
                        }}
                            onMouseEnter={e => { if (!btn.active) e.currentTarget.style.background = 'var(--bg-secondary)' }}
                            onMouseLeave={e => { if (!btn.active) e.currentTarget.style.background = 'none' }}
                        >
                            {btn.icon} {btn.label}
                        </button>
                    ))}
                </div>

                {/* Comments Section */}
                {showComments && (
                    <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border-color)' }}>
                        {/* Comment Input */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem' }}>
                            <Avatar name={currentUser?.name || 'You'} size={32} />
                            <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                                <input value={commentText} onChange={e => setCommentText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && submitComment()}
                                    placeholder="Add a comment…"
                                    style={{ flex: 1, padding: '0.45rem 0.8rem', border: '1.5px solid var(--border-color)', borderRadius: 20, background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '0.83rem', outline: 'none' }} />
                                <button onClick={submitComment} disabled={!commentText.trim()} style={{ padding: '0.45rem 0.75rem', background: 'var(--primary)', border: 'none', borderRadius: 20, cursor: commentText.trim() ? 'pointer' : 'not-allowed', color: '#fff', opacity: commentText.trim() ? 1 : 0.5 }}>
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                        {/* Local Comments */}
                        {localComments.map(c => (
                            <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: '0.6rem' }}>
                                <Avatar name={c.name} size={30} />
                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '0.45rem 0.8rem', flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-main)' }}>{c.name}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{c.text}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── CREATE POST MODAL ────────────────────────────────────────────────────────
function CreatePostModal({ user, onClose, onPost }) {
    const [content, setContent] = useState('')
    const [postType, setPostType] = useState('update')
    const textRef = useRef(null)

    useEffect(() => { textRef.current?.focus() }, [])

    const handlePost = () => {
        if (!content.trim()) return
        onPost({ content, postType })
        onClose()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 580, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Avatar name={user?.name || 'You'} size={44} />
                        <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{user?.name || 'You'}</div>
                            <select value={postType} onChange={e => setPostType(e.target.value)} style={{ fontSize: '0.78rem', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <option value="update">General Update</option>
                                <option value="job">Job Opportunity</option>
                                <option value="insight">Career Insight</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 8, padding: 4 }}><X size={20} /></button>
                </div>
                <div style={{ padding: '1rem 1.2rem' }}>
                    <textarea ref={textRef} value={content} onChange={e => setContent(e.target.value)}
                        placeholder="Share an update, job opportunity, or career insight with the alumni network…"
                        rows={6} style={{ width: '100%', border: 'none', background: 'transparent', resize: 'none', color: 'var(--text-main)', fontSize: '0.92rem', outline: 'none', lineHeight: 1.65 }} />
                </div>
                <div style={{ padding: '0.8rem 1.2rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '0.5rem 1.1rem', border: '1.5px solid var(--border-color)', borderRadius: 20, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Cancel</button>
                    <button onClick={handlePost} disabled={!content.trim()} style={{ padding: '0.5rem 1.4rem', border: 'none', borderRadius: 20, background: content.trim() ? 'var(--primary)' : 'var(--bg-tertiary)', color: content.trim() ? '#fff' : 'var(--text-muted)', cursor: content.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.85rem' }}>
                        Post
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── CHAT WINDOW ─────────────────────────────────────────────────────────────
function ChatWindow({ alumni, currentUser, onClose }) {
    const [messages, setMessages] = useState([
        { id: 1, from: alumni.id, text: `Hi! Thanks for connecting. How can I help you?`, time: '2:30 PM' }
    ])
    const [input, setInput] = useState('')
    const bottomRef = useRef(null)

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

    const send = () => {
        if (!input.trim()) return
        setMessages(prev => [...prev, { id: Date.now(), from: 'me', text: input.trim(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
        setInput('')
        // Simulate reply after 1.5s
        setTimeout(() => {
            setMessages(prev => [...prev, {
                id: Date.now() + 1, from: alumni.id,
                text: "That's a great question! Let me share my thoughts on that shortly. 😊",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }])
        }, 1500)
    }

    return (
        <div style={{
            position: 'fixed', bottom: 0, right: 24, width: 316, zIndex: 9999,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: '12px 12px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{ padding: '0.65rem 1rem', background: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Avatar name={alumni.name} size={34} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>{alumni.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)' }}>{alumni.company}</div>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', padding: 2 }}><X size={16} /></button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, minHeight: 200 }}>
                {messages.map(m => (
                    <div key={m.id} style={{ display: 'flex', flexDirection: m.from === 'me' ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
                        {m.from !== 'me' && <Avatar name={alumni.name} size={26} />}
                        <div style={{
                            maxWidth: '75%', padding: '0.5rem 0.75rem', borderRadius: m.from === 'me' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            background: m.from === 'me' ? 'var(--primary)' : 'var(--bg-secondary)',
                            color: m.from === 'me' ? '#fff' : 'var(--text-main)', fontSize: '0.83rem', lineHeight: 1.5
                        }}>
                            {m.text}
                            <div style={{ fontSize: '0.68rem', color: m.from === 'me' ? 'rgba(255,255,255,0.65)' : 'var(--text-muted)', marginTop: 2, textAlign: 'right' }}>{m.time}</div>
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '0.6rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 6 }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                    placeholder="Write a message…"
                    style={{ flex: 1, padding: '0.5rem 0.8rem', border: '1.5px solid var(--border-color)', borderRadius: 20, background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '0.82rem', outline: 'none' }} />
                <button onClick={send} disabled={!input.trim()} style={{ padding: '0.5rem 0.75rem', background: input.trim() ? 'var(--primary)' : 'var(--bg-tertiary)', border: 'none', borderRadius: 20, cursor: input.trim() ? 'pointer' : 'not-allowed', color: input.trim() ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                    <Send size={14} />
                </button>
            </div>
        </div>
    )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ConnectAlumni() {
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState('feed')   // feed | directory | network | requests
    const [alumni, setAlumni] = useState(MOCK_ALUMNI)
    const [posts, setPosts] = useState(MOCK_POSTS)
    const [requests, setRequests] = useState(MOCK_REQUESTS)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterSkill, setFilterSkill] = useState('')
    const [filterBatch, setFilterBatch] = useState('')
    const [filterCompany, setFilterCompany] = useState('')
    const [showCreatePost, setShowCreatePost] = useState(false)
    const [chatWith, setChatWith] = useState(null)   // alumni object for current chat
    const [notification, setNotification] = useState(null)

    // Load from API (graceful fallback to mock data)
    useEffect(() => {
        axios.get(`${API_BASE}/alumni`, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })
            .then(res => { if (res.data?.alumni?.length) setAlumni(res.data.alumni) })
            .catch(() => { /* use mock data */ })

        axios.get(`${API_BASE}/alumni/posts`, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })
            .then(res => { if (res.data?.posts?.length) setPosts(res.data.posts) })
            .catch(() => { /* use mock data */ })
    }, [])

    const showNotif = (msg, type = 'success') => {
        setNotification({ msg, type })
        setTimeout(() => setNotification(null), 3000)
    }

    const handleConnect = async (alumniId) => {
        setAlumni(prev => prev.map(a => a.id === alumniId ? { ...a, connection_status: 'pending' } : a))
        showNotif('Connection request sent!')
        try {
            await axios.post(`${API_BASE}/alumni/connect`, { targetId: alumniId }, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })
        } catch { /* mock ok */ }
    }

    const handleWithdraw = (alumniId) => {
        setAlumni(prev => prev.map(a => a.id === alumniId ? { ...a, connection_status: 'none' } : a))
        showNotif('Connection request withdrawn.', 'info')
    }

    const handleAcceptRequest = (req) => {
        setRequests(prev => prev.filter(r => r.id !== req.id))
        setAlumni(prev => prev.map(a => a.id === req.from_id ? { ...a, connection_status: 'connected' } : a))
        showNotif(`Connected with ${req.from_name}!`)
    }

    const handleDeclineRequest = (reqId) => {
        setRequests(prev => prev.filter(r => r.id !== reqId))
        showNotif('Request declined.', 'info')
    }

    const handleLike = (postId) => {
        setPosts(prev => prev.map(p => p.id === postId
            ? { ...p, liked_by_me: !p.liked_by_me, likes: p.liked_by_me ? p.likes - 1 : p.likes + 1 }
            : p
        ))
    }

    const handleSave = (postId) => {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, saved: !p.saved } : p))
    }

    const handlePost = ({ content, postType }) => {
        const newPost = {
            id: `p${Date.now()}`, author_id: user?.id || 'me', author_name: user?.name || 'You',
            author_company: 'Alumni Network', author_title: user?.role || 'Student',
            content, created_at: new Date().toISOString(), likes: 0, comments: 0, shares: 0,
            liked_by_me: false, saved: false, tags: [], type: postType
        }
        setPosts(prev => [newPost, ...prev])
        showNotif('Post published!')
    }

    const handleMessage = (alum) => {
        if (alum.connection_status !== 'connected') {
            showNotif('Connect with this alumni first to send a message.', 'warning')
            return
        }
        setChatWith(alum)
    }

    // Derived
    const connectedAlumni = alumni.filter(a => a.connection_status === 'connected')
    const allSkills = [...new Set(alumni.flatMap(a => a.skills || []))]
    const allBatches = [...new Set(alumni.map(a => a.batch_year))].sort((a, b) => b - a)
    const allCompanies = [...new Set(alumni.map(a => a.company))]

    const filteredAlumni = alumni.filter(a => {
        const q = searchQuery.toLowerCase()
        const matchSearch = !q || a.name.toLowerCase().includes(q) || a.company.toLowerCase().includes(q) || (a.skills || []).some(s => s.toLowerCase().includes(q))
        const matchSkill = !filterSkill || (a.skills || []).includes(filterSkill)
        const matchBatch = !filterBatch || a.batch_year === parseInt(filterBatch)
        const matchCompany = !filterCompany || a.company === filterCompany
        return matchSearch && matchSkill && matchBatch && matchCompany
    })

    const TABS = [
        { id: 'feed', label: 'Feed', icon: <TrendingUp size={16} /> },
        { id: 'directory', label: 'Alumni Directory', icon: <Users size={16} /> },
        { id: 'network', label: `My Network (${connectedAlumni.length})`, icon: <UserPlus size={16} /> },
        { id: 'requests', label: `Requests${requests.length > 0 ? ` (${requests.length})` : ''}`, icon: <Bell size={16} /> },
    ]

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0.5rem' }}>
            {/* Toast Notification */}
            {notification && (
                <div style={{
                    position: 'fixed', top: 72, right: 24, zIndex: 11000,
                    padding: '0.75rem 1.25rem', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem',
                    background: notification.type === 'success' ? '#10b981' : notification.type === 'warning' ? '#f59e0b' : '#64748b',
                    color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                    animation: 'fadeInDown 0.3s ease'
                }}>
                    {notification.msg}
                </div>
            )}

            {/* Page Header */}
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <GraduationCap size={22} color="#fff" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>Connect Alumni</h2>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Grow your career with alumni guidance, opportunities & networking</p>
                    </div>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.35rem', flexWrap: 'wrap' }}>
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                        flex: '1 1 auto', padding: '0.55rem 1rem', border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.83rem', fontWeight: 600, transition: 'all 0.18s',
                        background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                        color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                    }}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ── FEED TAB ── */}
            {activeTab === 'feed' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem' }}>
                    {/* Main Feed */}
                    <div>
                        {/* Create Post Box */}
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <Avatar name={user?.name || 'You'} size={44} />
                                <button onClick={() => setShowCreatePost(true)} style={{
                                    flex: 1, textAlign: 'left', padding: '0.6rem 1rem', border: '1.5px solid var(--border-color)',
                                    borderRadius: 28, background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                                    cursor: 'pointer', fontSize: '0.88rem', transition: 'all 0.15s'
                                }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                >
                                    Share an update, job, or insight…
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: 4, marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border-color)' }}>
                                {[
                                    { icon: <Image size={16} color="#10b981" />, label: 'Media' },
                                    { icon: <Briefcase size={16} color="#f59e0b" />, label: 'Job' },
                                    { icon: <BookOpen size={16} color="#a78bfa" />, label: 'Insight' },
                                ].map(item => (
                                    <button key={item.label} onClick={() => setShowCreatePost(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0.4rem', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                        {item.icon} {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Posts */}
                        {posts.map(post => (
                            <PostCard key={post.id} post={post} onLike={handleLike} onSave={handleSave} currentUser={user} />
                        ))}
                    </div>

                    {/* Right Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* People You May Know */}
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1rem', overflow: 'hidden' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.8rem', color: 'var(--text-main)' }}>People You May Know</div>
                            {alumni.filter(a => a.connection_status === 'none').slice(0, 4).map(a => (
                                <div key={a.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', padding: '0.55rem 0', borderTop: '1px solid var(--border-color)' }}>
                                    <Avatar name={a.name} size={38} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{a.company}</div>
                                    </div>
                                    <ConnectButton status={a.connection_status} onConnect={() => handleConnect(a.id)} onWithdraw={() => handleWithdraw(a.id)} size="sm" />
                                </div>
                            ))}
                            <button onClick={() => setActiveTab('directory')} style={{ marginTop: '0.6rem', width: '100%', padding: '0.5rem', border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                View All Alumni →
                            </button>
                        </div>

                        {/* Career Stats */}
                        <div style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', borderRadius: 12, padding: '1rem', color: '#fff' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>Your Network Stats</div>
                            {[
                                { label: 'Connections', value: connectedAlumni.length },
                                { label: 'Alumni in Network', value: alumni.length },
                                { label: 'Companies', value: [...new Set(connectedAlumni.map(a => a.company))].length || 0 },
                            ].map(s => (
                                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.15)', fontSize: '0.83rem' }}>
                                    <span style={{ opacity: 0.85 }}>{s.label}</span>
                                    <span style={{ fontWeight: 700 }}>{s.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── DIRECTORY TAB ── */}
            {activeTab === 'directory' && (
                <div>
                    {/* Search + Filters */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1rem 1.2rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: '1 1 200px' }}>
                            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search by name, company, skill…"
                                style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: '0.5rem', paddingBottom: '0.5rem', border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <select value={filterSkill} onChange={e => setFilterSkill(e.target.value)} style={{ padding: '0.5rem 0.8rem', border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '0.83rem', minWidth: 130 }}>
                            <option value="">All Skills</option>
                            {allSkills.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={filterBatch} onChange={e => setFilterBatch(e.target.value)} style={{ padding: '0.5rem 0.8rem', border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '0.83rem', minWidth: 120 }}>
                            <option value="">All Batches</option>
                            {allBatches.map(b => <option key={b} value={b}>Batch {b}</option>)}
                        </select>
                        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} style={{ padding: '0.5rem 0.8rem', border: '1.5px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '0.83rem', minWidth: 130 }}>
                            <option value="">All Companies</option>
                            {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {(searchQuery || filterSkill || filterBatch || filterCompany) && (
                            <button onClick={() => { setSearchQuery(''); setFilterSkill(''); setFilterBatch(''); setFilterCompany('') }}
                                style={{ padding: '0.5rem 0.8rem', border: '1.5px solid var(--danger)', borderRadius: 8, background: 'var(--danger-alpha)', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                                Clear Filters
                            </button>
                        )}
                    </div>

                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        Showing {filteredAlumni.length} alumni
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                        {filteredAlumni.map(a => (
                            <AlumniCard key={a.id} alumni={a} onConnect={handleConnect} onMessage={handleMessage} onWithdraw={handleWithdraw} />
                        ))}
                        {filteredAlumni.length === 0 && (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                <Search size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                                <div style={{ fontSize: '0.9rem' }}>No alumni match your search</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── MY NETWORK TAB ── */}
            {activeTab === 'network' && (
                <div>
                    {connectedAlumni.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
                            <Users size={48} style={{ color: 'var(--text-muted)', opacity: 0.35, marginBottom: 12 }} />
                            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)' }}>No connections yet</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Start building your alumni network to unlock career opportunities!</p>
                            <button onClick={() => setActiveTab('directory')} style={{ padding: '0.6rem 1.4rem', background: 'var(--primary)', border: 'none', borderRadius: 20, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}>
                                Browse Alumni Directory
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '1rem', fontSize: '1rem' }}>
                                {connectedAlumni.length} Connection{connectedAlumni.length !== 1 ? 's' : ''}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                {connectedAlumni.map(a => (
                                    <div key={a.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <Avatar name={a.name} size={52} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.92rem' }}>{a.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{a.job_title}</div>
                                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}><Building size={11} />{a.company}</div>
                                        </div>
                                        <button onClick={() => handleMessage(a)} style={{ padding: '0.45rem 0.8rem', border: '1.5px solid var(--primary)', borderRadius: 20, background: 'var(--primary-alpha)', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <MessageSquare size={13} /> Chat
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Sent Requests */}
                    {alumni.filter(a => a.connection_status === 'pending').length > 0 && (
                        <div style={{ marginTop: '1.5rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                                <Clock size={16} style={{ marginRight: 6 }} />Pending Requests Sent
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {alumni.filter(a => a.connection_status === 'pending').map(a => (
                                    <div key={a.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Avatar name={a.name} size={42} />
                                        <div style={{ flex: 1 }}>  
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.88rem' }}>{a.name}</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{a.company}</div>
                                        </div>
                                        <button onClick={() => handleWithdraw(a.id)} style={{ padding: '0.4rem 0.8rem', border: '1.5px solid var(--border-color)', borderRadius: 20, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem' }}>
                                            Withdraw
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── REQUESTS TAB ── */}
            {activeTab === 'requests' && (
                <div>
                    {requests.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
                            <Bell size={48} style={{ color: 'var(--text-muted)', opacity: 0.35, marginBottom: 12 }} />
                            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)' }}>No pending requests</h3>
                            <p style={{ color: 'var(--text-muted)' }}>When alumni send you connection requests, they'll appear here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                {requests.length} Pending Connection Request{requests.length !== 1 ? 's' : ''}
                            </div>
                            {requests.map(req => (
                                <div key={req.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.1rem 1.3rem', display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Avatar name={req.from_name} size={52} />
                                    <div style={{ flex: 1, minWidth: 160 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>{req.from_name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{req.from_title} · {req.from_company}</div>
                                        {req.message && (
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>"{req.message}"</div>
                                        )}
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>{timeAgo(req.created_at)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={() => handleAcceptRequest(req)} style={{ padding: '0.5rem 1.1rem', background: 'var(--primary)', border: 'none', borderRadius: 20, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <CheckCircle size={14} /> Accept
                                        </button>
                                        <button onClick={() => handleDeclineRequest(req.id)} style={{ padding: '0.5rem 1rem', border: '1.5px solid var(--border-color)', borderRadius: 20, background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                                            Ignore
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create Post Modal */}
            {showCreatePost && <CreatePostModal user={user} onClose={() => setShowCreatePost(false)} onPost={handlePost} />}

            {/* Chat Window */}
            {chatWith && <ChatWindow alumni={chatWith} currentUser={user} onClose={() => setChatWith(null)} />}

            <style>{`
                @keyframes fadeInDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
