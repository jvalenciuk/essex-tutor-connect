                      String(
                        booking.requestedDurationMinutes ||
                        booking.durationMinutes
                      )
                    );
                    setError('');
                  }}
                >
                  Propose revised session
                </button>
              )}
            </div>
          )}

          {booking.status === 'PENDING_PAYMENT' && (
            <div>
              <p>Both parties have agreed to this session.</p>
              {role === 'PARENT' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startCheckout(booking.id)}
                >
                  {busy ? 'Opening secure checkout...' : `Pay ${formatMoney(booking.amountCents)} for session`}
                </button>
              ) : (
                <p>Waiting for the parent to pay securely through Stripe.</p>
              )}
            </div>
          )}

          {booking.status === 'PAID' && (
            <p>Payment received. Your session is confirmed.</p>
          )}

          {changingId === booking.id && (
            <div style={{ marginTop: 16 }}>
              <h4>
                {role === 'TUTOR'
                  ? 'Revise session proposal'
                  : 'Request a different time'}
              </h4>

              {dateFields()}

              {role === 'PARENT' && (
                <label>
                  <strong>Note for tutor (optional)</strong>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: 10,
                      margin: '8px 0',
                    }}
                  />
                </label>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => submitChange(booking.id)}
              >
                {busy ? 'Saving...' : 'Submit new time'}
              </button>{' '}

              <button
                type="button"
                disabled={busy}
                onClick={resetForm}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}

      {canPropose && (
        <div style={{ marginTop: 16 }}>
          <h4>Propose a tutoring session</h4>

          {dateFields()}

          <button
            type="button"
            disabled={busy}
            onClick={submitProposal}
          >
            {busy ? 'Submitting...' : 'Propose session'}
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={busy || loading}
        onClick={() => void loadBookings()}
        style={{ marginTop: 12 }}
      >
        Refresh bookings
      </button>

      {notice && (
        <p role="status" style={{ color: '#166534' }}>
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}
    </section>
  );
}
