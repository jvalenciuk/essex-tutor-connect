export function accountEmailConfig() {
  const production = process.env.VERCEL_ENV === 'production' ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');
  if (production && process.env.PRODUCTION_ACCOUNT_EMAIL_ENABLED !== 'true') return null;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const testTo = production ? undefined : process.env.EMAIL_TEST_TO;
  const base = process.env.VERCEL_ENV === 'preview'
    ? 'https://we-learn-stripe-preview.vercel.app'
    : process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (!apiKey || !from || !base || (!production && !testTo) || !process.env.NEXTAUTH_SECRET) return null;

  try {
    const url = new URL(base);
    if (url.username || url.password || (production ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol))) return null;
    return { apiKey, from, testTo, origin: url.origin };
  } catch {
    return null;
  }
}

export async function sendAccountEmail(
  config: NonNullable<ReturnType<typeof accountEmailConfig>>,
  to: string,
  subject: string,
  text: string,
) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.from,
      to: [config.testTo ?? to],
      subject: config.testTo ? subject + ' (Preview test)' : subject,
      text: config.testTo ? 'Intended recipient: ' + to + '\nPreview testing only.\n\n' + text : text,
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Account email delivery failed: ' + response.status);
}
