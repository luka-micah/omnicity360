import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function LegalNoticePage({ kind }: { kind: 'terms' | 'privacy' }) {
  const isPrivacy = kind === 'privacy';

  return (
    <section className="legal-notice">
      <span className="section-kicker">HOTEL MARKETPLACE · PREVIEW</span>
      <h1>{isPrivacy ? 'A note about privacy.' : 'A note about these terms.'}</h1>
      <div className="legal-preview-alert" role="note">
        <AlertCircle aria-hidden="true" size={17} />
        This product preview is not ready for real customer or hotel data.
      </div>
      <p>
        {isPrivacy
          ? 'A final privacy notice is still being prepared and reviewed. The preview account flow sends the details you enter to the API configured for this installation, where account information is stored. Use fictional test details only; do not submit real identity documents, personal information, or payment details.'
          : 'Final customer and partner terms are still being prepared and reviewed. There is no live hotel inventory, booking, or payment service in this preview. Do not use it to make real travel arrangements.'}
      </p>
      <p>
        {isPrivacy
          ? 'Until the final notice is published, account registration is for local development and testing only. Your installation operator controls the configured API and its database.'
          : 'Nothing on this preview constitutes a confirmed hotel reservation, an offer of accommodation, or a guarantee of prices or availability.'}
      </p>
      <Link className="text-link" to="/">
        <ArrowLeft aria-hidden="true" size={15} /> Back to the homepage
      </Link>
      <div aria-hidden="true" className="legal-notice-mark">
        <span>h.</span>
        <ArrowRight size={17} />
      </div>
    </section>
  );
}
