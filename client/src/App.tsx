import { lazy, Suspense, useEffect } from 'react';
import { Switch, Route, Redirect } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminLayout } from './components/admin/AdminLayout';
const EnterpriseLayout = lazy(() => import('./pages/enterprise/EnterpriseLayout'));
import { AccountLayout } from './components/layout/AccountLayout';
import { HelmetProvider } from 'react-helmet-async';
import { UserProvider } from './hooks/use-user';
import { TranslationProvider } from './contexts/TranslationContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { ComparisonProvider } from './contexts/ComparisonContext';
import { AdminProvider } from './hooks/use-admin';
import { AuthDialogProvider } from './contexts/AuthDialogContext';
import { AuthDialog } from './components/AuthDialog';
import { ThemeProvider } from './contexts/ThemeContext';
import { GlobalFloatingNav } from './components/GlobalFloatingNav';
const AdminShell = lazy(() => import('./components/admin/AdminShell'));
import { LayoutWrapper } from './components/layout/LayoutWrapper';
import { Helmet } from 'react-helmet-async';

// ✅ Lazy imports
const Home = lazy(() => import('@/pages/Home'));
const Compare = lazy(() => import('@/pages/Compare'));
const Login = lazy(() => import('@/pages/Login'));
const Destinations = lazy(() => import('@/pages/Destinations'));
const Search = lazy(() => import('@/pages/Search'));
const DestinationDetails = lazy(() => import('@/pages/DestinationDetails'));
const RegionDetails = lazy(() => import('@/pages/RegionDetails'));
const GlobalDetails = lazy(() => import('@/pages/GlobalDetails'));
const PackageDetails = lazy(() => import('@/pages/PackageDetails'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const MyOrders = lazy(() => import('@/pages/MyOrders'));
const MyESIMs = lazy(() => import('@/pages/MyESIMs'));
const Support = lazy(() => import('@/pages/Support'));
const AccountSupport = lazy(() => import('@/pages/AccountSupport'));
const CompatibleDevices = lazy(() => import('@/pages/CompatibleDevices'));
const Profile = lazy(() => import('@/pages/Profile'));
const KYCSubmission = lazy(() => import('@/pages/KYCSubmission'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Referrals = lazy(() => import('@/pages/Referrals'));
const CustomerManagement = lazy(() => import('@/pages/admin/CustomerManagement'));
const KYCManagement = lazy(() => import('@/pages/admin/KYCManagement'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const OrderManagement = lazy(() => import('@/pages/admin/OrderManagement'));
const AdminOrderEsim = lazy(() => import('@/pages/admin/AdminOrderEsim'));
const CustomEsimOrders = lazy(() => import('@/pages/admin/CustomEsimOrders'));
const PackageManagement = lazy(() => import('@/pages/admin/PackageManagement'));
const TicketManagement = lazy(() => import('@/pages/admin/TicketManagement'));
const Settings = lazy(() => import('@/pages/admin/Settings'));
const Providers = lazy(() => import('@/pages/admin/Providers'));
const UnifiedPackages = lazy(() => import('@/pages/admin/Packages'));
const MasterTopups = lazy(() => import('@/pages/admin/MasterTopups'));
const MasterRegions = lazy(() => import('@/pages/admin/MasterRegions'));
const MasterCountries = lazy(() => import('@/pages/admin/MasterCountries'));
const Analytics = lazy(() => import('@/pages/admin/Analytics'));
const ApiDocs = lazy(() => import('@/pages/admin/ApiDocs'));
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin'));
const AdminTopupsPage = lazy(() => import('@/pages/admin/Topups'));
const NotificationHistory = lazy(() => import('@/pages/admin/NotificationHistory'));
const EmailTemplates = lazy(() => import('@/pages/admin/EmailTemplates'));
const AdminReviews = lazy(() => import('@/pages/admin/AdminReviews'));
const AdminReferrals = lazy(() => import('@/pages/admin/AdminReferrals'));
const AdminBlog = lazy(() => import('@/pages/admin/AdminBlog'));
const EnterprisePage = lazy(() => import('@/pages/EnterprisePage'));
const EnterpriseLogin = lazy(() => import('@/pages/enterprise/EnterpriseLogin'));
const EnterpriseDashboard = lazy(() => import('@/pages/enterprise/EnterpriseDashboard'));
const EnterpriseQuotes = lazy(() => import('@/pages/enterprise/EnterpriseQuotes'));
const EnterpriseOrders = lazy(() => import('@/pages/enterprise/EnterpriseOrders'));
const EnterpriseESIMs = lazy(() => import('@/pages/enterprise/EnterpriseESIMs'));
const GiftCards = lazy(() => import('@/pages/GiftCards'));
const GiftCardPayment = lazy(() => import('@/pages/GiftCardPayment'));
const AdminEnterprise = lazy(() => import('@/pages/admin/AdminEnterprise'));
const AdminGiftCards = lazy(() => import('@/pages/admin/AdminGiftCards'));
const AdminAdvancedAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics'));
const AdminEmailMarketing = lazy(() => import('@/pages/admin/AdminEmailMarketing'));
const Unsubscribe = lazy(() => import('@/pages/Unsubscribe'));
const AboutUs = lazy(() => import('@/pages/AboutUs'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));
const RefundPolicy = lazy(() => import('@/pages/RefundPolicy'));
const Contact = lazy(() => import('@/pages/Contact'));
const FAQPage = lazy(() => import('@/pages/FAQ'));
const Blog = lazy(() => import('@/pages/Blog'));
const BlogPost = lazy(() => import('@/pages/BlogPost'));
const NotFound = lazy(() => import('@/pages/not-found'));
const AdminVouchers = lazy(() => import('@/pages/admin/AdminVouchers'));
const GuestCheckout = lazy(() => import('@/pages/GuestCheckout'));
const OrderConfirmation = lazy(() => import('@/pages/OrderConfirmation'));
const FailoverSettings = lazy(() => import('@/pages/admin/FailoverSettings'));
const AdminCurrencies = lazy(() => import('@/pages/admin/Currencies'));
const AdminLanguages = lazy(() => import('@/pages/admin/AdminLanguages'));
const AdminTranslations = lazy(() => import('@/pages/admin/AdminTranslations'));
const PaymentProcessing = lazy(() => import('@/pages/PaymentProcessing'));
const BannerManagement = lazy(() => import('@/pages/admin/BannerManagement'));
const PagesManagement = lazy(() => import('@/pages/admin/PagesManagement'));
const DynamicPage = lazy(() => import('@/pages/DynamicPage'));
const FaqPage = lazy(() => import('@/pages/FaqPage'));
const FaqManagement = lazy(() => import('@/pages/admin/FaqManagement'));
const AdminPriceBrackets = lazy(() => import('@/pages/admin/AdminPriceBrackets'));
const AccountShell = lazy(() => import('./components/layout/AccountShell').then(m => ({ default: m.AccountShell })));
import SiteHeader from './components/layout/SiteHeader';
import SiteFooter from './components/layout/SiteFooter';
const UnifiedCheckout = lazy(() => import('./pages/UnifiedCheckout'));
const PaymentPage = lazy(() => import('./pages/payment/PaymentPage'));
import { Provider } from 'react-redux';
import { persistor, store, useAppDispatch } from './redux/store/store';
import { PersistGate } from 'redux-persist/integration/react';
const WhatIsESIM = lazy(() => import('./pages/WhatIsESIM'));
import { ScrollToTop } from './components/ScrollToTop';
import { setSettings, SettingsState } from './redux/slice/settingsSlice';
import {
  useSettings,
  useSettingByKey,
  useSettingsLoading,
  useSettingsError,
} from '@/hooks/useSettings'; // path apne project ke hisaab se
const PopularPackagesPage = lazy(() => import('./pages/PopularPackagesPage'));
const DemoPage = lazy(() => import('./pages/DemoPage'));
const MobileTopupPayment = lazy(() => import('./pages/MobileTopupPayment'));

// ✅ Route Configs - DRY Approach
const PUBLIC_ROUTES = [
  { path: '/', component: Home },
  { path: '/destinations', component: Destinations },
  { path: '/search', component: Search },
  { path: '/destination/:slug', component: DestinationDetails },
  { path: '/region/:slug', component: RegionDetails },
  { path: '/global', component: GlobalDetails },
  { path: '/packages/:slug', component: PackageDetails },
  { path: '/checkout/:slug', component: Checkout },
  { path: '/unified-checkout/:packageSlug', component: UnifiedCheckout },
  { path: '/blog', component: Blog },
  { path: '/blog/:slug', component: BlogPost },
  { path: '/enterprise', component: EnterprisePage },
  { path: '/unsubscribe', component: Unsubscribe },
  { path: '/gift-cards', component: GiftCards },
  { path: '/gift-card-payment', component: GiftCardPayment, layout: 'empty' as any },
  { path: '/about-us', component: AboutUs },
  { path: '/privacy-policy', component: PrivacyPolicy },
  { path: '/terms-of-service', component: TermsOfService },
  { path: '/refund-policy', component: RefundPolicy },
  { path: '/contact', component: Contact },
  { path: '/supported-devices', component: CompatibleDevices },
  { path: '/compatible-devices', component: CompatibleDevices },
  { path: '/buy/:packageSlug', component: GuestCheckout },
  { path: '/order/processing', component: PaymentProcessing },
  { path: '/order/:token', component: OrderConfirmation },
  { path: '/pages/:slug', component: DynamicPage },
  { path: '/faq', component: FaqPage },
  { path: '/what-is-esim', component: WhatIsESIM },
  { path: '/notifications', component: Notifications },
  { path: '/populer-packages', component: PopularPackagesPage },
];

const AUTH_ROUTES = [
  { path: '/login', component: Login },
  { path: '/demo', component: DemoPage },
  { path: '/checkout', component: PaymentPage },
];

const ADMIN_ROUTES = [
  { path: '/admin/login', component: AdminLogin, layout: null },
  { path: '/admin/dashboard', component: AdminDashboard },
  { path: '/admin/orders', component: OrderManagement },
  { path: '/admin/orders/purchase', component: AdminOrderEsim },
  { path: '/admin/orders/custom', component: CustomEsimOrders },
  { path: '/admin/customers', component: CustomerManagement },
  { path: '/admin/kyc', component: KYCManagement },
  { path: '/admin/packages', component: PackageManagement },
  { path: '/admin/tickets', component: TicketManagement },
  { path: '/admin/analytics', component: Analytics },
  { path: '/admin/api-docs', component: ApiDocs },
  { path: '/admin/settings', component: Settings },
  { path: '/admin/providers', component: Providers },
  { path: '/admin/unified-packages', component: UnifiedPackages },
  { path: '/admin/master-topups', component: MasterTopups },
  { path: '/admin/master-regions', component: MasterRegions },
  { path: '/admin/master-countries', component: MasterCountries },
  { path: '/admin/topups', component: AdminTopupsPage },
  { path: '/admin/notifications', component: NotificationHistory },
  { path: '/admin/email-templates', component: EmailTemplates },
  { path: '/admin/reviews', component: AdminReviews },
  { path: '/admin/referrals', component: AdminReferrals },
  { path: '/admin/blog', component: AdminBlog },
  { path: '/admin/enterprise', component: AdminEnterprise },
  { path: '/admin/gift-cards', component: AdminGiftCards },
  { path: '/admin/advanced-analytics', component: AdminAdvancedAnalytics },
  { path: '/admin/email-marketing', component: AdminEmailMarketing },
  { path: '/admin/vouchers', component: AdminVouchers },
  { path: '/admin/failover-settings', component: FailoverSettings },
  { path: '/admin/currencies', component: AdminCurrencies },
  { path: '/admin/languages', component: AdminLanguages },
  { path: '/admin/translations', component: AdminTranslations },
  { path: '/admin/banner-management', component: BannerManagement },
  { path: '/admin/pages', component: PagesManagement },
  { path: '/admin/faq-management', component: FaqManagement },
  { path: '/admin/price-brackets', component: AdminPriceBrackets },
];

interface AdminUser {
  id: string;
  email: string;
  role: string;
}

function AdminGuard({ children }: { readonly children: React.ReactNode }) {
  // queryClient auto-extracts 'data' from standardized response, so we get AdminUser directly
  const { data: admin, isLoading } = useQuery<AdminUser | null>({
    queryKey: ['/api/admin/me'],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:text-white">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!admin) {
    return <Redirect to="/admin/login" />;
  }

  const hasAdminAccess = admin.role === 'admin' || admin.role === 'super_admin';

  if (!hasAdminAccess) {
    return <Redirect to="/admin/login" />;
  }

  return <>{children}</>;
}

function UserGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['/api/auth/me'],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

// ✅ Reusable Route Renderers
function renderPublicRoutes() {
  return PUBLIC_ROUTES.map(({ path, component: Component, layout }) => (
    <Route key={path} path={path}>
      <LayoutWrapper layout={layout}>
        <Component />
      </LayoutWrapper>
    </Route>
  ));
}

function renderAuthRoutes() {
  return AUTH_ROUTES.map(({ path, component: Component, layout }) => (
    <Route key={path} path={path}>
      <Component />
    </Route>
  ));
}

function renderAdminRoutes() {
  return ADMIN_ROUTES.map(({ path, component: Component, layout }) => (
    <Route key={path} path={path}>
      {layout === null ? (
        <Component />
      ) : (
        <AdminGuard>
          <AdminLayout>
            <Component />
          </AdminLayout>
        </AdminGuard>
      )}
    </Route>
  ));
}

function renderEnterpriseRoutes() {
  return (
    <>
      <Route path="/enterprise/login">
        <EnterpriseLogin />
      </Route>
      <Route path="/enterprise/dashboard">
        <UserGuard>
          <EnterpriseLayout>
            <EnterpriseDashboard />
          </EnterpriseLayout>
        </UserGuard>
      </Route>
      <Route path="/enterprise/quotes">
        <UserGuard>
          <EnterpriseLayout>
            <EnterpriseQuotes />
          </EnterpriseLayout>
        </UserGuard>
      </Route>
      <Route path="/enterprise/orders">
        <UserGuard>
          <EnterpriseLayout>
            <EnterpriseOrders />
          </EnterpriseLayout>
        </UserGuard>
      </Route>
      <Route path="/enterprise/esims">
        <UserGuard>
          <EnterpriseLayout>
            <EnterpriseESIMs />
          </EnterpriseLayout>
        </UserGuard>
      </Route>
    </>
  );
}

function renderUserRoutes() {
  return (
    <>
      Account Routes with AccountLayout
      <Route path="/account">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <Profile />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
      <Route path="/account/esims">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <MyESIMs />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
      <Route path="/account/referrals">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <Referrals />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
      <Route path="/account/orders">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <MyOrders />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
      <Route path="/account/support">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <AccountSupport />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
      <Route path="/account/kyc">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <KYCSubmission />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
      <Route path="/my-orders">
        <Redirect to="/account/orders" />
      </Route>
      <Route path="/my-esims">
        <Redirect to="/account/esims" />
      </Route>
      <Route path="/profile">
        <Redirect to="/account/profile" />
      </Route>
      {/* <Route path="/account/kyc">
        <UserGuard>
          <KYCSubmission />
        </UserGuard>
      </Route> */}
      <Route path="/kyc">
        <UserGuard>
          <Redirect to="/account/kyc" />
        </UserGuard>
      </Route>
      <Route path="/notifications">
        <UserGuard>
          <Notifications />
        </UserGuard>
      </Route>
      <Route path="/compare">
        <UserGuard>
          <Compare />
        </UserGuard>
      </Route>
      <Route path="/referrals">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <Referrals />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
      <Route path="/support">
        <UserGuard>
          <LayoutWrapper layout={'public'}>
            <AccountLayout>
              <AccountSupport />
            </AccountLayout>
          </LayoutWrapper>
        </UserGuard>
      </Route>
    </>
  );
}

function Router() {
  const { data: settingsResponse } = useQuery<SettingsState>({
    queryKey: ['/api/public/settings'],
  });

  const dispatch = useAppDispatch();
  useEffect(() => {
    if (
      settingsResponse &&
      typeof settingsResponse === 'object' &&
      !Array.isArray(settingsResponse)
    ) {
      dispatch(setSettings(settingsResponse));
    }
  }, [settingsResponse, dispatch]);

  const faviconUrl =
    settingsResponse?.favicon && `${window.location.origin}${settingsResponse.favicon}`;

  // console.log(faviconUrl, 'check $$$$$$$$$$$$$$$$$$$');

  return (
    <>
      {/*DYNAMIC FAVICON */}
      <Helmet>
        {faviconUrl && (
          <link
            rel="icon"
            type="image/png"
            href={`${faviconUrl}?v=${settingsResponse?.updated_at || Date.now()}`}
          />
        )}
      </Helmet>
      <ScrollToTop />

      <Switch>
        {renderPublicRoutes()}
        {renderEnterpriseRoutes()}
        {/* {renderUserRoutes()} */}
        <Route path="/account/:rest*">
          <UserGuard>
            <LayoutWrapper layout="public">
              <AccountShell />
            </LayoutWrapper>
          </UserGuard>
        </Route>
        {renderAuthRoutes()}
        {/* {renderAdminRoutes()}
      <Route component={NotFound} /> */}
        {/* admin login */}
        <Route path="/admin/login">
          <AdminLogin />
        </Route>

        {/* ✅ ADMIN (AccountShell pattern) */}
        <Route path="/admin/:rest*">
          <AdminGuard>
            <AdminShell />
          </AdminGuard>
        </Route>


        {/* ✅ Android WebView Mobile Top-Up – fully standalone, no header/footer */}
        <Route path="/mobile-topup">
          <MobileTopupPayment />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen dark:text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        {/* ✅ Redux Provider - Add here */}
        <Provider store={store}>
          <PersistGate loading={<LoadingFallback />} persistor={persistor}>
            {/* ✅ SINGLE ThemeProvider - Fixed duplicate */}
            <ThemeProvider>
              <TranslationProvider>
                <CurrencyProvider>
                  <ComparisonProvider>
                    <AdminProvider>
                      <UserProvider>
                        <AuthDialogProvider>
                          <TooltipProvider>
                            <Toaster />
                            <AuthDialog />
                            <Suspense fallback={<LoadingFallback />}>
                              <Router />
                              <GlobalFloatingNav />
                            </Suspense>
                          </TooltipProvider>
                        </AuthDialogProvider>
                      </UserProvider>
                    </AdminProvider>
                  </ComparisonProvider>
                </CurrencyProvider>
              </TranslationProvider>
            </ThemeProvider>
          </PersistGate>
        </Provider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
