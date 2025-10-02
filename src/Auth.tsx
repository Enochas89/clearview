import { useState } from 'react';
import { supabase } from './supabaseClient';
import logo from './assets/logo.png'; // Import the logo

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // New state to toggle between login and signup
  const [error, setError] = useState<string | null>(null); // New state for displaying errors
  const [message, setMessage] = useState<string | null>(null); // New state for displaying success messages
  const [passwordValidity, setPasswordValidity] = useState({
    minLength: false,
    hasNumber: false,
    hasLowerCase: false,
    hasUpperCase: false,
  });

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    if (isSignUp) {
      setPasswordValidity({
        minLength: newPassword.length >= 8,
        hasNumber: /\d/.test(newPassword),
        hasLowerCase: /[a-z]/.test(newPassword),
        hasUpperCase: /[A-Z]/.test(newPassword),
      });
    }
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); // Clear previous errors
    setMessage(null); // Clear previous messages

    if (isSignUp && !Object.values(passwordValidity).every(Boolean)) {
      setError("Please ensure your password meets all the requirements.");
      return;
    }

    setLoading(true);
    let authError = null;

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      authError = error;
      if (!error && data.user) {
        setMessage('Check your email for a confirmation link to complete your registration.');
        setEmail(''); // Clear email field
        setPassword(''); // Clear password field
      }
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
            onChange={handlePasswordChange}
            className="auth-input"
            required
          />
          {isSignUp && (
            <div className="password-requirements">
              <p style={{ color: passwordValidity.minLength ? 'green' : 'red' }}>At least 8 characters</p>
              <p style={{ color: passwordValidity.hasNumber ? 'green' : 'red' }}>At least one number</p>
              <p style={{ color: passwordValidity.hasLowerCase ? 'green' : 'red' }}>At least one lowercase letter</p>
              <p style={{ color: passwordValidity.hasUpperCase ? 'green' : 'red' }}>At least one uppercase letter</p>
            </div>
          )}
          {error && <p className="auth-error-message">{error}</p>}
          {message && <p className="auth-success-message">{message}</p>} {/* Display success message */}
          <div className="auth-actions">
            <button type="submit" className="modal__primary" disabled={loading || (isSignUp && !Object.values(passwordValidity).every(Boolean))}>
              {loading ? 'Loading' : (isSignUp ? 'Sign Up' : 'Login')}
            </button>
            <button
              type="button"
              className="modal__secondary"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null); // Clear errors when switching view
                setMessage(null); // Clear messages when switching view
                setEmail(''); // Clear fields
                setPassword(''); // Clear fields
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