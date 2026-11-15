import Link from 'next/link';

const steps = [
  { number: '01', title: 'Explore tutors', description: 'Filter approved profiles by subject, grade, location, price and online availability.' },
  { number: '02', title: 'Ask a question', description: 'Send a tutor an inquiry about your learning goals. There is no charge to inquire.' },
  { number: '03', title: 'Choose a time', description: 'Review a proposed session or request a different time before you commit.' },
  { number: '04', title: 'Confirm and learn', description: 'Pay securely to confirm your booking, then manage your sessions in one place.' },
];

export default function Home() {
  return (
    <main className="home-page">
      <section className="hero home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">LOCAL TUTORING · WINDSOR & ESSEX COUNTY</p>
          <h1>Local tutors. Stronger futures.</h1>
          <p className="home-lead">Find the right tutor. Build confidence. Discover tutoring in math, French, English, science and more. Compare local tutors, ask questions, and choose a session that works for you.</p>
          <div className="home-hero-actions">
            <Link className="button" href="/tutors">Find a tutor</Link>
            <Link className="home-outline-button" href="/register?role=tutor">Become a tutor</Link>
          </div>
          <p className="home-small-note">Browsing tutor profiles and sending inquiries is free.</p>
        </div>
        <div className="home-hero-side" aria-label="How tutoring works">
          <div className="home-highlight"><span>1</span><div><strong>Find your match</strong><small>Search by subject, grade and budget</small></div></div>
          <div className="home-highlight"><span>2</span><div><strong>Connect directly</strong><small>Discuss goals and scheduling</small></div></div>
          <div className="home-highlight"><span>3</span><div><strong>Book with confidence</strong><small>Pay securely after agreeing on a time</small></div></div>
        </div>
      </section>

      <section className="home-benefits" aria-label="Platform benefits">
        <div><strong>Local focus</strong><p>Windsor, LaSalle, Tecumseh and Essex County</p></div>
        <div><strong>Flexible learning</strong><p>Explore in-person and online options</p></div>
        <div><strong>Clear pricing</strong><p>Compare hourly rates before contacting tutors</p></div>
      </section>

      <section className="home-section" id="how-it-works">
        <div className="home-section-heading">
          <div><p className="home-section-kicker">SIMPLE FROM START TO FINISH</p><h2>How it works</h2></div>
          <Link href="/how-it-works">Booking and payment details</Link>
        </div>
        <div className="home-step-grid">
          {steps.map(step => <article className="card home-step" key={step.number}>
            <span className="home-step-number">{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </article>)}
        </div>
      </section>

      <section className="home-audience-grid">
        <article className="card home-audience-card">
          <p className="home-section-kicker">FOR FAMILIES</p>
          <h2>Personalized support starts here</h2>
          <p>Browse tutor qualifications, subjects, grades and published availability. Message a tutor to discuss what your learner needs before booking.</p>
          <Link className="button" href="/tutors">Explore tutors</Link>
        </article>
        <article className="card home-audience-card">
          <p className="home-section-kicker">FOR TUTORS</p>
          <h2>Share your expertise locally</h2>
          <p>Create a profile, set your hourly rate and availability, and manage inquiries and sessions from your dashboard. Approval is required before your profile appears in search.</p>
          <Link className="home-dark-button" href="/register?role=tutor">Create a tutor account</Link>
        </article>
      </section>

      <section className="card home-trust">
        <div>
          <p className="home-section-kicker">BOOKING WITH CONFIDENCE</p>
          <h2>Know what to expect</h2>
          <p>Tutor profiles are reviewed before publication. Secure payments are processed through Stripe, and your bookings appear in your account.</p>
          <p className="muted">Profile approval does not guarantee credentials, suitability or a completed background check. Families should make their own assessment before booking.</p>
        </div>
        <Link href="/how-it-works">Learn about payments and safety</Link>
      </section>
    </main>
  );
}
