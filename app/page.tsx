import Image from 'next/image';
import Link from 'next/link';
import { accountEmailConfig } from '../lib/account-email';
import { getPublishedTutors, tutorFilterOptions } from '../lib/public-tutors';
import './tutor-discovery.css';

export const dynamic = 'force-dynamic';

const steps = [
  { title: 'Find a tutor', description: 'Compare subjects, grades, hourly rates and availability.' },
  { title: 'Ask a question', description: 'Message a tutor about your learning goals. It’s free to inquire.' },
  { title: 'Agree on a time', description: 'Review the proposed time before you commit to a session.' },
];

export default async function Home() {
  const tutors = await getPublishedTutors();
  const subjects = tutorFilterOptions(tutors.map(tutor => tutor.subjects));
  const grades = tutorFilterOptions(tutors.map(tutor => tutor.grades));
  const canRegister = Boolean(accountEmailConfig());

  const shortcuts = [
    { label: 'Grade 7 math', match: tutors.flatMap(tutor => tutor.subjects.flatMap(subject =>
      /math/i.test(subject) ? tutor.grades.filter(grade => /^(grade\s*)?7$/i.test(grade.trim())).map(grade => ({ subject, grade })) : []))[0] },
    { label: 'French immersion', match: subjects.find(subject => /french immersion/i.test(subject)) },
    { label: 'High school science', match: tutors.flatMap(tutor => tutor.subjects.flatMap(subject =>
      /science/i.test(subject) ? tutor.grades.filter(grade => /^(grade\s*)?(9|10|11|12)$/i.test(grade.trim())).map(grade => ({ subject, grade })) : []))[0] },
  ];

  return (
    <main className="discovery-home">
      <section className="discovery-hero" aria-labelledby="discovery-title">
        <div className="discovery-hero-copy">
          <p className="discovery-location">Tutoring in Windsor &amp; Essex County</p>
          <h1 id="discovery-title">Local tutors.<br />Stronger futures.</h1>
          <p className="discovery-lead">Find a tutor who teaches your child’s subject and grade, online or close to home.</p>
          <form className="discovery-search" action="/tutors" method="get" aria-label="Find a tutor">
            <label>Subject<select className="field" name="subject">
              <option value="">Any subject</option>
              {subjects.map(subject => <option key={subject}>{subject}</option>)}
            </select></label>
            <label>Grade<select className="field" name="grade">
              <option value="">Any grade</option>
              {grades.map(grade => <option key={grade} value={grade}>{/^\d+$/.test(grade) ? `Grade ${grade}` : grade}</option>)}
            </select></label>
            <button type="submit">Find tutors</button>
          </form>
          <p className="discovery-returning">Already have a tutor? <Link href="/dashboard">Book again</Link> <Link href="/dashboard/bookings">My Sessions</Link></p>
        </div>
        <div className="discovery-photo">
          <Image src="/we-learn-tutoring.webp" alt="A tutor and a student working through a problem together" fill sizes="(max-width: 800px) 100vw, 45vw" priority />
        </div>
      </section>

      {tutors.length > 0 && (
        <section className="discovery-section" aria-labelledby="discover-tutors">
          <div className="discovery-heading">
            <h2 id="discover-tutors">Meet local tutors</h2>
            <Link href="/tutors">View all tutors <span aria-hidden="true">→</span></Link>
          </div>
          <div className="discovery-shortcuts" aria-label="Quick tutor searches">
            {shortcuts.map(({ label, match }) => match && (
              <Link key={label} href={{ pathname: '/tutors', query: typeof match === 'string' ? { subject: match } : match }}>{label}</Link>
            ))}
            {tutors.some(tutor => tutor.online) && <Link href="/tutors?online=yes">Online tutoring</Link>}
            {subjects.slice(0, 4).map(subject => <Link key={subject} href={{ pathname: '/tutors', query: { subject } }}>{subject}</Link>)}
          </div>
          <div className="discovery-card-grid">
            {tutors.slice(0, 3).map(tutor => (
              <article className="discovery-card" key={tutor.id}>
                <div className="discovery-card-top">
                  <h3>{tutor.user.name}</h3>
                  <p><strong>${(tutor.hourlyRateCents / 100).toFixed(2)}</strong> <small>CAD/hr</small></p>
                </div>
                <p>{tutor.subjects.slice(0, 4).join(' · ')}</p>
                <p className="muted">{tutor.cities.slice(0, 3).join(', ')}{tutor.online ? ' · Online available' : ''}</p>
                <Link className="discovery-profile-link" href={{ pathname: '/tutors', query: { profile: tutor.id }, hash: `tutor-${tutor.id}` }}>View profile<span className="sr-only"> for {tutor.user.name}</span> <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="discovery-section" id="how-it-works" aria-labelledby="discovery-steps">
        <div className="discovery-heading">
          <h2 id="discovery-steps">How it works</h2>
          <Link href="/how-it-works">Booking and payment details</Link>
        </div>
        <ol className="discovery-steps">
          {steps.map(step => <li key={step.title}><h3>{step.title}</h3><p>{step.description}</p></li>)}
        </ol>
      </section>

      <section className="discovery-section discovery-bottom" aria-label="Tutoring and safety">
        <div>
          <h2>Teach with WE Learn</h2>
          {canRegister ? <Link href="/register?role=tutor">Create a tutor account</Link> : <p>Tutor registration is temporarily paused. <Link href="/login">Existing tutors can sign in.</Link></p>}
        </div>
        <div>
          <h2>Booking with confidence</h2>
          <p>Tutor profiles are reviewed before publication. Ask about experience and credentials to find the right fit for your family.</p>
          <Link href="/how-it-works">Learn about payments and safety</Link>
        </div>
      </section>
    </main>
  );
}
