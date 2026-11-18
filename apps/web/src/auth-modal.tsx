import { ArrowRight, CircleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from './auth-context';

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUpCustomer } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    try {
      if (mode === 'sign-in') {
        await signIn(email, password, rememberMe);
      } else {
        await signUpCustomer({
          email,
          password,
          firstName: String(form.get('firstName')).trim(),
          lastName: String(form.get('lastName')).trim(),
        });
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not complete your request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-labelledby="auth-title"
      aria-modal="true"
      className="modal-backdrop auth-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="modal-card auth-modal">
        <button
          aria-label="Close dialog"
          className="modal-close auth-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>
        <div className="auth-modal-art">
          <span className="auth-art-sun" />
          <span className="auth-art-line">A good place to come back to.</span>
          <span className="auth-art-coordinate">06° 25′ N · 03° 25′ E</span>
        </div>
        <div className="auth-modal-content">
          <span className="section-kicker">HOTEL MARKETPLACE</span>
          <h2 id="auth-title">{mode === 'sign-in' ? 'Welcome back.' : 'Come on in.'}</h2>
          <p>
            {mode === 'sign-in'
              ? 'Sign in to pick up right where you left off.'
              : 'Create your account to keep your details close.'}
          </p>
          <div aria-label="Account action" className="access-tabs" role="tablist">
            <button
              aria-selected={mode === 'sign-in'}
              className={mode === 'sign-in' ? 'is-selected' : ''}
              onClick={() => {
                setMode('sign-in');
                setError('');
              }}
              role="tab"
              type="button"
            >
              Sign in
            </button>
            <button
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'is-selected' : ''}
              onClick={() => {
                setMode('register');
                setError('');
              }}
              role="tab"
              type="button"
            >
              Create account
            </button>
          </div>
          <form className="portal-form auth-form" onSubmit={(event) => void handleSubmit(event)}>
            {mode === 'register' && (
              <div className="form-two-col">
                <label>
                  First name
                  <input autoComplete="given-name" maxLength={100} name="firstName" required />
                </label>
                <label>
                  Last name
                  <input autoComplete="family-name" maxLength={100} name="lastName" required />
                </label>
              </div>
            )}
            <label>
              Email address
              <input autoComplete="email" name="email" required type="email" />
            </label>
            <label>
              Password
              <input
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                minLength={8}
                name="password"
                required
                type="password"
              />
              {mode === 'register' && (
                <span className="field-hint">
                  At least 8 characters, including a number and a capital letter.
                </span>
              )}
            </label>
            {mode === 'register' && (
              <label className="check-row terms-check">
                <input name="acceptTerms" required type="checkbox" />
                <span>
                  I understand this is a development preview and agree to the{' '}
                  <a href="/terms">preview terms</a> and <a href="/privacy">privacy notice</a>.
                </span>
              </label>
            )}
            {mode === 'sign-in' && (
              <label className="check-row">
                <input
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  type="checkbox"
                />
                Keep me signed in
              </label>
            )}
            {error && (
              <div className="form-error" role="alert">
                <CircleAlert size={16} />
                {error}
              </div>
            )}
            <button className="button button-dark form-submit" disabled={busy} type="submit">
              {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>
          <p className="access-terms">
            By continuing, you agree to our <a href="/terms">terms</a> and{' '}
            <a href="/privacy">privacy policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
