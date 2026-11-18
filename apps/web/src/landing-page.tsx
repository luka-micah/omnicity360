import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Compass,
  Heart,
  LoaderCircle,
  MapPin,
  Search,
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { ApiError, createBooking, getQuote, searchHotels } from './api';
import type { HotelSearchResult, PendingBooking, Quote } from './types';

const inspirationStays = [
  {
    name: 'The Courtyard House',
    city: 'Lagos',
    area: 'Ikoyi',
    type: 'A slower kind of city stay',
    image:
      'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1000&q=85',
  },
  {
    name: 'Palm & Tide',
    city: 'Lagos',
    area: 'Lekki',
    type: 'Room to exhale by the water',
    image:
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1000&q=85',
  },
  {
    name: 'The Olive House',
    city: 'Abuja',
    area: 'Maitama',
    type: 'A little quiet in the capital',
    image:
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85',
  },
  {
    name: 'Calabar Garden Rooms',
    city: 'Calabar',
    area: 'Marina',
    type: 'A garden to come home to',
    image:
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85',
  },
];

const inspirationTypes = ['All places', 'City stays', 'By the water', 'Somewhere quieter'];

function dateAfter(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
}

function formatPrice(amount: number, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function formatStayDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function LandingPage({
  onSignIn,
  accessToken,
}: {
  onSignIn: () => void;
  accessToken: string | null;
}) {
  const today = new Date();
  const [destination, setDestination] = useState('');
  const [checkIn, setCheckIn] = useState(dateAfter(today, 14));
  const [checkOut, setCheckOut] = useState(dateAfter(today, 17));
  const [guests, setGuests] = useState(2);
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HotelSearchResult[] | null>(null);
  const [sortBy, setSortBy] = useState<'recommended' | 'price-low' | 'price-high' | 'rating'>(
    'recommended'
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [maxNightlyPrice, setMaxNightlyPrice] = useState('');
  const [minimumRating, setMinimumRating] = useState('');
  const [expandedHotelId, setExpandedHotelId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useState<{
    destination: string;
    checkIn: string;
    checkOut: string;
    adults: number;
  } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<HotelSearchResult | null>(null);
  const [booking, setBooking] = useState<PendingBooking | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [guestDetails, setGuestDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [activeFilter, setActiveFilter] = useState('All places');
  const [savedStays, setSavedStays] = useState<string[]>([]);
  const [expandedStay, setExpandedStay] = useState<string | null>(null);

  const visibleStays = inspirationStays.filter((stay) => {
    if (activeFilter === 'City stays') return ['Lagos', 'Abuja'].includes(stay.city);
    if (activeFilter === 'By the water') return stay.name === 'Palm & Tide';
    if (activeFilter === 'Somewhere quieter') return ['Calabar', 'Abuja'].includes(stay.city);
    return true;
  });
  const filteredHotels = (searchResults ?? []).filter(
    (hotel) =>
      (!maxNightlyPrice || hotel.minPrice.amount <= Number(maxNightlyPrice) * 100) &&
      (!minimumRating || (hotel.rating ?? 0) >= Number(minimumRating))
  );
  const displayedHotels = [...filteredHotels].sort((a, b) => {
    if (sortBy === 'price-low') return a.minPrice.amount - b.minPrice.amount;
    if (sortBy === 'price-high') return b.minPrice.amount - a.minPrice.amount;
    if (sortBy === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
    return 0;
  });
  const activeFilterCount = Number(Boolean(maxNightlyPrice)) + Number(Boolean(minimumRating));

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkOut <= checkIn) {
      setSearchMessage('Your check-out date needs to be after check-in.');
      return;
    }
    if (!destination.trim()) {
      setSearchMessage('Enter a city, neighbourhood, or hotel to search.');
      return;
    }

    setSearching(true);
    setSearchMessage('');
    setSearchResults(null);
    setSearchParams(null);
    setSortBy('recommended');
    setFiltersOpen(false);
    setMaxNightlyPrice('');
    setMinimumRating('');
    setExpandedHotelId(null);
    setQuote(null);
    setBooking(null);
    setSelectedHotel(null);
    try {
      const params = {
        destination: destination.trim(),
        checkIn,
        checkOut,
        adults: guests,
      };
      const response = await searchHotels({ ...params, children: 0, rooms: 1 });
      setSearchParams(params);
      setSearchResults(response.data);
      if (response.data.length === 0)
        setSearchMessage('No available stays match those dates and guests.');
      window.setTimeout(
        () => document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth' }),
        0
      );
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : 'Hotel search failed. Please try again.'
      );
    } finally {
      setSearching(false);
    }
  }

  async function reviewPrice(hotel: HotelSearchResult, categoryId: string, ratePlanId: string) {
    if (!searchParams) return;
    setQuoteLoading(true);
    setBookingError('');
    setBooking(null);
    setQuote(null);
    setSelectedHotel(hotel);
    try {
      const result = await getQuote({
        hotelId: hotel.hotelId,
        roomCategoryId: categoryId,
        ratePlanId,
        checkIn: searchParams.checkIn,
        checkOut: searchParams.checkOut,
        adults: searchParams.adults,
        children: 0,
        rooms: 1,
      });
      setQuote(result);
      window.setTimeout(
        () => document.getElementById('booking-checkout')?.scrollIntoView({ behavior: 'smooth' }),
        0
      );
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'We could not price that room.');
    } finally {
      setQuoteLoading(false);
    }
  }

  async function handleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !searchParams) return;
    setBookingLoading(true);
    setBookingError('');
    try {
      const response = await createBooking(
        {
          quoteId: quote.quoteId,
          idempotencyKey: window.crypto.randomUUID(),
          guests: [{ ...guestDetails, isPrimary: true }],
          rooms: [
            {
              roomCategoryId: quote.roomCategoryId,
              ratePlanId: quote.ratePlanId,
              adults: searchParams.adults,
              children: 0,
              quantity: quote.rooms,
            },
          ],
        },
        accessToken
      );
      setBooking(response);
    } catch (error) {
      setBookingError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'We could not save this booking request. Please try again.'
      );
    } finally {
      setBookingLoading(false);
    }
  }

  function toggleSaved(name: string) {
    setSavedStays((current) =>
      current.includes(name) ? current.filter((saved) => saved !== name) : [...current, name]
    );
  }

  return (
    <>
      <section className="hero-section">
        <div className="hero-backdrop" />
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="eyebrow-line" />A new way to find your somewhere
          </div>
          <h1>
            A little closer
            <br />
            to <span>where you need to be.</span>
          </h1>
          <p className="hero-description">
            From a long weekend in Lagos to a slower stay in the hills. Find a place that feels like
            it was waiting for you.
          </p>
          <a className="hero-scroll" href="#inspiration">
            <span className="scroll-icon">
              <ArrowDownRight aria-hidden="true" size={17} />
            </span>
            Start somewhere
          </a>
        </div>
        <div className="hero-image-note">
          <span className="image-note-dot" />
          A feeling, not a faraway place
          <span className="image-note-divider" />
          06° 25′ N · 03° 25′ E
        </div>
        <div className="hero-side-note">A LITTLE MORE LOCAL. A LOT MORE YOU.</div>
      </section>

      <section aria-label="Search stays" className="search-section" id="search-stays">
        <form className="search-card" onSubmit={handleSearch}>
          <div className="search-field destination-field">
            <label htmlFor="destination">
              <MapPin aria-hidden="true" size={17} />
              Where to?
            </label>
            <input
              autoComplete="address-level2"
              id="destination"
              onChange={(event) => setDestination(event.target.value)}
              placeholder="City, neighbourhood, or hotel"
              value={destination}
            />
          </div>
          <div className="search-divider" />
          <div className="search-field date-field">
            <label htmlFor="check-in">
              <CalendarDays aria-hidden="true" size={17} />
              Check in
            </label>
            <input
              id="check-in"
              min={dateAfter(new Date(), 0)}
              onChange={(event) => {
                setCheckIn(event.target.value);
                if (event.target.value >= checkOut) {
                  setCheckOut(dateAfter(new Date(`${event.target.value}T12:00:00`), 1));
                }
              }}
              type="date"
              value={checkIn}
            />
          </div>
          <div className="search-divider" />
          <div className="search-field date-field">
            <label htmlFor="check-out">
              <CalendarDays aria-hidden="true" size={17} />
              Check out
            </label>
            <input
              id="check-out"
              min={dateAfter(new Date(`${checkIn}T12:00:00`), 1)}
              onChange={(event) => setCheckOut(event.target.value)}
              type="date"
              value={checkOut}
            />
          </div>
          <div className="search-divider" />
          <div className="search-field guests-field">
            <label htmlFor="guest-trigger">
              <Users aria-hidden="true" size={17} />
              Who’s coming?
            </label>
            <button
              aria-expanded={guestPickerOpen}
              className="guest-trigger"
              id="guest-trigger"
              onClick={() => setGuestPickerOpen(!guestPickerOpen)}
              type="button"
            >
              {guests} {guests === 1 ? 'guest' : 'guests'}
              <ChevronDown aria-hidden="true" size={15} />
            </button>
            {guestPickerOpen && (
              <div className="guest-popover">
                <span>Guests</span>
                <div className="guest-stepper">
                  <button
                    aria-label="Remove one guest"
                    disabled={guests <= 1}
                    onClick={() => setGuests(Math.max(1, guests - 1))}
                    type="button"
                  >
                    −
                  </button>
                  <strong>{guests}</strong>
                  <button
                    aria-label="Add one guest"
                    disabled={guests >= 12}
                    onClick={() => setGuests(Math.min(12, guests + 1))}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
          <button className="button search-button" disabled={searching} type="submit">
            {searching ? (
              <LoaderCircle aria-hidden="true" className="spin-icon" size={17} />
            ) : (
              <Search aria-hidden="true" size={17} />
            )}
            <span>{searching ? 'Searching' : 'Find a stay'}</span>
          </button>
        </form>
        <div className="search-footnote">
          <span>
            <Sparkles aria-hidden="true" size={14} />
            Live availability
          </span>
          {searchMessage && <p aria-live="polite">{searchMessage}</p>}
        </div>
      </section>

      {searchResults !== null && (
        <section aria-live="polite" className="live-results-section" id="search-results">
          <div className="live-results-heading">
            <div>
              <span className="section-kicker">AVAILABLE FOR YOUR DATES</span>
              <h2>
                {searchResults.length ? `Stays in ${searchParams?.destination}` : 'No stays found'}
              </h2>
              {searchParams && (
                <p>
                  {formatStayDate(searchParams.checkIn)} – {formatStayDate(searchParams.checkOut)} ·{' '}
                  {searchParams.adults} {searchParams.adults === 1 ? 'guest' : 'guests'} · 1 room
                </p>
              )}
            </div>
            <span>
              {displayedHotels.length} {displayedHotels.length === 1 ? 'stay' : 'stays'}
            </span>
          </div>
          {searchResults.length > 0 && (
            <div className="results-controls">
              <button
                aria-controls="search-filters"
                aria-expanded={filtersOpen}
                className="button button-outline filter-toggle"
                onClick={() => setFiltersOpen(!filtersOpen)}
                type="button"
              >
                <SlidersHorizontal aria-hidden="true" size={16} />
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              <label className="sort-control">
                Sort by
                <select
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (
                      value === 'recommended' ||
                      value === 'price-low' ||
                      value === 'price-high' ||
                      value === 'rating'
                    ) {
                      setSortBy(value);
                    }
                  }}
                  value={sortBy}
                >
                  <option value="recommended">Recommended</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="rating">Top rated</option>
                </select>
              </label>
            </div>
          )}
          {filtersOpen && (
            <div className="search-filter-panel" id="search-filters">
              <label>
                Maximum price per night (NGN)
                <input
                  min="0"
                  onChange={(event) => setMaxNightlyPrice(event.target.value)}
                  placeholder="No limit"
                  type="number"
                  value={maxNightlyPrice}
                />
              </label>
              <label>
                Minimum guest rating
                <select
                  onChange={(event) => setMinimumRating(event.target.value)}
                  value={minimumRating}
                >
                  <option value="">Any rating</option>
                  <option value="4">4+ stars</option>
                  <option value="3">3+ stars</option>
                </select>
              </label>
              {activeFilterCount > 0 && (
                <button
                  className="filter-reset"
                  onClick={() => {
                    setMaxNightlyPrice('');
                    setMinimumRating('');
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          {searchResults.length === 0 ? (
            <div className="search-empty-state">
              <MapPin aria-hidden="true" size={22} />
              <p>
                Try another destination or different dates. Only approved listings with current
                inventory appear here.
              </p>
            </div>
          ) : displayedHotels.length === 0 ? (
            <div className="search-empty-state">
              <SlidersHorizontal aria-hidden="true" size={22} />
              <p>No stays match these filters. Try a higher price or a lower rating.</p>
              <button
                className="filter-reset"
                onClick={() => {
                  setMaxNightlyPrice('');
                  setMinimumRating('');
                }}
                type="button"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="live-results-grid">
              {displayedHotels.map((hotel) => (
                <article className="live-hotel-card" key={hotel.hotelId}>
                  <div className="live-hotel-media">
                    {hotel.images[0] && (
                      <img
                        alt={hotel.images[0].caption ?? hotel.hotelName}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                        src={hotel.images[0].url}
                      />
                    )}
                    <span className="live-hotel-type">
                      {hotel.propertyType.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="live-hotel-copy">
                    <div className="stay-location">
                      <MapPin aria-hidden="true" size={13} />
                      {hotel.city}, {hotel.address.state}
                    </div>
                    <div className="live-hotel-title">
                      <h3>{hotel.hotelName}</h3>
                      {hotel.rating !== null && (
                        <span
                          className="hotel-rating"
                          aria-label={`Rated ${hotel.rating} out of 5`}
                        >
                          {hotel.rating.toFixed(1)}
                          {hotel.reviewCount !== null && hotel.reviewCount > 0
                            ? ` · ${hotel.reviewCount} reviews`
                            : ''}
                        </span>
                      )}
                    </div>
                    <p className="live-hotel-address">{hotel.address.line1}</p>
                    {hotel.description && (
                      <p className="live-hotel-description">{hotel.description}</p>
                    )}
                    {hotel.amenities.length > 0 && (
                      <p className="live-hotel-amenities">
                        {hotel.amenities.slice(0, 4).join(' · ')}
                      </p>
                    )}
                    <div className="live-hotel-footer">
                      <div className="live-hotel-price">
                        <strong>
                          {formatPrice(hotel.minPrice.amount, hotel.minPrice.currency)}
                        </strong>
                        <span>per night</span>
                      </div>
                      <button
                        aria-expanded={expandedHotelId === hotel.hotelId}
                        className="button button-outline button-small"
                        onClick={() =>
                          setExpandedHotelId(
                            expandedHotelId === hotel.hotelId ? null : hotel.hotelId
                          )
                        }
                        type="button"
                      >
                        {expandedHotelId === hotel.hotelId
                          ? 'Hide rooms and rates'
                          : 'View rooms and rates'}
                        <ChevronDown
                          aria-hidden="true"
                          className={expandedHotelId === hotel.hotelId ? 'chevron-rotated' : ''}
                          size={14}
                        />
                      </button>
                    </div>
                    {expandedHotelId === hotel.hotelId && (
                      <div className="available-rooms">
                        {hotel.availableRoomCategories.map((category) => (
                          <div className="available-room" key={category.id}>
                            <div>
                              <strong>{category.name}</strong>
                              <span>
                                Up to {category.maxAdults} adults
                                {category.maxChildren > 0
                                  ? ` + ${category.maxChildren} children`
                                  : ''}{' '}
                                · {category.availableQuantity} available
                              </span>
                            </div>
                            <div className="available-rate-list">
                              {category.ratePlans.map((plan) => (
                                <button
                                  className="button button-outline button-small"
                                  disabled={quoteLoading}
                                  key={plan.id}
                                  onClick={() => void reviewPrice(hotel, category.id, plan.id)}
                                  type="button"
                                >
                                  {quoteLoading && selectedHotel?.hotelId === hotel.hotelId ? (
                                    <LoaderCircle
                                      aria-hidden="true"
                                      className="spin-icon"
                                      size={14}
                                    />
                                  ) : null}
                                  {plan.name} ·{' '}
                                  {formatPrice(plan.price.amount, plan.price.currency)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {quote && selectedHotel && (
        <section
          aria-labelledby="booking-summary-title"
          className="booking-checkout"
          id="booking-checkout"
        >
          {booking ? (
            <div className="pending-booking-state">
              <span className="pending-booking-icon">
                <ShieldAlert aria-hidden="true" size={22} />
              </span>
              <span className="section-kicker">PAYMENT NOT AVAILABLE</span>
              <h2 id="booking-summary-title">Your request is pending, not confirmed.</h2>
              <p>
                We saved request <strong>{booking.reference}</strong> for {booking.hotelName}. No
                payment was taken and the stay is not confirmed.
              </p>
              <div className="payment-blocked-notice" role="status">
                <strong>Payment setup is still being validated.</strong>
                <span>
                  This temporary room hold expires{' '}
                  {booking.holdExpiresAt ? formatDeadline(booking.holdExpiresAt) : 'soon'}. Please
                  do not make a separate payment for this request.
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="booking-summary">
                <span className="section-kicker">REVIEW YOUR STAY</span>
                <h2 id="booking-summary-title">{selectedHotel.hotelName}</h2>
                <p>
                  {quote.roomCategoryName} · {quote.ratePlanName}
                </p>
                {searchParams && (
                  <p>
                    {formatStayDate(searchParams.checkIn)} – {formatStayDate(searchParams.checkOut)}{' '}
                    · {quote.nights} {quote.nights === 1 ? 'night' : 'nights'} · {quote.rooms} room
                  </p>
                )}
                <div className="quote-breakdown">
                  <span>{quote.nights} nightly rates</span>
                  <strong>{formatPrice(quote.subtotal.amount, quote.subtotal.currency)}</strong>
                  {quote.taxes.map((tax) => (
                    <span key={tax.name}>
                      {tax.name}: {formatPrice(tax.amount.amount, tax.amount.currency)}
                    </span>
                  ))}
                  {quote.mandatoryFees.map((fee) => (
                    <span key={fee.name}>
                      {fee.name}: {formatPrice(fee.amount.amount, fee.amount.currency)}
                    </span>
                  ))}
                  {quote.taxes.length === 0 && quote.mandatoryFees.length === 0 && (
                    <span>No additional taxes or mandatory fees are configured.</span>
                  )}
                  <strong className="quote-total">
                    Total · {formatPrice(quote.total.amount, quote.total.currency)}
                  </strong>
                </div>
                <div className="cancellation-summary">
                  <strong>{quote.cancellationPolicy.name}</strong>
                  <span>{quote.cancellationPolicy.description}</span>
                  {quote.cancellationPolicy.freeCancellationUntil && (
                    <span>
                      Free cancellation until{' '}
                      {formatStayDate(quote.cancellationPolicy.freeCancellationUntil.slice(0, 10))}.
                    </span>
                  )}
                </div>
              </div>
              <form className="guest-details-form" onSubmit={(event) => void handleBooking(event)}>
                <span className="section-kicker">WHO’S CHECKING IN?</span>
                <h3>Guest details</h3>
                <div className="guest-name-fields">
                  <label>
                    First name
                    <input
                      autoComplete="given-name"
                      onChange={(event) =>
                        setGuestDetails({ ...guestDetails, firstName: event.target.value })
                      }
                      required
                      value={guestDetails.firstName}
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      autoComplete="family-name"
                      onChange={(event) =>
                        setGuestDetails({ ...guestDetails, lastName: event.target.value })
                      }
                      required
                      value={guestDetails.lastName}
                    />
                  </label>
                </div>
                <label>
                  Email for booking updates
                  <input
                    autoComplete="email"
                    onChange={(event) =>
                      setGuestDetails({ ...guestDetails, email: event.target.value })
                    }
                    required
                    type="email"
                    value={guestDetails.email}
                  />
                </label>
                <label>
                  Phone number
                  <input
                    autoComplete="tel"
                    onChange={(event) =>
                      setGuestDetails({ ...guestDetails, phone: event.target.value })
                    }
                    pattern="\+?[1-9][0-9]{1,14}"
                    placeholder="+2348012345678"
                    required
                    type="tel"
                    value={guestDetails.phone}
                  />
                </label>
                <div className="payment-blocked-notice">
                  <strong>Online payment is not connected.</strong>
                  <span>
                    Submitting creates a pending request and a 15-minute inventory hold only. It
                    does not charge you or confirm the stay.
                  </span>
                </div>
                {bookingError && (
                  <p className="form-error" role="alert">
                    {bookingError}
                  </p>
                )}
                <button className="button button-dark" disabled={bookingLoading} type="submit">
                  {bookingLoading && (
                    <LoaderCircle aria-hidden="true" className="spin-icon" size={16} />
                  )}
                  {bookingLoading ? 'Saving request…' : 'Create pending request'}
                </button>
              </form>
            </>
          )}
        </section>
      )}

      <section className="intro-section" id="how-it-works">
        <div className="intro-overline">
          <span>THE STAY, REIMAGINED</span>
          <span className="intro-overline-line" />
          <span>01 — 03</span>
        </div>
        <div className="intro-grid">
          <h2>
            Not just
            <br />
            <span>a place to sleep.</span>
          </h2>
          <div className="intro-copy">
            <p>
              It’s a warm welcome after a long flight. The neighbourhood café downstairs. The
              feeling of being exactly where you’re meant to be.
            </p>
            <p className="intro-copy-muted">
              We’re bringing Nigeria’s independent hotels and the people behind them a little closer
              to the travellers looking for something real.
            </p>
            <a className="text-link" href="#inspiration">
              Find a place that feels right <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          </div>
        </div>
        <div aria-hidden="true" className="intro-ornament">
          <span>h.</span>
        </div>
      </section>

      <section className="stays-section" id="inspiration">
        <div className="section-heading">
          <div>
            <span className="section-kicker">A FEW PLACES TO BEGIN</span>
            <h2>
              Somewhere good, <em>somewhere new.</em>
            </h2>
          </div>
          <p>Four little ideas for wherever the days take you.</p>
        </div>
        <div aria-label="Filter example stays" className="stay-filters">
          {inspirationTypes.map((filter) => (
            <button
              aria-pressed={activeFilter === filter}
              className={activeFilter === filter ? 'filter-chip is-selected' : 'filter-chip'}
              key={filter}
              onClick={() => setActiveFilter(filter)}
              type="button"
            >
              {filter === 'All places' && <Compass aria-hidden="true" size={14} />}
              {filter}
            </button>
          ))}
        </div>
        <div className="stay-grid">
          {visibleStays.map((stay, index) => {
            const isSaved = savedStays.includes(stay.name);
            return (
              <article className={`stay-card stay-card-${index + 1}`} key={stay.name}>
                <div className="stay-photo-wrap">
                  <img
                    alt={`An illustrative travel scene for ${stay.name}`}
                    loading="lazy"
                    src={stay.image}
                  />
                  <span className="stay-preview-tag">Illustrative</span>
                  <button
                    aria-label={
                      isSaved ? `Remove ${stay.name} from saved places` : `Save ${stay.name}`
                    }
                    aria-pressed={isSaved}
                    className={isSaved ? 'save-button is-saved' : 'save-button'}
                    onClick={() => toggleSaved(stay.name)}
                    type="button"
                  >
                    <Heart aria-hidden="true" fill={isSaved ? 'currentColor' : 'none'} size={18} />
                  </button>
                  <span className="stay-image-index">0{index + 1} / 04</span>
                </div>
                <div className="stay-card-copy">
                  <div className="stay-location">
                    <MapPin aria-hidden="true" size={13} />
                    {stay.area}, {stay.city}
                  </div>
                  <h3>{stay.name}</h3>
                  <p>{stay.type}</p>
                  <button
                    aria-controls={`stay-details-${stay.name.toLowerCase().replaceAll(' ', '-')}`}
                    aria-expanded={expandedStay === stay.name}
                    className="stay-card-link"
                    onClick={() =>
                      setExpandedStay((current) => (current === stay.name ? null : stay.name))
                    }
                    type="button"
                  >
                    {expandedStay === stay.name ? 'A little less' : 'A little more'}
                    <ArrowRight aria-hidden="true" size={15} />
                  </button>
                  {expandedStay === stay.name && (
                    <div
                      className="stay-inspiration-details"
                      id={`stay-details-${stay.name.toLowerCase().replaceAll(' ', '-')}`}
                    >
                      <p>
                        An idea inspired by {stay.area}, {stay.city} — this is not a live hotel
                        listing.
                      </p>
                      <a href="#destination" onClick={() => setDestination(stay.city)}>
                        Search available stays in {stay.city}
                        <ArrowRight aria-hidden="true" size={13} />
                      </a>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="stay-disclaimer">
          <span className="disclaimer-check">
            <Check aria-hidden="true" size={13} />
          </span>
          <p>
            These example stays are illustrative only. Search above uses current availability and
            server-calculated prices. Requests remain unconfirmed until a payment provider is
            approved.
          </p>
        </div>
      </section>

      <section className="partner-callout">
        <div className="partner-callout-image" />
        <div className="partner-callout-copy">
          <span className="section-kicker">FOR THE PEOPLE WHO MAKE A STAY</span>
          <h2>
            Your place.
            <br />
            <em>More people.</em>
          </h2>
          <p>
            Run a hotel that deserves to be discovered? We’re building a better way for independent
            Nigerian stays to meet their next guests.
          </p>
          <a className="button button-light" href="/partner">
            Tell us about your hotel <ArrowRight aria-hidden="true" size={17} />
          </a>
          <span className="partner-callout-footnote">
            Partner pricing and platform terms are not yet finalized.
          </span>
        </div>
        <div aria-hidden="true" className="partner-callout-number">
          02
        </div>
      </section>

      <section className="promise-section">
        <div className="promise-heading">
          <span className="section-kicker">A BETTER KIND OF GETAWAY</span>
          <h2>
            Small details. <em>Big difference.</em>
          </h2>
        </div>
        <div className="promise-grid">
          <div className="promise-item">
            <span className="promise-icon promise-icon-peach">
              <Compass aria-hidden="true" size={19} />
            </span>
            <span className="promise-count">01 / LOCAL FIRST</span>
            <h3>Made for here.</h3>
            <p>
              Built around the cities, people, and independent stays that make Nigeria what it is.
            </p>
          </div>
          <div className="promise-item">
            <span className="promise-icon promise-icon-sage">
              <Sparkles aria-hidden="true" size={19} />
            </span>
            <span className="promise-count">02 / THOUGHTFUL STAYS</span>
            <h3>Less scrolling. More feeling.</h3>
            <p>A gentler way to find a place that fits the way you actually want to travel.</p>
          </div>
          <div className="promise-item">
            <span className="promise-icon promise-icon-yellow">
              <Heart aria-hidden="true" size={19} />
            </span>
            <span className="promise-count">03 / PEOPLE BEHIND IT</span>
            <h3>Hospitality, with a face.</h3>
            <p>We believe the best stays come from people who care about the little things.</p>
          </div>
        </div>
      </section>

      <section className="closing-section">
        <div className="closing-image" />
        <div className="closing-copy">
          <span className="closing-kicker">YOUR NEXT CHAPTER IS OUT THERE</span>
          <h2>
            Let’s find
            <br />
            <em>your somewhere.</em>
          </h2>
          <p>New places, familiar warmth. We’ll meet you there.</p>
          <a
            className="button button-dark"
            href="#destination"
            onClick={() => document.getElementById('destination')?.focus()}
          >
            Find a stay <ArrowRight aria-hidden="true" size={16} />
          </a>
        </div>
        <span className="closing-stamp">
          <span>MAKE YOURSELF</span>
          <strong>at home</strong>
          <span>WHEREVER THAT IS</span>
        </span>
      </section>

      <div className="closing-signin">
        Already with us?{' '}
        <button onClick={onSignIn} type="button">
          Sign in to your account <ArrowUpRight aria-hidden="true" size={14} />
        </button>
      </div>
    </>
  );
}
