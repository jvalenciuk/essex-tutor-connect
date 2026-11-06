
import React from 'react';
import './style.css';
import Providers from './providers';
import AuthNavigation from './auth-navigation';

export const metadata = {
  title: 'Essex Tutor Connect',
  description: 'Find local tutors in Windsor and Essex County',
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
              ✦ Essex Tutor Connect
            </a>

            <nav>
              <AuthNavigation />
            </nav>
          </header>

          {children}

          <footer>
            Essex Tutor Connect · Windsor & Essex County · Canada
          </footer>
        </Providers>
      </body>
    </html>
  );
}
