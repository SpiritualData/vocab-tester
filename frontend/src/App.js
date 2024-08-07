import React, { useState, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';

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
    setCurrentTerm({ ...currentTerm, options: currentTerm.options });
    setMessage("Here's a hint. Choose from these options:");
  };

  const getProgressData = () => {
    if (!progress || !progress.stats) return [];
    
    return [
      { name: 'Remembered', value: progress.stats.remembered || 0, color: '#4CAF50' },
      { name: 'Recalled', value: progress.stats.recalled_correctly || 0, color: '#FFEB3B' },
      { name: 'Correct', value: progress.stats.answered_correctly || 0, color: '#FF9800' },
      { name: 'Incorrect', value: progress.stats.answered_incorrectly || 0, color: '#F44336' },
      { name: 'Untested', value: progress.stats.untested || 0, color: '#000000' },
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
      <div className="p-4">
        <form onSubmit={login}>
          <h1 className="text-2xl mb-4">Vocabulary Tester</h1>
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Enter your name"
            className="border p-2 mr-2"
            disabled={isLoading}
          />
          <button type="submit" className="bg-blue-500 text-white p-2 rounded" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        {message && <p className="text-red-500 mt-2">{message}</p>}
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">Vocabulary Tester</h1>
      {isLoading && <p>Loading...</p>}
      {currentTerm && (
        <div className="mb-4">
          <p className="font-bold">Definition:</p>
          <p>{currentTerm.definition}</p>
          {currentTerm.options ? (
            <div className="mt-2">
              {currentTerm.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => submitAnswer(option, false)}
                  className={`p-2 m-1 rounded ${
                    incorrectAttempt && option === currentTerm.term
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200'
                  }`}
                  disabled={isLoading}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter the term"
                className="border p-2 mt-2 w-full"
                disabled={isLoading}
              />
              <div className="mt-2">
                <button 
                  onClick={() => submitAnswer(answer, true)} 
                  className="bg-green-500 text-white p-2 rounded mr-2"
                  disabled={isLoading}
                >
                  Submit
                </button>
                <button 
                  onClick={handleHint} 
                  className="bg-yellow-500 text-white p-2 rounded"
                  disabled={isLoading || usedHint}
                >
                  Hint
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {message && <p className="text-lg font-bold mb-4">{message}</p>}
      {progress && (
        <div className="mt-4">
          <h2 className="text-xl mb-2">Progress</h2>
          <ResponsiveContainer width="100%" height={600}>
            <BarChart data={getProgressData()}>
              <XAxis dataKey="name" />
              <YAxis tickCount={11} domain={[0, 100]} />
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