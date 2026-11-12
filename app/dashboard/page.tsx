
          <section className="card" style={{ marginTop: 24 }}>
            <h2>Payments Awaiting Action</h2>

            {awaitingPayment.length === 0 ? (
              <p>No payments are currently awaiting action.</p>
            ) : (
              <>
                <p className="muted">
                  Your tutor has accepted these bookings.
                  Complete payment through the booking
                  manager below to confirm your session.
                </p>

                {awaitingPayment.map(booking => (
                  <div
                    key={booking.id}
                    style={{
                      padding: '14px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <p>
                      <strong>
                        {booking.inquiry?.subject || 'Tutoring'}
                      </strong>{' '}
                      with {booking.tutor.user.name}
                    </p>
                    <p>
                      {sessionDate(booking.startsAt)} —{' '}
                      {money(booking.amountCents)}
                    </p>
                    <p className="muted">
                      Open the corresponding accepted
                      inquiry under Bookings &amp; Messages
                      to pay securely.
                    </p>
                  </div>
                ))}
              </>
            )}
          </section>
        </>
      )}

      {(isTutor || isParent) && (
        <section style={{ marginTop: 28 }}>
          <h2>Bookings &amp; Messages</h2>
          <p className="muted">
            Manage tutoring inquiries, conversations,
            session proposals, and booking updates.
          </p>

          {inquiries.length === 0 && (
            <div className="card">
              <p>No inquiries yet.</p>
            </div>
          )}

          {inquiries.map(inquiry => (
            <div className="card" key={inquiry.id}>
              <h3>
                {inquiry.subject} — {inquiry.grade}
              </h3>
              <p>{inquiry.message}</p>

              {isTutor ? (
                <>
                  <p>
                    <strong>From:</strong>{' '}
                    {inquiry.parent.name}
                  </p>
                  <InquiryActions
                    inquiryId={inquiry.id}
                    status={inquiry.status}
                  />
                </>
              ) : (
                <>
                  <p>
                    <strong>Tutor:</strong>{' '}
                    {inquiry.tutor.user.name}
                  </p>
                  <p className="muted">
                    Status: {inquiry.status}
                  </p>
                </>
              )}

              {inquiry.status === 'ACCEPTED' && (
                <>
                  <InquiryMessages inquiryId={inquiry.id} />
                  <BookingManager
                    inquiryId={inquiry.id}
                    role={who.role}
                  />
                </>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
