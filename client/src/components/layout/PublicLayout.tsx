// src/components/layouts/PublicLayout.tsx
import { ReactNode } from 'react';
// import { Header } from './Header';
// import NewFooter from './NewFooter';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { WhatsAppSupport } from '../WhatsAppSupport';
// import { TopBanner } from './marketing';

interface PublicLayoutProps {
  readonly children: ReactNode;
}

export function PublicLayout({ children }: Readonly<PublicLayoutProps>) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* <TopBanner
        message="Get your eSIM in just 2 minutes on your mobile"
        ctaText="Order Here"
        ctaLink="/destinations"
      /> */}
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppSupport />
    </div>
  );
}

// src/components/layouts/EmptyLayout.tsx

interface EmptyLayoutProps {
  readonly children: ReactNode;
}

export function EmptyLayout({ children }: EmptyLayoutProps) {
  return <>{children}</>;
}
