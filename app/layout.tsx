
import React from 'react';
import Image from 'next/image';
import './style.css';
import Providers from './providers';
import AuthNavigation from './auth-navigation';

export const metadata = {
  title: { default: 'WE Learn | Windsor–Essex Tutoring', template: '%s | WE Learn' },
  description: 'WE Learn connects families with local tutors across Windsor and Essex County. Find, book and learn with confidence.',
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header>
            <a href="/" className="brand">
              <Image src="/we-learn-logo.webp" alt="WE Learn" width={74} height={74} className="brand-logo" priority />
              <span>WE Learn</span>
            </a>

            <nav>
              <AuthNavigation />
            </nav>
          </header>

          {children}

          <footer>
            WE Learn · Windsor & Essex County
          </footer>
        </Providers>
      </body>
    </html>
  );
}
