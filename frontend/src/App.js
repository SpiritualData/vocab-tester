import React, { useState, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import './VocabTester.css';

const API_URL = 'http://18.189.128.76:8010';

const VocabTester = () => {
  const [user, setUser] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentTerm, setCurrentTerm] = useState(null);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [incorrectAttempt, setIncorrectAttempt] = useState(false);
  const [usedHint, setUsedHint] = useState(false);

  const login = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      await axios.post(`${API_URL}/login?name=${user}`);
      setLoggedIn(true);
      await fetchNextTerm();
      await fetchProgress();
    } catch (error) {
      console.error('Login error:', error);
      setMessage('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNextTerm = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/next_term/${user}`);
      if (data.message === "No more terms to test") {
        setCurrentTerm(null);
        setMessage("Congratulations! You've completed all terms.");
      } else {
        setCurrentTerm(data);
      }
      setAnswer('');
      setIncorrectAttempt(false);
      setUsedHint(false);
    } catch (error) {
      console.error('Error fetching next term:', error);
      setMessage('Failed to fetch next term. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const submitAnswer = async (submittedAnswer, isRecall) => {
    setIsLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/answer/${user}`, {
        term: currentTerm.term,
        answer: submittedAnswer,
        used_hint: usedHint,
        is_recall: isRecall
      });
      
      if (data.correct) {
        setMessage('Correct!');
        await fetchProgress();
        await fetchNextTerm();
      } else {
        setMessage(`Incorrect. ${isRecall ? "Please try again." : "The correct term is: " + currentTerm.term}`);
        if (!incorrectAttempt) {
          setIncorrectAttempt(true);
          await fetchProgress();
        }
        if (!isRecall) {
          setTimeout(fetchNextTerm, 1500);
        }
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      setMessage('Failed to submit answer. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProgress = async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/progress/${user}`);
      setProgress(data);
    } catch (error) {
      console.error('Error fetching progress:', error);
      setMessage('Failed to fetch progress. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleHint = () => {
    setUsedHint(true);
    setMessage(`The correct answer is: ${currentTerm.term}`);
    setAnswer(currentTerm.term);
  };

  const getProgressData = () => {
    if (!progress || !progress.stats) return [];
    
    return [
      { name: 'Remembered', value: progress.stats.remembered || 0, color: '#4CAF50' },
      { name: 'Recalled', value: progress.stats.recalled_correctly || 0, color: '#FFEB3B' },
      { name: 'Correct', value: progress.stats.answered_correctly || 0, color: '#FF9800' },
      { name: 'Incorrect', value: progress.stats.answered_incorrectly || 0, color: '#F44336' },
      { name: 'Untested', value: progress.stats.untested || 0, color: '#9E9E9E' },
    ];
  };

  useEffect(() => {
    if (loggedIn) {
      fetchNextTerm();
      fetchProgress();
    }
  }, [loggedIn, fetchNextTerm]);

  if (!loggedIn) {
    return (
      <div className="login-container">
        <h1 className="app-title">Vocabulary Tester</h1>
        <form onSubmit={login} className="login-form">
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Enter your name"
            className="input-field"
            disabled={isLoading}
          />
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Start Testing'}
          </button>
        </form>
        {message && <p className="error-message">{message}</p>}
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1 className="app-title">Vocabulary Tester</h1>
      {isLoading && <div className="loader">Loading...</div>}
      {currentTerm && (
        <div className="question-container">
          <p className="definition-label">Definition:</p>
          <p className="definition-text">{currentTerm.definition}</p>
          {currentTerm.options ? (
            <div className="options-container">
              {currentTerm.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => submitAnswer(option, false)}
                  className={`btn btn-option ${
                    incorrectAttempt && option === currentTerm.term
                      ? 'btn-correct'
                      : ''
                  }`}
                  disabled={isLoading}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <div className="recall-container">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter the term"
                className="input-field"
                disabled={isLoading || usedHint}
              />
              <div className="button-group">
                <button 
                  onClick={() => submitAnswer(answer, true)} 
                  className="btn btn-primary"
                  disabled={isLoading}
                >
                  Submit
                </button>
                <button 
                  onClick={handleHint} 
                  className="btn btn-secondary"
                  disabled={isLoading || usedHint}
                >
                  Hint
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {message && <p className="message">{message}</p>}
      {progress && (
        <div className="progress-container">
          <h2 className="progress-title">Your Progress</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={getProgressData()}>
              <XAxis dataKey="name" />
              <YAxis tickCount={6} domain={[0, 'dataMax + 5']} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill={(entry) => entry.color} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default VocabTester;