import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  Hotel as HotelIcon,
  LogIn,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  createHotel,
  getPartnerHotels,
  submitHotel,
  updateHotel,
  type HotelCreateInput,
  type HotelDocumentType,
} from './api';
import { useAuth } from './auth-context';
import type { PartnerHotel } from './types';

const hotelTypes = [
  ['hotel', 'Hotel'],
  ['guest_house', 'Guest house'],
  ['apartment', 'Serviced apartment'],
  ['resort', 'Resort'],
  ['hostel', 'Hostel'],
  ['lodge', 'Lodge'],
];

const documentTypes: Array<{ value: HotelDocumentType; label: string }> = [
  { value: 'cac_certificate', label: 'CAC certificate' },
  { value: 'tax_clearance', label: 'Tax clearance' },
  { value: 'fire_safety', label: 'Fire safety' },
  { value: 'business_permit', label: 'Business permit' },
  { value: 'other', label: 'Other document' },
];

function statusLabel(status: PartnerHotel['status']) {
  return status.replaceAll('_', ' ');
}

function StatusBadge({ status }: { status: PartnerHotel['status'] }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>;
}

function PartnerAccessCard() {
  const { signIn, signUpPartner } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    try {
      if (mode === 'sign-in') {
        await signIn(email, password, rememberMe);
      } else {
        await signUpPartner({
          email,
          password,
          firstName: String(form.get('firstName')).trim(),
          lastName: String(form.get('lastName')).trim(),
          phone: String(form.get('phone')).trim(),
          companyName: String(form.get('companyName')).trim(),
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not complete your request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-access-layout">
      <div className="portal-welcome">
        <span className="section-kicker">A BETTER WAY TO BE FOUND</span>
        <h1>
          Good stays
          <br />
          <em>deserve their moment.</em>
        </h1>
        <p>
          Bring your hotel to the people looking for somewhere like yours. Create a property
          profile, share the essentials, and send it to our team for review.
        </p>
        <div className="portal-benefits">
          <div>
            <span className="benefit-check">
              <Check size={15} />
            </span>
            Your property information stays yours.
          </div>
          <div>
            <span className="benefit-check">
              <Check size={15} />
            </span>
            A platform administrator reviews every submission.
          </div>
          <div>
            <span className="benefit-check">
              <Check size={15} />
            </span>
            No live listing until your hotel is approved.
          </div>
        </div>
        <div className="portal-welcome-footnote">
          <ShieldCheck aria-hidden="true" size={17} />
          Secure partner access, backed by verified accounts.
        </div>
      </div>

      <div className="access-card">
        <div className="access-card-top">
          <span className="access-icon">
            {mode === 'sign-in' ? <LogIn size={20} /> : <Building2 size={20} />}
          </span>
          <span className="access-step">PARTNER PORTAL</span>
        </div>
        <h2>{mode === 'sign-in' ? 'Welcome back.' : 'Let’s get started.'}</h2>
        <p className="access-intro">
          {mode === 'sign-in'
            ? 'Sign in to pick up where you left off.'
            : 'Create your partner account to add a property.'}
        </p>

        <div aria-label="Partner account action" className="access-tabs" role="tablist">
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

        <form className="portal-form" onSubmit={(event) => void handleSubmit(event)}>
          {mode === 'register' && (
            <>
              <label>
                Company or hotel group
                <input autoComplete="organization" maxLength={255} name="companyName" required />
              </label>
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
              <label>
                Phone number
                <input
                  autoComplete="tel"
                  name="phone"
                  pattern="^\+?[1-9]\d{1,14}$"
                  placeholder="+2348012345678"
                  required
                  title="Use an international phone number, such as +2348012345678"
                  type="tel"
                />
              </label>
            </>
          )}
          <label>
            Work email
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
                Use at least 8 characters, including a number and a capital letter.
              </span>
            )}
          </label>
          {mode === 'register' && (
            <label className="check-row terms-check">
              <input name="acceptTerms" required type="checkbox" />
              <span>
                I understand this is a development preview and agree to the{' '}
                <a href="/terms">partner preview terms</a> and <a href="/privacy">privacy notice</a>
                .
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
              Keep me signed in on this device
            </label>
          )}
          {error && (
            <div className="form-error" role="alert">
              <CircleAlert aria-hidden="true" size={16} />
              {error}
            </div>
          )}
          <button className="button button-dark form-submit" disabled={busy} type="submit">
            {busy
              ? 'Please wait…'
              : mode === 'sign-in'
                ? 'Sign in to partner portal'
                : 'Create partner account'}
            {!busy && <ArrowRight aria-hidden="true" size={16} />}
          </button>
        </form>
        <p className="access-terms">
          By continuing, you agree to our <a href="/terms">partner terms</a> and{' '}
          <a href="/privacy">privacy policy</a>.
        </p>
      </div>
    </div>
  );
}

function HotelCreateForm({
  hotel,
  onCancel,
  onSaved,
}: {
  hotel?: PartnerHotel;
  onCancel: () => void;
  onSaved: (hotel: PartnerHotel) => void;
}) {
  const { accessToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const contactEmail = String(form.get('contactEmail')).trim();
    const contactPhone = String(form.get('contactPhone')).trim();
    const website = String(form.get('website')).trim();
    try {
      const input: HotelCreateInput = {
        name: String(form.get('name')).trim(),
        description: String(form.get('description')).trim(),
        propertyType: String(form.get('propertyType')),
        address: {
          line1: String(form.get('line1')).trim(),
          city: String(form.get('city')).trim(),
          state: String(form.get('state')).trim(),
          country: 'NG',
        },
        contact: {
          ...(contactEmail && { email: contactEmail }),
          ...(contactPhone && { phone: contactPhone }),
          ...(website && { website }),
        },
        checkInTime: String(form.get('checkInTime')),
        checkOutTime: String(form.get('checkOutTime')),
        amenities: String(form.get('amenities'))
          .split(',')
          .map((amenity) => amenity.trim())
          .filter(Boolean),
      };
      const savedHotel = hotel
        ? await updateHotel(accessToken, hotel.id, input)
        : await createHotel(accessToken, input);
      onSaved(savedHotel);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not save this property.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-labelledby="create-hotel-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <div className="modal-card hotel-create-modal">
        <div className="modal-heading">
          <div>
            <span className="section-kicker">A FEW DETAILS TO BEGIN</span>
            <h2 id="create-hotel-title">{hotel ? 'Edit your property.' : 'Add your property.'}</h2>
          </div>
          <button aria-label="Close form" className="modal-close" onClick={onCancel} type="button">
            ×
          </button>
        </div>
        <p className="modal-description">
          {hotel
            ? 'Update your property details, then send the draft back for review.'
            : 'Start with the essentials. You can add more information after your draft is created.'}
        </p>
        <form className="hotel-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Property name
            <input
              autoComplete="organization-title"
              defaultValue={hotel?.name}
              maxLength={255}
              name="name"
              required
            />
          </label>
          <div className="form-two-col">
            <label>
              Property type
              <select defaultValue={hotel?.propertyType ?? 'hotel'} name="propertyType">
                {hotelTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              City
              <input
                autoComplete="address-level2"
                defaultValue={hotel?.address.city}
                maxLength={100}
                name="city"
                required
              />
            </label>
          </div>
          <div className="form-two-col">
            <label>
              State
              <input
                autoComplete="address-level1"
                defaultValue={hotel?.address.state}
                maxLength={100}
                name="state"
                required
              />
            </label>
            <label>
              Street address
              <input
                autoComplete="street-address"
                defaultValue={hotel?.address.line1}
                maxLength={255}
                name="line1"
                required
              />
            </label>
          </div>
          <label>
            Short description
            <textarea
              defaultValue={hotel?.description ?? ''}
              maxLength={5000}
              name="description"
              rows={3}
            />
          </label>
          <div className="form-three-col">
            <label>
              Check-in from
              <input
                defaultValue={hotel?.checkInTime ?? '14:00'}
                name="checkInTime"
                required
                type="time"
              />
            </label>
            <label>
              Check-out by
              <input
                defaultValue={hotel?.checkOutTime ?? '11:00'}
                name="checkOutTime"
                required
                type="time"
              />
            </label>
            <label>
              Contact phone
              <input
                name="contactPhone"
                pattern="^\+?[1-9]\d{1,14}$"
                placeholder="+2348012345678"
                title="Use an international phone number, such as +2348012345678"
                defaultValue={hotel?.contact.phone}
                type="tel"
              />
            </label>
          </div>
          <div className="form-two-col">
            <label>
              Contact email
              <input defaultValue={hotel?.contact.email} name="contactEmail" type="email" />
            </label>
            <label>
              Website
              <input
                defaultValue={hotel?.contact.website}
                name="website"
                placeholder="https://"
                type="url"
              />
            </label>
          </div>
          <label>
            Amenities <span className="optional-note">Optional · separate with commas</span>
            <input
              defaultValue={hotel?.amenities.join(', ')}
              maxLength={1500}
              name="amenities"
              placeholder="Wi-Fi, breakfast, parking"
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button className="button button-quiet" onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="button button-dark" disabled={busy} type="submit">
              {busy ? 'Saving…' : hotel ? 'Save changes' : 'Save as draft'}
              {!busy && <ArrowRight aria-hidden="true" size={16} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SubmitHotelDialog({
  hotel,
  onCancel,
  onSubmitted,
}: {
  hotel: PartnerHotel;
  onCancel: () => void;
  onSubmitted: (hotel: PartnerHotel) => void;
}) {
  const { accessToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const documentType = documentTypes.find(
      (document) => document.value === form.get('type')
    )?.value;
    if (!documentType) {
      setError('Choose a valid document type.');
      setBusy(false);
      return;
    }
    try {
      const updated = await submitHotel(accessToken, hotel.id, {
        documents: [
          {
            type: documentType,
            url: String(form.get('url')).trim(),
            description: String(form.get('description')).trim(),
          },
        ],
      });
      onSubmitted(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not submit this property.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-labelledby="submit-hotel-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <div className="modal-card submit-modal">
        <div className="modal-heading">
          <div>
            <span className="section-kicker">READY FOR A FIRST LOOK?</span>
            <h2 id="submit-hotel-title">Send us the essentials.</h2>
          </div>
          <button aria-label="Close form" className="modal-close" onClick={onCancel} type="button">
            ×
          </button>
        </div>
        <p className="modal-description">
          One existing public link to a business document is required. File uploads are not
          configured yet; this form saves document metadata only.
        </p>
        <form className="hotel-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Document type
            <select defaultValue="cac_certificate" name="type">
              {documentTypes.map((document) => (
                <option key={document.value} value={document.value}>
                  {document.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Document URL
            <input name="url" placeholder="https://..." required type="url" />
            <span className="field-hint">
              Use an HTTPS link to a document you have permission to share.
            </span>
          </label>
          <label>
            Notes <span className="optional-note">Optional</span>
            <input maxLength={500} name="description" />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button className="button button-quiet" onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="button button-dark" disabled={busy} type="submit">
              {busy ? 'Sending for review…' : 'Submit for review'}
              {!busy && <ArrowRight aria-hidden="true" size={16} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PartnerDashboard() {
  const { accessToken, ready, signOut, user } = useAuth();
  const canAccessPartnerPortal =
    user?.role === 'hotel_owner' || user?.role === 'hotel_staff' || user?.role === 'platform_admin';
  const [hotels, setHotels] = useState<PartnerHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hotelFormHotel, setHotelFormHotel] = useState<PartnerHotel | null | undefined>();
  const [submittingHotel, setSubmittingHotel] = useState<PartnerHotel | null>(null);

  const loadHotels = useCallback(async () => {
    if (!accessToken || !canAccessPartnerPortal) {
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      setHotels(await getPartnerHotels(accessToken));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not load your properties.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, canAccessPartnerPortal]);

  useEffect(() => {
    void loadHotels();
  }, [loadHotels]);

  if (!ready) {
    return (
      <div className="portal-loading" role="status">
        Checking your account access…
      </div>
    );
  }
  if (!user || !accessToken) return <PartnerAccessCard />;
  if (!canAccessPartnerPortal) {
    return (
      <section className="portal-blocked">
        <span className="portal-blocked-icon">
          <Building2 size={22} />
        </span>
        <span className="section-kicker">PARTNER PORTAL</span>
        <h1>This space is for hotel partners.</h1>
        <p>
          You’re signed in as {user.email}. A hotel owner or assigned hotel manager account is
          needed to manage properties.
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

  const underReviewCount = hotels.filter((hotel) =>
    ['submitted', 'under_review'].includes(hotel.status)
  ).length;
  const approvedCount = hotels.filter((hotel) => hotel.status === 'approved').length;
  const draftCount = hotels.filter((hotel) => ['draft', 'rejected'].includes(hotel.status)).length;

  function updateHotel(updated: PartnerHotel) {
    setHotels((current) => [updated, ...current.filter((hotel) => hotel.id !== updated.id)]);
  }

  return (
    <div className="portal-page">
      <div className="portal-topline">
        <div>
          <span className="section-kicker">YOUR PARTNER SPACE</span>
          <h1>
            Make yourself <em>at home.</em>
          </h1>
          <p>Welcome back, {user.firstName}. Let’s make it easier for guests to find you.</p>
        </div>
        <div className="portal-top-actions">
          <button className="button button-outline" onClick={() => void loadHotels()} type="button">
            <RefreshCw aria-hidden="true" size={15} />
            Refresh
          </button>
          <button
            className="button button-dark"
            onClick={() => setHotelFormHotel(null)}
            type="button"
          >
            <Plus aria-hidden="true" size={17} />
            Add property
          </button>
        </div>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-icon stat-icon-sage">
            <Building2 size={17} />
          </span>
          <span className="stat-label">Total properties</span>
          <strong>{hotels.length}</strong>
          <small>In your portfolio</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-peach">
            <Clock3 size={17} />
          </span>
          <span className="stat-label">In review</span>
          <strong>{underReviewCount}</strong>
          <small>With our review team</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-green">
            <ShieldCheck size={17} />
          </span>
          <span className="stat-label">Approved</span>
          <strong>{approvedCount}</strong>
          <small>Ready to be discovered</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-yellow">
            <FileCheck2 size={17} />
          </span>
          <span className="stat-label">Needs a little love</span>
          <strong>{draftCount}</strong>
          <small>Drafts or returned to you</small>
        </div>
      </div>

      <section className="hotel-list-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="section-kicker">YOUR PROPERTIES</span>
            <h2>A good place to start.</h2>
          </div>
          <Link className="subtle-link" to="/#how-it-works">
            How listing works <ArrowRight size={14} />
          </Link>
        </div>
        {error && (
          <div className="portal-error" role="alert">
            <CircleAlert size={18} />
            <div>
              <strong>We couldn’t load your properties.</strong>
              <span>{error}</span>
            </div>
            <button onClick={() => void loadHotels()} type="button">
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <div className="empty-hotels">
            <span className="loading-spinner" /> Loading properties…
          </div>
        ) : !hotels.length && !error ? (
          <div className="empty-hotels">
            <span className="empty-hotel-icon">
              <HotelIcon size={22} />
            </span>
            <h3>Your next guest starts here.</h3>
            <p>
              Add your first property to begin the onboarding process. It will remain a private
              draft until you submit it for review.
            </p>
            <button
              className="button button-dark"
              onClick={() => setHotelFormHotel(null)}
              type="button"
            >
              <Plus size={16} /> Add your first property
            </button>
          </div>
        ) : (
          <div className="hotel-list">
            {hotels.map((hotel) => (
              <article className="hotel-row" key={hotel.id}>
                <div className="hotel-row-icon">
                  <HotelIcon size={21} />
                </div>
                <div className="hotel-row-main">
                  <div className="hotel-row-title">
                    <h3>{hotel.name}</h3>
                    <StatusBadge status={hotel.status} />
                  </div>
                  <p>
                    <MapPin size={14} />
                    {hotel.address.city}, {hotel.address.state}
                  </p>
                  {hotel.rejectionReason && (
                    <div className="rejection-note">
                      <CircleAlert size={14} />
                      {hotel.rejectionReason}
                    </div>
                  )}
                  {hotel.statusHistory.length > 0 && (
                    <span className="hotel-row-updated">
                      Last updated{' '}
                      {new Date(
                        hotel.statusHistory[hotel.statusHistory.length - 1].createdAt
                      ).toLocaleDateString('en-NG')}
                    </span>
                  )}
                </div>
                <div className="hotel-row-actions">
                  {['draft', 'rejected'].includes(hotel.status) && (
                    <>
                      <button
                        className="button button-outline button-small"
                        onClick={() => setHotelFormHotel(hotel)}
                        type="button"
                      >
                        Edit details
                      </button>
                      <button
                        className="button button-outline button-small"
                        onClick={() => setSubmittingHotel(hotel)}
                        type="button"
                      >
                        Send for review <ArrowRight size={14} />
                      </button>
                    </>
                  )}
                  {hotel.status === 'submitted' && (
                    <span className="row-status-note">
                      <Clock3 size={14} /> Awaiting review
                    </span>
                  )}
                  {hotel.status === 'under_review' && (
                    <span className="row-status-note">
                      <Clock3 size={14} /> In review
                    </span>
                  )}
                  {hotel.status === 'approved' && (
                    <span className="row-status-note row-status-approved">
                      <Check size={14} /> Approved
                    </span>
                  )}
                  <ChevronRight className="row-chevron" size={18} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="onboarding-help">
        <span className="onboarding-help-icon">
          <FileCheck2 size={20} />
        </span>
        <div>
          <span className="section-kicker">HOW IT WORKS</span>
          <h3>From draft to discovery, one step at a time.</h3>
          <p>
            Add your property details, include a link to a business document, then submit it for our
            team to review. Public listings and booking tools are coming in a later release.
          </p>
        </div>
        <span className="onboarding-help-step">
          01 <ArrowRight size={13} /> 02 <ArrowRight size={13} /> 03
        </span>
      </section>

      {hotelFormHotel !== undefined && (
        <HotelCreateForm
          hotel={hotelFormHotel ?? undefined}
          onCancel={() => setHotelFormHotel(undefined)}
          onSaved={(savedHotel) => {
            updateHotel(savedHotel);
            setHotelFormHotel(undefined);
          }}
        />
      )}
      {submittingHotel && (
        <SubmitHotelDialog
          hotel={submittingHotel}
          onCancel={() => setSubmittingHotel(null)}
          onSubmitted={(hotel) => {
            updateHotel(hotel);
            setSubmittingHotel(null);
          }}
        />
      )}
    </div>
  );
}

export default function PartnerPage() {
  return <PartnerDashboard />;
}
