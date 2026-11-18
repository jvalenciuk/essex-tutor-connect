
import React from 'react';
import './style.css';
import Providers from './providers';
import AuthNavigation from './auth-navigation';

export const metadata = {
  title: 'WE Learn',
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
              ✦ WE Learn
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
