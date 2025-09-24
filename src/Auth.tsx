import { useState } from 'react';
import { supabase } from './supabaseClient';
import logo from './assets/logo.png'; // Import the logo

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) alert(error.message);
    setLoading(false);
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="app-shell">
      <div className="auth-container"> {/* New container for styling */}
        <div className="auth-header">
          <img src={logo} alt="Clear View Logo" className="auth-logo" />
          <h2 className="sidebar__title">Clear View</h2> {/* Reusing sidebar__title for gradient */}
          <p className="sidebar__subtitle">Built by Project Managers for Project Managers</p> {/* Reusing subtitle */}
        </div>
        <form onSubmit={handleLogin} className="auth-form"> {/* New class for form styling */}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
          />
          <div className="auth-actions">
            <button type="submit" className="modal__primary" disabled={loading}>
              {loading ? 'Loading' : 'Login'}
            </button>
            <button type="button" className="modal__secondary" onClick={handleSignUp} disabled={loading}>
              {loading ? 'Loading' : 'Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}