import React, { useContext, useState } from 'react';
import { ThemeContext } from '../App';
import { AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import '../styles/PlagiarismChecker.css';

const PlagiarismChecker = ({ submissionId, code }) => {
    const { theme } = useContext(ThemeContext);
    const [result, setResult] = useState(null);
    const [checking, setChecking] = useState(false);
    const token = localStorage.getItem('authToken');

    const checkPlagiarism = async () => {
        setChecking(true);
        try {
            const response = await fetch('/api/plagiarism/check', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    submission_id: submissionId,
                    code: code
                })
            });

            if (response.ok) {
                const data = await response.json();
                setResult(data);
            }
        } catch (error) {
            console.error('Error checking plagiarism:', error);
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className={`plagiarism-checker ${theme}`}>
            <div className="checker-header">
                <h3>
                    <AlertTriangle size={20} />
                    Plagiarism Check
                </h3>
            </div>

            {!result ? (
                <button 
                    className="check-btn"
                    onClick={checkPlagiarism}
                    disabled={checking}
                >
                    {checking ? (
                        <>
                            <Loader size={16} className="spinning" />
                            Checking...
                        </>
                    ) : (
                        'Run Plagiarism Check'
                    )}
                </button>
            ) : (
                <div className={`plagiarism-result ${result.isPlagiarized ? 'warning' : 'safe'}`}>
                    <div className="result-icon">
                        {result.isPlagiarized ? (
                            <AlertTriangle size={32} />
                        ) : (
                            <CheckCircle size={32} />
                        )}
                    </div>
                    <div className="result-content">
                        <h4>{result.isPlagiarized ? 'Plagiarism Detected' : 'No Plagiarism Detected'}</h4>
                        <div className="similarity-score">
                            Similarity Score: {result.similarityScore}%
                        </div>
                        {result.matches?.length > 0 && (
                            <div className="matches">
                                <h5>Matching Sources:</h5>
                                {result.matches.map((match, idx) => (
                                    <div key={idx} className="match">
                                        <span>{match.source}</span>
                                        <span className="match-percent">{match.percentage}%</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button className="recheck-btn" onClick={() => setResult(null)}>
                        Recheck
                    </button>
                </div>
            )}
        </div>
    );
};

export default PlagiarismChecker;
