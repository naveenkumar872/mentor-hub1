import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { Users, Star, MessageSquare } from 'lucide-react';
import '../styles/MentorMatching.css';

const MentorMatching = () => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [mentors, setMentors] = useState([]);
    const [selectedMentor, setSelectedMentor] = useState(null);
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('authToken');

    useEffect(() => {
        loadMentors();
    }, []);

    const loadMentors = async () => {
        try {
            const response = await fetch(`/api/mentors/matching?studentId=${user?.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMentors(data.mentors || []);
            }
        } catch (error) {
            console.error('Error loading mentors:', error);
        } finally {
            setLoading(false);
        }
    };

    const requestMentor = async (mentorId) => {
        try {
            const response = await fetch('/api/mentor-requests', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ mentor_id: mentorId })
            });
            if (response.ok) {
                alert('Request sent to mentor!');
            }
        } catch (error) {
            console.error('Error requesting mentor:', error);
        }
    };

    return (
        <div className={`mentor-matching ${theme}`}>
            <div className="matching-header">
                <h2>
                    <Users size={24} />
                    Find Your Mentor
                </h2>
                <p>Get matched with experienced mentors based on your learning goals</p>
            </div>

            {loading ? (
                <div className="loading">Finding mentors for you...</div>
            ) : (
                <div className="mentors-grid">
                    {mentors.length > 0 ? (
                        mentors.map(mentor => (
                            <div key={mentor.id} className={`mentor-card ${selectedMentor?.id === mentor.id ? 'selected' : ''}`}>
                                <div className="mentor-header">
                                    <img src={mentor.avatar} alt={mentor.name} className="mentor-avatar" />
                                    <div className="mentor-info">
                                        <h3>{mentor.name}</h3>
                                        <div className="mentor-title">{mentor.specialization}</div>
                                    </div>
                                </div>

                                <div className="mentor-stats">
                                    <div className="stat">
                                        <Star size={16} />
                                        <span>{mentor.rating}/5 ({mentor.reviewCount} reviews)</span>
                                    </div>
                                    <div className="stat">
                                        <Users size={16} />
                                        <span>{mentor.studentCount} students</span>
                                    </div>
                                </div>

                                <div className="mentor-bio">{mentor.bio}</div>

                                <div className="mentor-skills">
                                    {mentor.expertiseAreas?.map((skill, idx) => (
                                        <span key={idx} className="skill-tag">{skill}</span>
                                    ))}
                                </div>

                                <div className="mentor-actions">
                                    <button className="msg-btn">
                                        <MessageSquare size={16} />
                                        Message
                                    </button>
                                    <button 
                                        className="request-btn"
                                        onClick={() => requestMentor(mentor.id)}
                                    >
                                        Request Mentoring
                                    </button>
                                </div>

                                <div className="match-score">
                                    {mentor.matchScore}% compatibility
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="no-mentors">No mentors available right now</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MentorMatching;
