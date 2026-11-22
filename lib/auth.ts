import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createHash } from 'node:crypto';
import { db } from './db';
import bcrypt from 'bcryptjs';

function fingerprint(hash: string) {
  return createHash('sha256').update(hash).digest('hex');
}

const accountSelect = {
  role: true,
  passwordHash: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

function canSignIn(account: { emailVerifiedAt: Date | null; createdAt: Date }) {
  if (account.emailVerifiedAt) return true;

  const value = process.env.LEGACY_EMAIL_VERIFICATION_CUTOFF_UTC;
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const cutoff = new Date(value);
  return Number.isFinite(cutoff.getTime()) &&
    cutoff.toISOString() === value.replace('Z', '.000Z') &&
    cutoff.getTime() <= Date.now() && account.createdAt < cutoff;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [CredentialsProvider({
    name: 'Email and password',
    credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) return null;
      const user = await db.user.findUnique({ where: { email: credentials.email.trim().toLowerCase() } });
      if (!user || !canSignIn(user) || !(await bcrypt.compare(credentials.password, user.passwordHash))) return null;
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        const current = await db.user.findUnique({ where: { id: user.id }, select: accountSelect });
        if (!current || !canSignIn(current)) { delete token.uid; delete token.role; delete token.passwordVersion; return token; }
        token.role = current.role;
        token.passwordVersion = fingerprint(current.passwordHash);
        return token;
      }
      // Recheck account existence and password version on each session access.
      // Existing JWTs created before this change will require a fresh sign-in.
      if (typeof token.uid !== 'string' || typeof token.passwordVersion !== 'string') {
        delete token.uid; delete token.role; delete token.passwordVersion;
        return token;
      }
      const current = await db.user.findUnique({ where: { id: token.uid }, select: accountSelect });
      if (!current || !canSignIn(current) || fingerprint(current.passwordHash) !== token.passwordVersion) {
        delete token.uid; delete token.role; delete token.passwordVersion;
        return token;
      }
      token.role = current.role;
      return token;
    },
    async session({ session, token }) {
      (session as typeof session & { uid?: string; role?: string }).uid = typeof token.uid === 'string' ? token.uid : undefined;
      (session as typeof session & { uid?: string; role?: string }).role = typeof token.uid === 'string' && typeof token.role === 'string' ? token.role : undefined;
      return session;
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
