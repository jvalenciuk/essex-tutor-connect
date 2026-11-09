
export default function HowItWorks() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1>How Essex Tutor Connect Works</h1>

      <p>
        Essex Tutor Connect helps parents, guardians,
        adult learners, and tutors connect across
        Windsor and Essex County.
      </p>

      <section className="card">
        <h2>For parents and learners</h2>

        <ol>
          <li>
            <strong>Find a tutor.</strong> Search by
            subject, grade, location, online availability,
            and hourly rate.
          </li>
          <li>
            <strong>Send an inquiry.</strong> Describe
            learning goals and preferred times.
            Sending an inquiry does not require payment.
          </li>
          <li>
            <strong>Review a proposal.</strong> A tutor
            can propose a session. You can accept,
            request a different time, or decline.
          </li>
          <li>
            <strong>Pay securely.</strong> After
            accepting a proposal, use Stripe Checkout
            to pay for the session.
          </li>
          <li>
            <strong>Manage your booking.</strong> Check
            your dashboard for payment and session status.
          </li>
        </ol>

        <a href="/tutors">Find a tutor</a>
      </section>

      <section className="card">
        <h2>For tutors</h2>

        <ol>
          <li>
            Create a tutor account and complete your profile.
          </li>
          <li>
            Provide accurate qualifications, subjects,
            grades, locations, and hourly rates.
          </li>
          <li>
            Wait for administrator approval before
            appearing in public search results.
          </li>
          <li>
            Set recurring availability and blocked dates.
          </li>
          <li>
            Complete Stripe onboarding to accept payments.
          </li>
          <li>
            Respond to inquiries and manage session proposals
            through your dashboard.
          </li>
        </ol>

        <p>
          Essex Tutor Connect retains a 15% platform
          commission on paid tutoring sessions.
          Stripe processing fees may also apply.
        </p>

        <a href="/register">Become a tutor</a>
      </section>

      <section className="card">
        <h2>Tutor verification</h2>

        <p>
          Public tutor profiles require administrator
          approval. Approval means a profile has been
          reviewed for listing on the platform.
        </p>

        <p>
          Unless specifically stated and documented,
          administrator approval does not mean that
          academic credentials, professional licences,
          identity, or criminal background checks
          have been independently verified.
        </p>

        <p>
          Parents and learners should discuss a tutor's
          qualifications, experience, teaching approach,
          and suitability before booking.
        </p>
      </section>

      <section className="card">
        <h2>Payments and cancellations</h2>

        <p>
          Payments are processed through Stripe.
          A proposed session is not a confirmed,
          paid booking until payment has been
          successfully recorded.
        </p>

        <p>
          The current booking system allows parents
          to cancel eligible sessions at least
          24 hours before the scheduled start.
          Tutors can cancel eligible future sessions.
        </p>

        <p>
          When an eligible paid session is cancelled,
          the platform attempts a full refund through
          Stripe. Refund processing and the time needed
          for funds to appear depend on Stripe and
          the payment provider.
        </p>

        <p>
          Some bookings, including those already
          in progress or awaiting payment processing,
          may require additional assistance.
          Check the dashboard for your booking status.
        </p>
      </section>

      <section className="card">
        <h2>Privacy and safety</h2>

        <p>
          Parents and guardians should manage accounts
          and bookings for children. Do not include a
          child's personal contact information, home
          address, medical details, or other unnecessary
          sensitive information in inquiries or messages.
        </p>

        <p>
          For in-person tutoring, agree on an appropriate
          location and supervision arrangements before
          the session. Parents and tutors should
          communicate expectations clearly.
        </p>

        <p>
          Never share passwords or payment card details
          through tutoring messages. Use the platform's
          secure checkout process for payments.
        </p>
      </section>

      <div style={{ margin: '24px 0' }}>
        <a className="button" href="/tutors">
          Find a tutor
        </a>
        {' '}
        <a className="button" href="/dashboard">
          My dashboard
        </a>
      </div>
    </main>
  );
}
