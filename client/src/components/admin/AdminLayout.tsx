import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  MessageSquare,
  BarChart3,
  Settings,
  Code,
  LogOut,
  Bell,
  Search,
  Menu,
  X,
  Shield,
  Plus,
  Mail,
  Server,
  Star,
  Gift,
  TrendingUp,
  Send,
  RefreshCw,
  ChevronDown,
  Globe,
  MapPin,
  Megaphone,
  Headphones,
  Smartphone,
  Cog,
  DollarSign,
  Languages,
  FileText,
  Image,
  CreditCard,
  Zap,
  UserCheck,
  Cpu,
  Map,
  Ticket,
  UserPlus,
  LifeBuoy,
  Wallet,
  Tags,
  Activity,
  Layout,
  HelpCircle,
  Newspaper,
  ClipboardList,
} from 'lucide-react';
import { useState, useEffect, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { NotificationBell } from '../NotificationBell';
import { useAdmin } from '@/hooks/use-admin';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/contexts/TranslationContext';
import { useSettingByKey } from '@/hooks/useSettings';
import { version as appVersion } from '../../../../package.json';
import { SEOHead } from '../SEOHead';


type NavItem = {
  name: string;
  href: string;
  icon: any;
};

type NavGroup = {
  groupName: string;
  icon: any;
  items: NavItem[];
};

type NavigationEntry = NavItem | NavGroup;





// const navigation: NavigationEntry[] = [
//   { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
//   {
//     groupName: 'Order Management',
//     icon: ShoppingCart,
//     items: [
//       { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
//       { name: 'Custom Orders', href: '/admin/manual-orders', icon: Package },
//       { name: 'Top-up Orders', href: '/admin/topups', icon: Plus },
//     ],
//   },
//   {
//     groupName: 'User Management',
//     icon: Users,
//     items: [
//       { name: 'Customers', href: '/admin/customers', icon: Users },
//       { name: 'KYC Verification', href: '/admin/kyc', icon: Shield },
//     ],
//   },
//   {
//     groupName: 'Master eSIM Packages',
//     icon: Smartphone,
//     items: [
//       { name: 'Providers', href: '/admin/providers', icon: Server },
//       { name: 'eSIM Catalog', href: '/admin/unified-packages', icon: Package },
//       { name: 'Topup Packages', href: '/admin/master-topups', icon: RefreshCw },
//       { name: 'Regions', href: '/admin/master-regions', icon: Globe },
//       { name: 'Countries', href: '/admin/master-countries', icon: MapPin },
//     ],
//   },
//   {
//     groupName: 'Marketing',
//     icon: Megaphone,
//     items: [
//       { name: 'Vouchers', href: '/admin/vouchers', icon: Gift },
//       { name: 'Gift Cards', href: '/admin/gift-cards', icon: Gift },
//       { name: 'Referral Program', href: '/admin/referrals', icon: Gift },
//       // { name: 'Email Marketing', href: '/admin/email-marketing', icon: Send },
//     ],
//   },
//   {
//     groupName: 'Support System',
//     icon: Headphones,
//     items: [{ name: 'Support', href: '/admin/tickets', icon: MessageSquare }],
//   },
//   {
//     groupName: 'In App Purchases',
//     icon: CreditCard,
//     items: [{ name: 'Price Brackets', href: '/admin/price-brackets', icon: CreditCard }],
//   },
//   {
//     groupName: 'Payment Gateways',
//     icon: CreditCard,
//     items: [{ name: 'Gateways', href: '/admin/payment-gateway', icon: CreditCard }],
//   },
//   {
//     groupName: 'Alerts',
//     icon: Bell,
//     items: [
//       { name: 'Notifications', href: '/admin/notifications', icon: Bell },
//       // { name: 'Email Templates', href: '/admin/email-templates', icon: Mail },
//     ],
//   },
//   {
//     groupName: 'Reporting',
//     icon: BarChart3,
//     items: [
//       { name: 'Analytics & Reports', href: '/admin/analytics', icon: BarChart3 },
//       { name: 'Advanced Analytics', href: '/admin/advanced-analytics', icon: TrendingUp },
//       { name: 'Reviews', href: '/admin/reviews', icon: Star },
//     ],
//   },
//   {
//     groupName: 'Platform Setup',
//     icon: Cog,
//     items: [
//       { name: 'Settings', href: '/admin/settings', icon: Settings },
//       { name: 'Currencies', href: '/admin/currencies', icon: DollarSign },
//       { name: 'Failover & API', href: '/admin/failover-settings', icon: Shield },
//       { name: 'Banner Management', href: '/admin/banner-management', icon: Image },
//       { name: 'Pages Management', href: '/admin/pages', icon: FileText },
//       { name: 'FAQ Management', href: '/admin/faq-management', icon: FileText },
//       // { name: "Privacy Policy", href:"/admin/privacy-policy", icon: FileText},
//       // { name: "Terms & Conditions", href:"/admin/terms-conditions", icon: FileText}
//     ],
//   },
//   {
//     groupName: 'Internationalization',
//     icon: Languages,
//     items: [
//       { name: 'Languages', href: '/admin/languages', icon: Globe },
//       { name: 'Translations', href: '/admin/translations', icon: FileText },
//     ],
//   },
//   // { name: 'Enterprise', href: '/admin/enterprise', icon: Users },
//   { name: 'Blog', href: '/admin/blog', icon: MessageSquare },
//   { name: 'API Docs', href: '/admin/api-docs', icon: Code },
// ];










export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
  //   getInitialExpandedGroups(location),
  // );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { user, refetchUser } = useAdmin();
  const { t } = useTranslation();
  const { toast } = useToast();
  const sitename = useSettingByKey('platform_name')

  function isNavGroup(entry: NavigationEntry): entry is NavGroup {
    return 'groupName' in entry;
  }
  const navigation: NavigationEntry[] = [
    { name: t('adminPanel.admin.dashboard', 'Dashboard'), href: '/admin/dashboard', icon: LayoutDashboard },

    {
      groupName: t('adminPanel.admin.orderManagement', 'Order Management'),
      icon: ShoppingCart,
      items: [
        { name: t('adminPanel.admin.orders', 'Orders'), href: '/admin/orders', icon: ShoppingCart },
        { name: t('adminPanel.admin.customOrders', 'Custom Orders'), href: '/admin/manual-orders', icon: ClipboardList },
        { name: t('adminPanel.admin.topupOrders', 'Top-up Orders'), href: '/admin/topups', icon: Zap },
      ],
    },

    {
      groupName: t('adminPanel.admin.userManagement', 'User Management'),
      icon: Users,
      items: [
        { name: t('adminPanel.admin.customers', 'Customers'), href: '/admin/customers', icon: Users },
        { name: t('adminPanel.admin.kycVerification', 'KYC Verification'), href: '/admin/kyc', icon: UserCheck },
      ],
    },

    {
      groupName: t('adminPanel.admin.masterEsimPackages', 'Master eSIM Packages'),
      icon: Smartphone,
      items: [
        { name: t('adminPanel.admin.providers', 'Providers'), href: '/admin/providers', icon: Server },
        { name: t('adminPanel.admin.esimCatalog', 'eSIM Catalog'), href: '/admin/unified-packages', icon: Cpu },
        { name: t('adminPanel.admin.topupPackages', 'Topup Packages'), href: '/admin/master-topups', icon: RefreshCw },
        { name: t('adminPanel.admin.regions', 'Regions'), href: '/admin/master-regions', icon: Map },
        { name: t('adminPanel.admin.countries', 'Countries'), href: '/admin/master-countries', icon: MapPin },
      ],
    },

    {
      groupName: t('adminPanel.admin.marketing', 'Marketing'),
      icon: Megaphone,
      items: [
        { name: t('adminPanel.admin.vouchers', 'Vouchers'), href: '/admin/vouchers', icon: Ticket },
        { name: t('adminPanel.admin.giftCards', 'Gift Cards'), href: '/admin/gift-cards', icon: CreditCard },
        { name: t('adminPanel.admin.referralProgram', 'Referral Program'), href: '/admin/referrals', icon: UserPlus },
      ],
    },

    {
      groupName: t('adminPanel.admin.supportSystem', 'Support System'),
      icon: Headphones,
      items: [
        { name: t('adminPanel.admin.support', 'Support'), href: '/admin/tickets', icon: LifeBuoy },
      ],
    },

    {
      groupName: t('adminPanel.admin.inAppPurchases', 'In App Purchases'),
      icon: Wallet,
      items: [
        { name: t('adminPanel.admin.priceBrackets', 'Price Brackets'), href: '/admin/price-brackets', icon: Tags },
      ],
    },

    {
      groupName: t('adminPanel.admin.paymentGateways', 'Payment Gateways'),
      icon: CreditCard,
      items: [
        { name: t('adminPanel.admin.gateways', 'Gateways'), href: '/admin/payment-gateway', icon: CreditCard },
      ],
    },

    {
      groupName: t('adminPanel.admin.alerts', 'Alerts'),
      icon: Bell,
      items: [
        { name: t('adminPanel.admin.notifications', 'Notifications'), href: '/admin/notifications', icon: Bell },
      ],
    },

    {
      groupName: t('adminPanel.admin.reporting', 'Reporting'),
      icon: BarChart3,
      items: [
        { name: t('adminPanel.admin.analyticsReports', 'Analytics & Reports'), href: '/admin/analytics', icon: BarChart3 },
        { name: t('adminPanel.admin.advancedAnalytics', 'Advanced Analytics'), href: '/admin/advanced-analytics', icon: TrendingUp },
        { name: t('adminPanel.admin.reviews', 'Reviews'), href: '/admin/reviews', icon: Star },
      ],
    },

    {
      groupName: t('adminPanel.admin.platformSetup', 'Platform Setup'),
      icon: Cog,
      items: [
        { name: t('adminPanel.admin.settings', 'Settings'), href: '/admin/settings', icon: Settings },
        { name: t('adminPanel.admin.currencies', 'Currencies'), href: '/admin/currencies', icon: DollarSign },
        { name: t('adminPanel.admin.failoverApi', 'Failover & API'), href: '/admin/failover-settings', icon: Activity },
        { name: t('adminPanel.admin.bannerManagement', 'Banner Management'), href: '/admin/banner-management', icon: Image },
        { name: t('adminPanel.admin.pagesManagement', 'Pages Management'), href: '/admin/pages', icon: Layout },
        { name: t('adminPanel.admin.faqManagement', 'FAQ Management'), href: '/admin/faq-management', icon: HelpCircle },
      ],
    },

    {
      groupName: t('adminPanel.admin.internationalization', 'Internationalization'),
      icon: Languages,
      items: [
        { name: t('adminPanel.admin.languages', 'Languages'), href: '/admin/languages', icon: Globe },
        { name: t('adminPanel.admin.translations', 'Translations'), href: '/admin/translations', icon: FileText },
      ],
    },

    { name: t('adminPanel.admin.blog', 'Blog'), href: '/admin/blog', icon: Newspaper },
    { name: t('adminPanel.admin.apiDocs', 'API Docs'), href: '/admin/api-docs', icon: Code },
  ];


  useEffect(() => {
    setExpandedGroups(getInitialExpandedGroups(location));
  }, []);

  function getInitialExpandedGroups(currentPath: string): Record<string, boolean> {
    const expanded: Record<string, boolean> = {};
    for (const entry of navigation) {
      if (isNavGroup(entry)) {
        const isActive = entry.items.some((item) => currentPath === item.href);
        if (isActive) {
          expanded[entry.groupName] = true;
        }
      }
    }
    if (Object.keys(expanded).length === 0) {
      expanded['Order Management'] = true;
    }
    return expanded;
  }

  useEffect(() => {
    for (const entry of navigation) {
      if (isNavGroup(entry)) {
        const isActive = entry.items.some((item) => location === item.href);
        if (isActive && !expandedGroups[entry.groupName]) {
          setExpandedGroups((prev) => ({
            ...prev,
            [entry.groupName]: true,
          }));
          break;
        }
      }
    }
  }, [location]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/admin/logout', {});

      // React Query admin cache clean
      queryClient.setQueryData(['/api/admin/me'], null);
      refetchUser();

      setLocation('/admin/login');

      toast({
        title: t('common.success'),
        description: 'Logged out successfully',
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: 'Failed to logout',
        variant: 'destructive',
      });
    }
  };

  const currentPath = location;
  const allNavItems = navigation.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));
  const activeNavItem = allNavItems.find((item) => item.href === currentPath);
  const pageTitle = activeNavItem ? activeNavItem.name : 'Admin Panel';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <SEOHead
        title={pageTitle}
        description={`Manage ${sitename} platform - ${pageTitle}`}
        noIndex={true}
        noFollow={true}
      />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen w-64 transform bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-teal-500/50">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 dark:text-white">Admin</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{sitename}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            data-testid="button-close-sidebar"
          >
            <X className="h-5 w-5 text-black dark:text-white" />
          </Button>
        </div>

        {/* Navigation - Scrollable */}
        <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
          {navigation.map((entry, index) => {
            if (isNavGroup(entry)) {
              const isGroupActive = entry.items.some((item) => location === item.href);
              const isExpanded = expandedGroups[entry.groupName] ?? false;
              return (
                <div key={entry.groupName} className="space-y-1">
                  <button
                    onClick={() => toggleGroup(entry.groupName)}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors',
                      isGroupActive
                        ? 'text-teal-600 dark:text-teal-400'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400',
                    )}
                    data-testid={`group-${entry.groupName.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <entry.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{entry.groupName}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 transition-transform duration-200',
                        isExpanded ? 'rotate-180' : '',
                      )}
                    />
                  </button>
                  {isExpanded && (
                    <div className="ml-2 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                      {entry.items.map((item) => {
                        const isActive = location === item.href;
                        return (
                          <Link key={item.name} href={item.href}>
                            <div
                              className={cn(
                                'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer',
                                isActive
                                  ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-teal-500/30'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                              )}
                              data-testid={`link-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              <item.icon
                                className={cn(
                                  'h-4 w-4 shrink-0',
                                  isActive
                                    ? 'text-white'
                                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300',
                                )}
                              />
                              <span className="truncate">{item.name}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = location === entry.href;
            return (
              <Link key={entry.name} href={entry.href}>
                <div
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 cursor-pointer',
                    isActive
                      ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-teal-500/30'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                  data-testid={`link-${entry.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <entry.icon
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isActive
                        ? 'text-white'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300',
                    )}
                  />
                  <span className="truncate">{entry.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 shrink-0">
          <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-slate-700 shadow-sm">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">v{appVersion}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                System Version
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Updated {/* @ts-ignore */} {__APP_BUILD_TIME__}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-open-sidebar"
            >
              <Menu className="h-5 w-5  text-black dark:text-white" />
            </Button>

            <div className="relative hidden md:block dark:text-white">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search orders, customers, packages..."
                className="w-[400px] pl-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                data-testid="input-global-search"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* <Button 
              variant="ghost" 
              size="icon" 
              className="relative"
              data-testid="button-notifications"
            >
              <Bell className="h-5 w-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500">
                3
              </Badge>
            </Button> */}
            {/* <NotificationBell /> */}

            <div className="flex items-center gap-1 sm:gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-3 pl-2" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8 border-2 border-white dark:border-slate-700 shadow-sm">
                    <AvatarFallback className="bg-primary-gradient text-white text-sm font-semibold">
                      {user?.name
                        ? user.name
                          .split(' ')
                          .map((word) => word.charAt(0).toUpperCase())
                          .join('')
                          .slice(0, 2)
                        : 'NA'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-foreground">{user?.name || 'N/A'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user?.role || 'N/A'}
                    </p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="menuitem-profile">
                  {' '}
                  <Link href="/admin/settings" className="cursor-pointer flex items-center gap-2  ">
                    Profile Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menuitem-settings">
                  <Link
                    href="/admin/providers"
                    className="cursor-pointer flex items-center gap-2  "
                  >
                    Preferences
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t('adminPanel.header.logout', 'Logout')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="min-h-[calc(100vh-4rem)] p-6">{children}</main>
      </div>
    </div>
  );
}
