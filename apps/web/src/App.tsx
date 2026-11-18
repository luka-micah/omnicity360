import { KeyRound, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import AdminPage from './admin-page';
import { useAuth } from './auth-context';
import AuthModal from './auth-modal';
import LandingPage from './landing-page';
import LegalNoticePage from './legal-notice';
import PartnerPage from './partner-page';

function Header({ onSignIn }: { onSignIn: () => void }) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const location = useLocation();

  const closeMenu = () => setMenuOpen(false);
  const isPartnerArea = location.pathname.startsWith('/partner');
  const isAdminArea = location.pathname.startsWith('/admin');
  const canAccessPartnerPortal =
    user?.role === 'hotel_owner' || user?.role === 'hotel_staff' || user?.role === 'platform_admin';

  async function handleSignOut() {
    setSignOutError('');
    try {
      await signOut();
    } catch (reason) {
      setSignOutError(reason instanceof Error ? reason.message : 'We could not sign you out.');
    }
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link aria-label="Omnicity360 home" className="brand" to="/" onClick={closeMenu}>
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>Omnicity360</span>
        </Link>

        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="mobile-menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          type="button"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <nav aria-label="Main navigation" className={menuOpen ? 'main-nav is-open' : 'main-nav'}>
          <Link to="/#search-stays" onClick={closeMenu}>
            Find stays
          </Link>
          <a href="/#how-it-works" onClick={closeMenu}>
            How it works
          </a>
          {canAccessPartnerPortal && (
            <Link
              aria-current={isPartnerArea ? 'page' : undefined}
              className={isPartnerArea ? 'nav-active' : ''}
              onClick={closeMenu}
              to="/partner"
            >
              For hoteliers
            </Link>
          )}
          {user?.role === 'platform_admin' && (
            <Link
              aria-current={isAdminArea ? 'page' : undefined}
              className={isAdminArea ? 'nav-active' : ''}
              onClick={closeMenu}
              to="/admin"
            >
              Admin
            </Link>
          )}
          {user ? (
            <div className="nav-account">
              <span className="nav-greeting">Hi, {user.firstName}</span>
              <button
                className="button button-outline button-small"
                onClick={() => void handleSignOut()}
                type="button"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          ) : (
            <button className="button button-outline button-small" onClick={onSignIn} type="button">
              <KeyRound size={15} />
              Sign in
            </button>
          )}
          {signOutError && (
            <p className="form-error nav-error" role="alert">
              {signOutError}
            </p>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link aria-label="Omnicity360 home" className="brand brand-light" to="/">
            <span className="brand-mark" aria-hidden="true">
              O
            </span>
            <span>Omnicity360</span>
          </Link>
          <p>Good stays start with good people.</p>
        </div>
        <div className="footer-links">
          <span>Discover</span>
          <a href="/#inspiration">Places to stay</a>
          <a href="/#how-it-works">How it works</a>
        </div>
        <div className="footer-links">
          <span>For partners</span>
          <Link to="/partner">List your property</Link>
          <Link to="/partner">Partner sign in</Link>
        </div>
        <div className="footer-note">
          <span className="footer-note-mark">NG</span>
          <p>Made for the places that make Nigeria feel like home.</p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Omnicity360</span>
        <span>Product preview · Nigeria</span>
      </div>
    </footer>
  );
}

export default function App() {
  const [authOpen, setAuthOpen] = useState(false);
  const { accessToken, sessionWarning, user } = useAuth();

  return (
    <div className="app-shell">
      <Header onSignIn={() => setAuthOpen(true)} />
      {sessionWarning && (
        <div className="session-warning" role="status">
          {sessionWarning}
        </div>
      )}
      <main>
        <Routes>
          <Route
            element={
              <LandingPage
                accessToken={user?.role === 'customer' ? accessToken : null}
                onSignIn={() => setAuthOpen(true)}
              />
            }
            path="/"
          />
          <Route element={<PartnerPage />} path="/partner/*" />
          <Route element={<AdminPage />} path="/admin/*" />
          <Route element={<LegalNoticePage kind="terms" />} path="/terms" />
          <Route element={<LegalNoticePage kind="privacy" />} path="/privacy" />
          <Route element={<Navigate replace to="/" />} path="*" />
        </Routes>
      </main>
      <Footer />
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
