import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Calendar, Save } from 'lucide-react';
import '../styles/AvailabilityCalendar.css';

const AvailabilityCalendar = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [slots, setSlots] = useState({});
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('authToken');

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

    useEffect(() => {
        loadAvailability();
    }, [currentMonth]);

    const loadAvailability = async () => {
        try {
            const response = await fetch(`/api/users/${user?.id}/availability`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSlots(data.slots || {});
            }
        } catch (error) {
            console.error('Error loading availability:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleSlot = (date) => {
        const dateStr = date.toISOString().split('T')[0];
        setSlots(prev => ({
            ...prev,
            [dateStr]: !prev[dateStr]
        }));
    };

    const saveAvailability = async () => {
        try {
            const response = await fetch(`/api/users/${user?.id}/availability`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ slots })
            });
            if (response.ok) {
                alert('Availability updated!');
            }
        } catch (error) {
            console.error('Error saving availability:', error);
        }
    };

    const getDaysInMonth = (date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const generateCalendarDays = () => {
        const daysInMonth = getDaysInMonth(currentMonth);
        const firstDay = getFirstDayOfMonth(currentMonth);
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
        }

        return days;
    };

    const calendarDays = generateCalendarDays();

    return (
        <div className={`availability-calendar ${theme}`}>
            <div className="calendar-header">
                <h2>
                    <Calendar size={24} />
                    Set Availability
                </h2>
                <p>Mark your available slots for mentoring sessions</p>
            </div>

            <div className="calendar-nav">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}>
                    ← Previous
                </button>
                <h3>{months[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}>
                    Next →
                </button>
            </div>

            <div className="calendar-grid">
                <div className="weekdays">
                    {days.map(day => (
                        <div key={day} className="weekday">{day}</div>
                    ))}
                </div>

                <div className="dates">
                    {calendarDays.map((date, idx) => (
                        <div
                            key={idx}
                            className={`date-cell ${date ? 'active' : 'empty'} ${
                                date && slots[date.toISOString().split('T')[0]] ? 'available' : ''
                            }`}
                            onClick={() => date && toggleSlot(date)}
                        >
                            {date?.getDate()}
                        </div>
                    ))}
                </div>
            </div>

            <div className="calendar-legend">
                <div className="legend-item">
                    <div className="legend-box empty"></div>
                    <span>Unavailable</span>
                </div>
                <div className="legend-item">
                    <div className="legend-box available"></div>
                    <span>Available</span>
                </div>
            </div>

            <button className="save-btn" onClick={saveAvailability}>
                <Save size={16} />
                Save Availability
            </button>
        </div>
    );
};

export default AvailabilityCalendar;
