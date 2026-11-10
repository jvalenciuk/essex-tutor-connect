    items: Booking[];
    empty: string;
  }) {
    return (
      <section style={{ marginTop: 32 }}>
        <h2>{title} ({items.length})</h2>

        {items.length === 0 ? (
          <p className="muted">{empty}</p>
        ) : (
          items.map(booking => (
            <BookingCard key={booking.id} booking={booking} />
          ))
        )}
      </section>
    );
  }

  if (sessionStatus === 'loading') {
    return <main><p>Checking your session...</p></main>;
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <main>
        <h1>My Bookings</h1>
        <p>Please sign in to view your bookings.</p>
        <Link href="/login">Sign In</Link>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '36px 20px',
      }}
    >
      <Link href="/dashboard">Back to Dashboard</Link>

      <h1>My Bookings</h1>

      <p className="muted">
        Manage tutoring sessions, payments, scheduling
        requests, and booking history in one place.
      </p>

      <div
        className="cards"
        style={{
          gridTemplateColumns:
            'repeat(auto-fit, minmax(190px, 1fr))',
        }}
      >
        {[
          ['Action Required', actionItems.length],
          ['Upcoming Sessions', upcoming.length],
          ['Booking History', history.length],
        ].map(([label, count]) => (
          <div className="card" key={String(label)}>
            <p className="muted">{label}</p>
            <h2>{count}</h2>
          </div>
        ))}
      </div>

      <button
        disabled={loading || busyId !== null}
        onClick={() => void load()}
      >
        {loading ? 'Loading...' : 'Refresh Bookings'}
      </button>

      {!role && (
        <p className="muted">
          Your account role is unavailable in this session.
          Booking actions are hidden until it is available.
        </p>
      )}

      {notice && (
        <p role="status" style={{ color: '#15803d' }}>
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}

      {!loading && (
        <>
          <Section
            title="Action Required"
            items={actionItems}
            empty="No bookings need attention."
          />

          <Section
            title="Upcoming Sessions"
            items={upcoming}
            empty="No upcoming confirmed sessions."
          />

          <Section
            title="Booking History"
            items={history}
            empty="No previous bookings yet."
          />
        </>
      )}
    </main>
  );
}
