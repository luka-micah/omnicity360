import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  FileCheck2,
  FileText,
  MapPin,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { approveHotel, getAdminHotel, getAdminHotels, rejectHotel, startHotelReview } from './api';
import { useAuth } from './auth-context';
import type { AdminHotel, AdminHotelListItem } from './types';

function AdminSignIn() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await signIn(String(form.get('email')).trim(), String(form.get('password')));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not sign you in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-login">
      <div className="admin-login-copy">
        <span className="admin-lock-mark">
          <ShieldCheck size={23} />
        </span>
        <span className="section-kicker">PLATFORM OPERATIONS</span>
        <h1>
          A closer look at <em>every stay.</em>
        </h1>
        <p>
          Review partner submissions and help ensure every property is ready before it can be
          listed.
        </p>
        <div className="admin-login-rule">
          <span /> Only authorized platform administrators can continue.
        </div>
      </div>
      <div className="admin-login-card">
        <span className="section-kicker">ADMIN PORTAL</span>
        <h2>Sign in securely.</h2>
        <p>Use your platform administrator account.</p>
        <form className="portal-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Work email
            <input autoComplete="username" name="email" required type="email" />
          </label>
          <label>
            Password
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          {error && (
            <div className="form-error" role="alert">
              <CircleAlert size={16} />
              {error}
            </div>
          )}
          <button className="button button-dark form-submit" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in to admin'} <ArrowRight size={16} />
          </button>
        </form>
        <div className="admin-login-security">
          <ShieldCheck size={15} /> Your access is audited.
        </div>
      </div>
    </section>
  );
}

function RejectDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div aria-labelledby="reject-title" aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-card reject-dialog">
        <div className="modal-heading">
          <div>
            <span className="section-kicker">PARTNER FEEDBACK</span>
            <h2 id="reject-title">Return this submission?</h2>
          </div>
          <button
            aria-label="Close dialog"
            className="modal-close"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>
        <p className="modal-description">
          Share a clear reason so the hotel knows what to update. This note will be visible to the
          partner.
        </p>
        <label className="portal-form">
          Reason for rejection
          <textarea
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What should the partner clarify or update?"
            required
            rows={4}
            value={reason}
          />
        </label>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button className="button button-quiet" onClick={onCancel} type="button">
            Keep reviewing
          </button>
          <button
            className="button button-danger"
            disabled={busy || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            type="button"
          >
            {busy ? 'Returning…' : 'Return to partner'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { accessToken, ready, signOut, user } = useAuth();
  const isPlatformAdmin = user?.role === 'platform_admin';
  const [status, setStatus] = useState<'submitted' | 'under_review'>('submitted');
  const [hotels, setHotels] = useState<AdminHotelListItem[]>([]);
  const [selected, setSelected] = useState<AdminHotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const loadQueue = useCallback(async () => {
    if (!accessToken || !isPlatformAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setHotels(await getAdminHotels(accessToken, status));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not load the review queue.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isPlatformAdmin, status]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  if (!ready) {
    return (
      <div className="portal-loading" role="status">
        Checking your account access…
      </div>
    );
  }
  if (!user || !accessToken) return <AdminSignIn />;
  if (!isPlatformAdmin) {
    return (
      <section className="portal-blocked">
        <span className="portal-blocked-icon">
          <ShieldCheck size={22} />
        </span>
        <span className="section-kicker">ADMIN PORTAL</span>
        <h1>This area is for platform administrators.</h1>
        <p>
          Your account ({user.email}) does not have platform administrator access. The API checks
          your role on every request.
        </p>
        <button
          className="button button-outline"
          onClick={() => void signOut().catch(() => undefined)}
          type="button"
        >
          Sign out and choose another account
        </button>
      </section>
    );
  }

  async function openHotel(hotelId: string) {
    if (!accessToken) return;
    setSelected(null);
    setDetailLoading(true);
    setError('');
    try {
      setSelected(await getAdminHotel(accessToken, hotelId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not load this hotel.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function runReviewAction(action: 'start' | 'approve', hotelId: string) {
    if (!accessToken) return;
    setBusy(true);
    setError('');
    try {
      const updated =
        action === 'start'
          ? await startHotelReview(accessToken, hotelId)
          : await approveHotel(accessToken, hotelId);
      setSelected(updated);
      await loadQueue();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not update this hotel.');
    } finally {
      setBusy(false);
    }
  }

  async function returnToPartner(reason: string) {
    if (!accessToken || !selected) return;
    setBusy(true);
    setError('');
    try {
      await rejectHotel(accessToken, selected.id, reason);
      setRejectOpen(false);
      setSelected(null);
      await loadQueue();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'We could not return this submission.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-topline">
        <div>
          <span className="section-kicker">PLATFORM OPERATIONS · HOTEL ONBOARDING</span>
          <h1>
            Make good stays <em>count.</em>
          </h1>
          <p>Review partner submissions before they become part of the marketplace.</p>
        </div>
        <button className="button button-outline" onClick={() => void loadQueue()} type="button">
          <RefreshCw size={15} /> Refresh queue
        </button>
      </div>

      <div className="admin-metrics">
        <div>
          <span className="admin-metric-mark">
            <FileCheck2 size={17} />
          </span>
          <span>{status === 'submitted' ? 'NEEDS REVIEW' : 'IN THIS QUEUE'}</span>
          <strong>{status === 'submitted' ? hotels.length : '—'}</strong>
        </div>
        <div>
          <span className="admin-metric-mark admin-metric-active">
            <Building2 size={17} />
          </span>
          <span>QUEUE STATUS</span>
          <strong>{status === 'under_review' ? 'In review' : 'Submitted'}</strong>
        </div>
        <div>
          <span className="admin-metric-mark admin-metric-safe">
            <ShieldCheck size={17} />
          </span>
          <span>YOUR ROLE</span>
          <strong>Admin</strong>
        </div>
      </div>

      <div className="admin-workspace">
        <section className="review-queue">
          <div className="review-queue-heading">
            <div>
              <span className="section-kicker">ONBOARDING QUEUE</span>
              <h2>Hotel submissions</h2>
            </div>
            <span className="queue-count">
              {hotels.length} {hotels.length === 1 ? 'hotel' : 'hotels'}
            </span>
          </div>
          <div className="queue-tabs" role="tablist" aria-label="Filter hotel queue">
            <button
              aria-selected={status === 'submitted'}
              className={status === 'submitted' ? 'is-selected' : ''}
              onClick={() => {
                setSelected(null);
                setStatus('submitted');
              }}
              role="tab"
              type="button"
            >
              New submissions
            </button>
            <button
              aria-selected={status === 'under_review'}
              className={status === 'under_review' ? 'is-selected' : ''}
              onClick={() => {
                setSelected(null);
                setStatus('under_review');
              }}
              role="tab"
              type="button"
            >
              In review
            </button>
          </div>
          {error && (
            <div className="portal-error compact" role="alert">
              <CircleAlert size={17} />
              {error}
            </div>
          )}
          {loading ? (
            <div className="queue-empty">
              <span className="loading-spinner" /> Loading review queue…
            </div>
          ) : !hotels.length && !error ? (
            <div className="queue-empty">
              <span className="queue-empty-icon">
                <Check size={20} />
              </span>
              <strong>All caught up.</strong>
              <span>
                {status === 'submitted'
                  ? 'New partner submissions will appear here.'
                  : 'There are no hotels currently in review.'}
              </span>
            </div>
          ) : (
            <div className="queue-list">
              {hotels.map((hotel) => (
                <button
                  aria-current={selected?.id === hotel.id ? 'true' : undefined}
                  className={selected?.id === hotel.id ? 'queue-row is-active' : 'queue-row'}
                  key={hotel.id}
                  onClick={() => void openHotel(hotel.id)}
                  type="button"
                >
                  <span className="queue-row-icon">
                    <Building2 size={18} />
                  </span>
                  <span className="queue-row-content">
                    <strong>{hotel.name}</strong>
                    <span>
                      <MapPin size={12} />
                      {hotel.address.city}, {hotel.address.state}
                    </span>
                    <small>
                      {hotel.partner.firstName} {hotel.partner.lastName}
                    </small>
                  </span>
                  <span className="queue-row-date">
                    {new Date(hotel.submittedAt ?? '').toLocaleDateString('en-NG')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="review-detail">
          {detailLoading ? (
            <div className="detail-empty">
              <span className="loading-spinner" /> Loading property details…
            </div>
          ) : selected ? (
            <div className="detail-content">
              <button className="detail-back" onClick={() => setSelected(null)} type="button">
                <ArrowLeft size={15} /> Back to queue
              </button>
              <div className="detail-title">
                <span className="detail-hotel-icon">
                  <Building2 size={21} />
                </span>
                <div>
                  <span className="section-kicker">{selected.status.replaceAll('_', ' ')}</span>
                  <h2>{selected.name}</h2>
                </div>
              </div>
              <p className="detail-description">
                {selected.description || 'No property description provided.'}
              </p>
              <div className="detail-facts">
                <div>
                  <span>PROPERTY TYPE</span>
                  <strong>{selected.propertyType.replaceAll('_', ' ')}</strong>
                </div>
                <div>
                  <span>LOCATION</span>
                  <strong>
                    {selected.address.line1}, {selected.address.city}, {selected.address.state}
                  </strong>
                </div>
                <div>
                  <span>CHECK-IN / CHECK-OUT</span>
                  <strong>
                    {selected.checkInTime} / {selected.checkOutTime}
                  </strong>
                </div>
                <div>
                  <span>PARTNER</span>
                  <strong>
                    {selected.partner.firstName} {selected.partner.lastName}
                  </strong>
                </div>
                <div>
                  <span>PARTNER EMAIL</span>
                  <a href={`mailto:${selected.partner.email}`}>{selected.partner.email}</a>
                </div>
              </div>
              {selected.amenities.length > 0 && (
                <div className="detail-amenities">
                  <span className="detail-label">AMENITIES</span>
                  <div>
                    {selected.amenities.map((amenity) => (
                      <span key={amenity}>{amenity}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="detail-documents">
                <div className="detail-documents-title">
                  <span className="detail-label">SUPPORTING DOCUMENTS</span>
                  <span>{selected.documents.length}</span>
                </div>
                {selected.documents.length ? (
                  selected.documents.map((document) => (
                    <a
                      className="document-row"
                      href={document.url}
                      key={document.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <FileText size={17} />
                      <span>
                        <strong>{document.type.replaceAll('_', ' ')}</strong>
                        <small>{document.description || 'Open linked document'}</small>
                      </span>
                      <ArrowRight size={15} />
                    </a>
                  ))
                ) : (
                  <p className="no-documents">No supporting documents have been added.</p>
                )}
              </div>
              <div className="detail-history">
                <span className="detail-label">SUBMISSION TIMELINE</span>
                {selected.statusHistory.map((entry) => (
                  <div className="history-row" key={entry.id}>
                    <span className="history-dot" />
                    <span>
                      <strong>{entry.toStatus.replaceAll('_', ' ')}</strong>
                      <small>{new Date(entry.createdAt).toLocaleString('en-NG')}</small>
                    </span>
                  </div>
                ))}
              </div>
              <div className="review-actions">
                {selected.status === 'submitted' && (
                  <button
                    className="button button-dark"
                    disabled={busy}
                    onClick={() => void runReviewAction('start', selected.id)}
                    type="button"
                  >
                    Begin review <ArrowRight size={15} />
                  </button>
                )}
                {selected.status === 'under_review' && (
                  <>
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => setRejectOpen(true)}
                      type="button"
                    >
                      <X size={15} /> Return to partner
                    </button>
                    <button
                      className="button button-approve"
                      disabled={busy}
                      onClick={() => void runReviewAction('approve', selected.id)}
                      type="button"
                    >
                      <Check size={16} /> Approve property
                    </button>
                  </>
                )}
              </div>
              <p className="audit-note">
                <ShieldCheck size={14} /> Your review decisions are recorded in the audit history.
              </p>
            </div>
          ) : (
            <div className="detail-empty">
              <span className="detail-empty-icon">
                <FileCheck2 size={24} />
              </span>
              <h3>A considered review makes a better stay.</h3>
              <p>
                Choose a hotel from the queue to review the partner’s property details and
                documents.
              </p>
            </div>
          )}
        </section>
      </div>
      {rejectOpen && (
        <RejectDialog
          busy={busy}
          error={error}
          onCancel={() => {
            setRejectOpen(false);
            setError('');
          }}
          onConfirm={(reason) => void returnToPartner(reason)}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  return <AdminDashboard />;
}
