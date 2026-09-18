import { lazy, Suspense } from 'react';
import { Switch, Route, Redirect } from 'wouter';
import { AdminLayout } from './AdminLayout';

const AdminPriceBrackets = lazy(() => import('@/pages/admin/AdminPriceBrackets'));

const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const OrderManagement = lazy(() => import('@/pages/admin/OrderManagement'));
const AdminOrderEsim = lazy(() => import('@/pages/admin/AdminOrderEsim'));
const CustomEsimOrders = lazy(() => import('@/pages/admin/CustomEsimOrders'));
const CustomerManagement = lazy(() => import('@/pages/admin/CustomerManagement'));
const KYCManagement = lazy(() => import('@/pages/admin/KYCManagement'));
const PackageManagement = lazy(() => import('@/pages/admin/PackageManagement'));
const TicketManagement = lazy(() => import('@/pages/admin/TicketManagement'));
const Analytics = lazy(() => import('@/pages/admin/Analytics'));
const ApiDocs = lazy(() => import('@/pages/admin/ApiDocs'));
const Settings = lazy(() => import('@/pages/admin/Settings'));
const Providers = lazy(() => import('@/pages/admin/Providers'));
const UnifiedPackages = lazy(() => import('@/pages/admin/Packages'));
const MasterTopups = lazy(() => import('@/pages/admin/MasterTopups'));
const MasterRegions = lazy(() => import('@/pages/admin/MasterRegions'));
const MasterCountries = lazy(() => import('@/pages/admin/MasterCountries'));
const AdminTopupsPage = lazy(() => import('@/pages/admin/Topups'));
const NotificationHistory = lazy(() => import('@/pages/admin/NotificationHistory'));
const EmailTemplates = lazy(() => import('@/pages/admin/EmailTemplates'));
const AdminReviews = lazy(() => import('@/pages/admin/AdminReviews'));
const AdminReferrals = lazy(() => import('@/pages/admin/AdminReferrals'));
const AdminBlog = lazy(() => import('@/pages/admin/AdminBlog'));
const AdminEnterprise = lazy(() => import('@/pages/admin/AdminEnterprise'));
const AdminGiftCards = lazy(() => import('@/pages/admin/AdminGiftCards'));
const AdminAdvancedAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics'));
const AdminEmailMarketing = lazy(() => import('@/pages/admin/AdminEmailMarketing'));
const AdminVouchers = lazy(() => import('@/pages/admin/AdminVouchers'));
const FailoverSettings = lazy(() => import('@/pages/admin/FailoverSettings'));
const AdminCurrencies = lazy(() => import('@/pages/admin/Currencies'));
const AdminLanguages = lazy(() => import('@/pages/admin/AdminLanguages'));
const AdminTranslations = lazy(() => import('@/pages/admin/AdminTranslations'));
const BannerManagement = lazy(() => import('@/pages/admin/BannerManagement'));
const PagesManagement = lazy(() => import('@/pages/admin/PagesManagement'));
const FaqManagement = lazy(() => import('@/pages/admin/FaqManagement'));
const PaymentGatewayManagement = lazy(() => import('@/pages/admin/PaymentGatewayManagement'));

export default function AdminShell() {
  return (
    <AdminLayout>
      <Suspense fallback={<div className="p-6 dark:text-white">Loading...</div>}>
        <Switch>
          {/* default */}
          <Route path="/admin">
            <Redirect to="/admin/dashboard" />
          </Route>

          <Route path="/admin/dashboard" component={AdminDashboard} />

          {/* ✅ MOST SPECIFIC FIRST */}
          <Route path="/admin/orders" component={OrderManagement} />
          <Route path="/admin/manual-orders" component={CustomEsimOrders} />
          <Route path="/admin/purchase-orders" component={AdminOrderEsim} />

          <Route path="/admin/customers" component={CustomerManagement} />
          <Route path="/admin/kyc" component={KYCManagement} />
          <Route path="/admin/packages" component={PackageManagement} />
          <Route path="/admin/tickets" component={TicketManagement} />
          <Route path="/admin/analytics" component={Analytics} />
          <Route path="/admin/api-docs" component={ApiDocs} />
          <Route path="/admin/settings" component={Settings} />
          <Route path="/admin/providers" component={Providers} />
          <Route path="/admin/unified-packages" component={UnifiedPackages} />
          <Route path="/admin/master-topups" component={MasterTopups} />
          <Route path="/admin/master-regions" component={MasterRegions} />
          <Route path="/admin/master-countries" component={MasterCountries} />
          <Route path="/admin/topups" component={AdminTopupsPage} />
          <Route path="/admin/notifications" component={NotificationHistory} />
          <Route path="/admin/email-templates" component={EmailTemplates} />
          <Route path="/admin/reviews" component={AdminReviews} />
          <Route path="/admin/referrals" component={AdminReferrals} />
          <Route path="/admin/blog" component={AdminBlog} />
          <Route path="/admin/enterprise" component={AdminEnterprise} />
          <Route path="/admin/gift-cards" component={AdminGiftCards} />
          <Route path="/admin/advanced-analytics" component={AdminAdvancedAnalytics} />
          <Route path="/admin/email-marketing" component={AdminEmailMarketing} />
          <Route path="/admin/vouchers" component={AdminVouchers} />
          <Route path="/admin/failover-settings" component={FailoverSettings} />
          <Route path="/admin/currencies" component={AdminCurrencies} />
          <Route path="/admin/languages" component={AdminLanguages} />
          <Route path="/admin/translations" component={AdminTranslations} />
          <Route path="/admin/banner-management" component={BannerManagement} />
          <Route path="/admin/pages" component={PagesManagement} />
          <Route path="/admin/faq-management" component={FaqManagement} />
          <Route path="/admin/payment-gateway" component={PaymentGatewayManagement} />
          <Route path="/admin/price-brackets" component={AdminPriceBrackets} />
        </Switch>
      </Suspense>
    </AdminLayout>
  );
}
