import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../App';
import { Calendar, User, Info } from 'lucide-react';
import '../styles/AvailabilityCalendar.css';

// Read-only view of a student's assigned mentor availability
const MentorAvailabilityView = ({ user }) => {
    const { theme } = useContext(ThemeContext);
    const [slots, setSlots] = useState({});
    const [mentor, setMentor] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('authToken');

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

    const mentorId = user?.mentorId || user?.mentor_id;

    useEffect(() => {
        if (!mentorId) { setLoading(false); return; }
        loadMentorAvailability();
    }, [mentorId, currentMonth]);

    const loadMentorAvailability = async () => {
        setLoading(true);
        try {
            // Fetch mentor info
            const userRes = await fetch(`/api/users/${mentorId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (userRes.ok) {
                const data = await userRes.json();
                setMentor(data.user || data);
            }

            // Fetch mentor's availability
            const availRes = await fetch(`/api/users/${mentorId}/availability`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (availRes.ok) {
                const data = await availRes.json();
                setSlots(data.slots || {});
            }
        } catch (err) {
            console.error('Error loading mentor availability:', err);
        } finally {
            setLoading(false);
        }
    };

    const getDaysInMonth = (date) =>
        new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

    const getFirstDayOfMonth = (date) =>
        new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const generateCalendarDays = () => {
        const daysInMonth = getDaysInMonth(currentMonth);
        const firstDay = getFirstDayOfMonth(currentMonth);
        const result = [];
        for (let i = 0; i < firstDay; i++) result.push(null);
        for (let i = 1; i <= daysInMonth; i++)
            result.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
        return result;
    };

    const today = new Date().toISOString().split('T')[0];
    const calendarDays = generateCalendarDays();

    if (!mentorId) {
        return (
            <div className={`availability-calendar ${theme}`} style={{ textAlign: 'center', padding: '60px 20px' }}>
                <User size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                <h3 style={{ opacity: 0.6, fontWeight: 500 }}>No mentor assigned yet</h3>
                <p style={{ opacity: 0.4, fontSize: 14 }}>
                    Once a mentor is allocated to you, their availability will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className={`availability-calendar ${theme}`}>
            <div className="calendar-header">
                <h2>
                    <Calendar size={24} />
                    Mentor Availability
                </h2>
                <p>View your mentor's available slots for sessions</p>
            </div>

            {mentor && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 16px',
                        borderRadius: 10,
                        marginBottom: 16,
                        background: theme === 'dark' ? 'rgba(79,70,229,0.12)' : 'rgba(79,70,229,0.07)',
                        border: '1px solid rgba(79,70,229,0.25)',
                        fontSize: 14,
                    }}
                >
                    <div
                        style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0
                        }}
                    >
                        {(mentor.name || 'M')[0].toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600 }}>{mentor.name || 'Your Mentor'}</div>
                        <div style={{ fontSize: 12, opacity: 0.55 }}>{mentor.email || ''}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, opacity: 0.55 }}>
                        <Info size={13} />
                        Read-only
                    </div>
                </div>
            )}

            <div className="calendar-nav">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}>
                    ← Previous
                </button>
                <h3>{months[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}>
                    Next →
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                    Loading availability…
                </div>
            ) : (
                <>
                    <div className="calendar-grid">
                        <div className="weekdays">
                            {days.map(day => (
                                <div key={day} className="weekday">{day}</div>
                            ))}
                        </div>
                        <div className="dates">
                            {calendarDays.map((date, idx) => {
                                const dateStr = date ? date.toISOString().split('T')[0] : null;
                                const isAvailable = dateStr && slots[dateStr];
                                const isPast = dateStr && dateStr < today;
                                return (
                                    <div
                                        key={idx}
                                        className={`date-cell ${date ? 'active' : 'empty'} ${isAvailable ? 'available' : ''}`}
                                        style={{
                                            cursor: 'default',
                                            opacity: isPast ? 0.4 : 1,
                                        }}
                                        title={isAvailable ? 'Mentor is available' : date ? 'Not available' : ''}
                                    >
                                        {date?.getDate()}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="calendar-legend">
                        <div className="legend-item">
                            <div className="legend-box empty"></div>
                            <span>Not Available</span>
                        </div>
                        <div className="legend-item">
                            <div className="legend-box available"></div>
                            <span>Mentor Available — Book a session!</span>
                        </div>
                    </div>

                    {Object.values(slots).filter(Boolean).length === 0 && (
                        <p style={{ textAlign: 'center', opacity: 0.45, fontSize: 13, marginTop: 12 }}>
                            Your mentor hasn't marked any available slots yet.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default MentorAvailabilityView;
