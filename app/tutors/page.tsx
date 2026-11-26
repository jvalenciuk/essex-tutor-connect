
import { getPublishedTutors, tutorFilterOptions } from '../../lib/public-tutors';
import '../tutor-discovery.css';
import InquiryForm from './inquiry-form';
import TutorAvailability from './tutor-availability';

export const dynamic = 'force-dynamic';

type Filters = {
  keyword?: string;
  subject?: string;
  language?: string;
  grade?: string;
  city?: string;
  online?: string;
  maxRate?: string;
  sort?: string;
  profile?: string;
};

function Tags({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="muted">Not specified</p>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(item => (
        <span className="tag" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

export default async function Tutors({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const q = await searchParams;

  const publishedTutors = await getPublishedTutors();

  const subjects = tutorFilterOptions(
    publishedTutors.map(tutor => tutor.subjects)
  );

  const languages = tutorFilterOptions(
    publishedTutors.map(tutor => tutor.languages)
  );

  const grades = tutorFilterOptions(
    publishedTutors.map(tutor => tutor.grades)
  );

  const cities = tutorFilterOptions(
    publishedTutors.map(tutor => tutor.cities)
  );

  const subject = subjects.includes(q.subject || '')
    ? q.subject || ''
    : '';

  const language = languages.includes(q.language || '')
    ? q.language || ''
    : '';

  const keyword = typeof q.keyword === 'string' ? q.keyword.trim().slice(0, 100) : '';
  const normalizedKeyword = keyword.toLocaleLowerCase('en-CA');

  const grade = grades.includes(q.grade || '')
    ? q.grade || ''
    : '';

  const city = cities.includes(q.city || '')
    ? q.city || ''
    : '';

  const maxRate = Number(q.maxRate);

  const hasValidMaxRate =
    Boolean(q.maxRate) &&
    Number.isFinite(maxRate) &&
    maxRate > 0;

  const sort = ['price-asc', 'price-desc', 'name'].includes(q.sort || '') ? q.sort : 'price-asc';

  const tutors = publishedTutors
    .filter(tutor => {
      if (normalizedKeyword && ![
        tutor.user.name,
        tutor.bio,
        tutor.qualifications,
        ...tutor.subjects,
        ...tutor.grades,
        ...tutor.cities,
        ...tutor.languages,
      ].some(value => value.toLocaleLowerCase('en-CA').includes(normalizedKeyword))) {
        return false;
      }

      if (language && !tutor.languages.includes(language)) {
        return false;
      }

      if (subject && !tutor.subjects.includes(subject)) {
        return false;
      }

      if (grade && !tutor.grades.includes(grade)) {
        return false;
      }

      if (city && !tutor.cities.includes(city)) {
        return false;
      }

      if (q.online === 'yes' && !tutor.online) {
        return false;
      }

      if (
        hasValidMaxRate &&
        tutor.hourlyRateCents > Math.round(maxRate * 100)
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => sort === 'price-desc'
      ? b.hourlyRateCents - a.hourlyRateCents
      : sort === 'name'
        ? a.user.name.localeCompare(b.user.name, 'en-CA')
        : a.hourlyRateCents - b.hourlyRateCents)
    .slice(0, 100);

  return (
    <main className="discovery-directory">
      <h1>Find your tutor</h1>

      <p className="muted">
        Explore approved tutors in Windsor and Essex County.
        Compare qualifications, subjects, rates, and availability.
      </p>

      <form
        method="GET"
        className="card discovery-filters"
      >
        <h2 style={{ marginTop: 0 }}>Find the right match</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
            gap: 14,
          }}
        >
          <label>
            Search by name, topic or experience
            <input
              className="field"
              type="search"
              name="keyword"
              maxLength={100}
              defaultValue={keyword}
              placeholder="e.g. reading or French immersion"
            />
          </label>

          <label>
            Subject
            <select
              className="field"
              name="subject"
              defaultValue={subject}
            >
              <option value="">All subjects</option>
              {subjects.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            Language
            <select className="field" name="language" defaultValue={language}>
              <option value="">All languages</option>
              {languages.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label>
            Grade
            <select
              className="field"
              name="grade"
              defaultValue={grade}
            >
              <option value="">All grades</option>
              {grades.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            City
            <select
              className="field"
              name="city"
              defaultValue={city}
            >
              <option value="">All cities</option>
              {cities.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            Maximum hourly rate (CAD)
            <input
              className="field"
              name="maxRate"
              type="number"
              min="1"
              step="1"
              defaultValue={q.maxRate || ''}
              placeholder="e.g. 50"
            />
          </label>

          <label>
            Sort results
            <select className="field" name="sort" defaultValue={sort}>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Tutor name: A to Z</option>
            </select>
          </label>

          <label>
            Online tutoring
            <select
              className="field"
              name="online"
              defaultValue={q.online === 'yes' ? 'yes' : ''}
            >
              <option value="">All tutors</option>
              <option value="yes">
                Online available
              </option>
            </select>
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 16,
            alignItems: 'center',
          }}
        >
          <button type="submit">
            Search tutors
          </button>

          <a
            href="/tutors"
            style={{
              padding: '10px 16px',
              border: '1px solid #ccc',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            Clear filters
          </a>
        </div>
      </form>

      <p className="muted" role="status">
        <strong>{tutors.length}</strong>{' '}
        matching tutor{tutors.length === 1 ? '' : 's'}
        {tutors.length === 100
          ? ' shown (maximum 100)'
          : ''}
      </p>

      <div className="discovery-card-grid">
        {tutors.map(tutor => (
          <article className="discovery-card tutor-result-card" key={tutor.id} id={`tutor-${tutor.id}`}>
            <div className="discovery-card-top">
              <div>
                <h2>{tutor.user.name}</h2>
                <p className="muted">{tutor.cities.join(', ')}</p>
              </div>
              <p><strong>${(tutor.hourlyRateCents / 100).toFixed(2)}</strong> <small>CAD/hr</small></p>
            </div>
            <p className="discovery-format">{tutor.online ? 'Online available' : 'Ask about session location'}</p>
            <div className="discovery-facts">
              <div><strong>Subjects</strong><Tags items={tutor.subjects} /></div>
              <div><strong>Grades</strong><Tags items={tutor.grades} /></div>
              <div><strong>Languages</strong><Tags items={tutor.languages} /></div>
            </div>
            <details className="discovery-details" open={q.profile === tutor.id ? true : undefined}>
              <summary>View profile <span className="sr-only">for {tutor.user.name}</span></summary>
              <div className="discovery-profile-detail">
                <p>{tutor.bio}</p>
                <h3>Qualifications and experience</h3>
                <p>{tutor.qualifications}</p>
                <TutorAvailability tutorId={tutor.id} />
                <p className="muted">Send an inquiry to discuss tutoring and scheduling. No payment required.</p>
                <InquiryForm tutorId={tutor.id} name={tutor.user.name} />
              </div>
            </details>
          </article>
        ))}

        {tutors.length === 0 && (
          <div className="card">
            <h2>No matching tutors</h2>

            <p>
              Try a broader search, remove a filter or increase
              your maximum hourly rate. Only approved tutors with
              complete public profiles appear here.
            </p>

            <a href="/tutors">
              View all tutors
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
