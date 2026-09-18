import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { WhatsAppSupport } from '../WhatsAppSupport';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppSupport />
    </div>
  );
}
