import React, { useContext, useEffect, useState } from 'react';
import { ThemeContext, useAuth } from '../App';
import { MessageCircle, Send, Trash2, Flag } from 'lucide-react';
import '../styles/CodeReview.css';

const CodeReviewPanel = ({ submissionId, problemId }) => {
    const { theme } = useContext(ThemeContext);
    const { user } = useAuth();
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [selectedLine, setSelectedLine] = useState(null);
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('authToken');

    useEffect(() => {
        loadComments();
    }, [submissionId]);

    const loadComments = async () => {
        try {
            const response = await fetch(`/api/submissions/${submissionId}/reviews`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setComments(data.reviews || []);
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        } finally {
            setLoading(false);
        }
    };

    const submitComment = async () => {
        if (!newComment.trim()) return;

        try {
            const response = await fetch(`/api/submissions/${submissionId}/reviews`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: newComment,
                    line_number: selectedLine,
                    comment_type: 'review'
                })
            });

            if (response.ok) {
                const newCommentData = await response.json();
                setComments([...comments, newCommentData]);
                setNewComment('');
                setSelectedLine(null);
            }
        } catch (error) {
            console.error('Error submitting comment:', error);
        }
    };

    const deleteComment = async (commentId) => {
        try {
            const response = await fetch(`/api/reviews/${commentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                setComments(comments.filter(c => c.id !== commentId));
            }
        } catch (error) {
            console.error('Error deleting comment:', error);
        }
    };

    return (
        <div className={`code-review-panel ${theme}`}>
            <div className="review-header">
                <h3>
                    <MessageCircle size={20} />
                    Code Review
                </h3>
                <span className="comment-count">{comments.length}</span>
            </div>

            {loading ? (
                <div className="loading">Loading reviews...</div>
            ) : (
                <>
                    {/* Comments List */}
                    <div className="comments-list">
                        {comments.length === 0 ? (
                            <div className="no-comments">No comments yet</div>
                        ) : (
                            comments.map(comment => (
                                <div key={comment.id} className="comment-item">
                                    {comment.line_number && (
                                        <div className="line-badge">Line {comment.line_number}</div>
                                    )}
                                    <div className="comment-header">
                                        <strong>{comment.reviewer_name}</strong>
                                        <span className="comment-date">
                                            {new Date(comment.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="comment-content">{comment.content}</div>
                                    {comment.reviewer_id === user?.id && (
                                        <button
                                            className="delete-btn"
                                            onClick={() => deleteComment(comment.id)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Comment Input */}
                    <div className="comment-input-area">
                        <textarea
                            placeholder="Add a code review comment..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="comment-textarea"
                        />
                        {selectedLine && (
                            <div className="line-selection">
                                Commenting on line {selectedLine}
                                <button onClick={() => setSelectedLine(null)}>Clear</button>
                            </div>
                        )}
                        <button
                            className="submit-comment-btn"
                            onClick={submitComment}
                            disabled={!newComment.trim()}
                        >
                            <Send size={16} />
                            Post Review
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default CodeReviewPanel;
