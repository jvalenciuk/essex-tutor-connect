
export default function Home() {
  const steps = [
    {
      number: '01',
      title: 'Find the right tutor',
      description:
        'Compare approved tutor profiles by subject, grade, location, price, and availability.',
    },
    {
      number: '02',
      title: 'Start a conversation',
      description:
        'Send an inquiry about learning goals and preferred times. No payment is needed to inquire.',
    },
    {
      number: '03',
      title: 'Agree on a session',
      description:
        'Review a tutoring proposal, accept it, or request a different time.',
    },
    {
      number: '04',
      title: 'Pay and learn',
      description:
        'Complete secure checkout to confirm your session. Manage bookings from your dashboard.',
    },
  ];

  return (
    <main>
      <section className="hero">
        <div>
          WINDSOR · LASALLE · TECUMSEH · ESSEX COUNTY
        </div>

        <h1>Local tutors. Stronger futures.</h1>

        <p>
          Connect with local educators for personalized
          tutoring in math, French, English, science,
          and more — in person or online.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 20,
          }}
        >
          <a className="button" href="/tutors">
            Find a tutor
          </a>

          <a className="button" href="/register">
            Become a tutor
          </a>
        </div>
      </section>

      <section style={{ margin: '36px 0' }}>
        <h2>How Essex Tutor Connect works</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: 16,
          }}
        >
          {steps.map(step => (
            <article className="card" key={step.number}>
              <p
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#087f8c',
                }}
              >
                {step.number}
              </p>

              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cards">
        <div className="card">
          <h2>For parents and learners</h2>

          <p>
            Search tutor profiles, compare hourly
            rates, view published availability, and
            contact tutors directly through your account.
          </p>

          <p>
            You decide whether to accept a proposed
            session before making a payment.
          </p>

          <a href="/tutors">
            Explore tutors
          </a>
        </div>

        <div className="card">
          <h2>For tutors</h2>

          <p>
            Create a professional profile, list your
            qualifications and subjects, and set
            your weekly availability.
          </p>

          <p>
            Manage inquiries, propose sessions,
            and connect Stripe to receive payments.
          </p>

          <a href="/register">
            Create a tutor account
          </a>
        </div>
      </section>

      <section
        className="card"
        style={{ margin: '28px 0' }}
      >
        <h2>Booking with confidence</h2>

        <p>
          Tutor profiles are reviewed by an
          administrator before appearing in search
          results. Payments are processed through
          Stripe, and confirmed sessions appear
          in your account dashboard.
        </p>

        <p>
          Administrator approval is not a guarantee
          of teaching credentials, suitability, or
          a completed background check.
          Parents should ask questions and make
          their own assessment before booking.
        </p>

        <a href="/how-it-works">
          Read about booking, payments, and safety
        </a>
      </section>
    </main>
  );
}
