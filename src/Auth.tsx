import { useState } from 'react';
import { supabase } from './supabaseClient';

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
      <div className="app__empty-state">
        <h2>Welcome to Clear View</h2>
        <p>Sign in or create an account to get started.</p>
        <form onSubmit={handleLogin} className="modal__form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="modal__actions">
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
