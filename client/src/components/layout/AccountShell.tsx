import { lazy, Suspense } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { AccountLayout } from '@/components/layout/AccountLayout';

const Profile = lazy(() => import('@/pages/Profile'));
const MyESIMs = lazy(() => import('@/pages/MyESIMs'));
const MyOrders = lazy(() => import('@/pages/MyOrders'));
const Referrals = lazy(() => import('@/pages/Referrals'));
const AccountSupport = lazy(() => import('@/pages/AccountSupport'));
const KYCSubmission = lazy(() => import('@/pages/KYCSubmission'));
const AccountGiftCards = lazy(() => import('@/pages/AccountGiftCards'));

export function AccountShell() {
  const [location] = useLocation();

  // Handle the base /account route or unknown sub-paths
  if (location === '/account' || location === '/account/') {
    return <Redirect to="/account/profile" />;
  }

  return (
    <AccountLayout>
      <Suspense fallback={<div className="p-6 text-slate-500">Loading...</div>}>
        <Switch>
          <Route path="/account/profile" component={Profile} />
          <Route path="/account/esims" component={MyESIMs} />
          <Route path="/account/orders" component={MyOrders} />
          <Route path="/account/referrals" component={Referrals} />
          <Route path="/account/support" component={AccountSupport} />
          <Route path="/account/kyc" component={KYCSubmission} />
          <Route path="/account/gift-cards" component={AccountGiftCards} />
          
          {/* Fallback for unmatched /account/* routes */}
          <Route>
            <Redirect to="/account/profile" />
          </Route>
        </Switch>
      </Suspense>
    </AccountLayout>
  );
}
