import { useState } from 'react';
import { supabase } from './supabaseClient';
import logo from './assets/logo.png'; // Import the logo

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // New state to toggle between login and signup
  const [error, setError] = useState<string | null>(null); // New state for displaying errors

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); // Clear previous errors

    setLoading(true);
    let authError = null;

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      authError = error;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      authError = error;
    }

    if (authError) {
      setError(authError.message);
    }
    setLoading(false);
  };

  return (
    <div className="app-shell">
      <div className="auth-container">
        <div className="auth-header">
          <img src={logo} alt="Clear View Logo" className="auth-logo" />
          <h2 className="sidebar__title">Clear View</h2>
          <p className="sidebar__subtitle">Built by Project Managers for Project Managers</p>
        </div>
        <form onSubmit={handleAuth} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            required
          />
          {error && <p className="auth-error-message">{error}</p>} {/* Display error message */}
          <div className="auth-actions">
            <button type="submit" className="modal__primary" disabled={loading}>
              {loading ? 'Loading' : (isSignUp ? 'Sign Up' : 'Login')}
            </button>
            <button
              type="button"
              className="modal__secondary"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null); // Clear errors when switching view
              }}
              disabled={loading}
            >
              {isSignUp ? 'Already have an account? Login' : 'Need an account? Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
