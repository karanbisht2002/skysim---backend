import { useState } from 'react';
import { useLocation } from "wouter";
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  ShoppingCart,
  Users,
  Package as PackageIcon,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import WorldMap from '@/components/WorldMap';
import { format } from 'date-fns';
import { useTranslation } from '@/contexts/TranslationContext';
import { useTheme } from '@/contexts/ThemeContext';

interface StatsData {
  totalOrders: number;
  totalRevenue: number;
  totalEsims: number;
  totalCost: number;
  totalCustomers: number;
  activePackages: number;
  totalPackages: number;
  pendingTickets: number;
  totalTickets: number;
  trends: {
    orders: number;
    revenue: number;
    customers: number;
  };
  revenueByMonth: Array<{ month: string; revenue: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
  topDestinations: Array<{ country: string; flag: string; count: number; revenue: number }>;
  latestOrders: Array<{
    id: string;
    displayOrderId: number;
    userEmail: string;
    packageTitle: string;
    destinationName: string;
    price: number;
    status: string;
    createdAt: string;
  }>;
  latestCustomers: Array<{
    id: string;
    displayUserId: number;
    email: string;
    name: string | null;
    createdAt: string;
  }>;
  ordersByCountry: Array<{
    country: string;
    iso2: string;
    count: number;
  }>;
}

// Move COLORS inside if needed, or update the ones that should be dynamic

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const themePrimary = colors.primary;

  const COLORS = {
    pending: '#f59e0b',
    processing: themePrimary,
    completed: '#10b981',
    failed: '#ef4444',
    cancelled: '#6b7280',
  };

  const [timeFilter, setTimeFilter] = useState<'7days' | '30days' | 'lifetime'>('lifetime');
  const [, setLocation] = useLocation();

  const handleTicketClick = () => {
    setLocation("/admin/tickets");
  };

  const handleCustomerClick = () => {
    setLocation("/admin/customers")
  }


  const handleOrdersClick = () => {
    setLocation("/admin/orders")
  }

  const handlePackagesClick = () => {
    setLocation("/admin/unified-packages")
  }

  const handleRevenueClick = () => {
    setLocation("/admin/analytics")
  }

  const { data: stats, isLoading } = useQuery<StatsData>({
    queryKey: ['/api/admin/stats', timeFilter],
    queryFn: async () => {
      const response = await fetch(`/api/admin/stats?timeFilter=${timeFilter}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      const json = await response.json();
      // Extract data from standardized API response format
      return json.data || json;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 dark:border-teal-400 mx-auto mb-4"></div>

          <p className="text-slate-600 dark:text-slate-300">
            {t('admin.dashboard.loadingDashboard', 'Loading dashboard...')}
          </p>
        </div>
      </div>
    );
  }

  const hasOrders = stats && stats.totalOrders > 0;
  const pieData =
    stats?.ordersByStatus?.map((item) => ({
      name: t(`common.status.${item.status}`, item.status.charAt(0).toUpperCase() + item.status.slice(1)),
      value: item.count,
      color: COLORS[item.status as keyof typeof COLORS] || '#6b7280',
    })) || [];

  return (
    <div className="p-6 lg:p-8 space-y-8 dark:text-white">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          {t('adminPanel.admin.dashboard.title', 'Dashboard')}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          {t(
            'adminPanel.admin.dashboard.description',
            "Welcome back! Here's what's happening with your eSIM marketplace today.",
          )}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Total Revenue */}
        <Card
          onClick={handleRevenueClick}
          className="relative overflow-hidden border-0 bg-gradient-to-br from-teal-50 to-indigo-50 dark:from-teal-950/30 dark:to-indigo-950/30 shadow-lg shadow-teal-100/50 dark:shadow-teal-900/10"
          data-testid="card-total-revenue"
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-teal-600 dark:text-teal-400">
                  {t('adminPanel.admin.dashboard.totalRevenue', 'Total Revenue')}
                </p>
                <h3
                  className="text-3xl font-bold text-slate-900 dark:text-white mt-2"
                  data-testid="text-total-revenue"
                >
                  ${stats?.totalRevenue.toFixed(2) || '0.00'}
                </h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-indigo-600 shadow-lg shadow-teal-500/50">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
            {stats && stats.trends.revenue !== 0 && (
              <div className="mt-4 flex items-center gap-2" data-testid="text-revenue-trend">
                {stats.trends.revenue >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span
                  className={`text-sm font-medium ${stats.trends.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {Math.abs(stats.trends.revenue).toFixed(1)}%
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {t('adminPanel.admin.dashboard.vsLastMonth', 'vs last month')}
                </span>
              </div>
            )}
          </div>
          <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-teal-400/20 to-indigo-400/20 blur-2xl"></div>
        </Card>

        {/* Total Cost */}
        <Card
          onClick={handleRevenueClick}
          className="relative overflow-hidden border-0 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 shadow-lg shadow-red-100/50 dark:shadow-red-900/10"
          data-testid="card-total-cost"
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t('adminPanel.admin.dashboard.totalCost', 'Total Cost')}
                </p>
                <h3
                  className="text-3xl font-bold text-slate-900 dark:text-white mt-2"
                  data-testid="text-total-cost"
                >
                  ${stats?.totalCost.toFixed(2) || '0.00'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  {t('adminPanel.admin.dashboard.costToProviders', 'Cost to Providers')}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-600 shadow-lg shadow-red-500/50">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
            </div>
            {stats && stats.totalRevenue > 0 && stats.totalCost > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                >
                  ${(stats.totalRevenue - stats.totalCost).toFixed(2)}{' '}
                  {t('adminPanel.admin.dashboard.profit', 'profit')}
                </Badge>
              </div>
            )}
          </div>
          <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-red-400/20 to-rose-400/20 blur-2xl"></div>
        </Card>

        {/* Total Orders + eSIMs */}
        <Card
          onClick={handleOrdersClick}
          className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 shadow-lg shadow-emerald-100/50 dark:shadow-emerald-900/10"
          data-testid="card-total-orders"
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  {t('adminPanel.admin.dashboard.totalOrders', 'Total Orders')}
                </p>
                <h3
                  className="text-3xl font-bold text-slate-900 dark:text-white mt-2"
                  data-testid="text-total-orders"
                >
                  {stats?.totalOrders.toLocaleString() || 0}
                </h3>
                <p
                  className="text-sm text-slate-600 dark:text-slate-400 mt-1"
                  data-testid="text-total-esims"
                >
                  {stats?.totalEsims.toLocaleString() || 0}{' '}
                  {t('adminPanel.admin.dashboard.totalEsims', 'eSIMs sold')}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 shadow-lg shadow-emerald-500/50">
                <ShoppingCart className="h-6 w-6 text-white" />
              </div>
            </div>
            {stats && stats.trends.orders !== 0 && (
              <div className="mt-4 flex items-center gap-2">
                {stats.trends.orders >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span
                  className={`text-sm font-medium ${stats.trends.orders >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {Math.abs(stats.trends.orders).toFixed(1)}%
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {t('adminPanel.admin.dashboard.vsLastMonth', 'vs last month')}
                </span>
              </div>
            )}
          </div>
          <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-400/20 blur-2xl"></div>
        </Card>

        {/* Total Customers */}
        <Card
          onClick={handleCustomerClick}
          className="relative overflow-hidden border-0 bg-gradient-to-br from-teal-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 shadow-lg shadow-teal-100/50 dark:shadow-teal-900/10"
          data-testid="card-total-customers"
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-teal-600 dark:text-teal-400">
                  {t('adminPanel.admin.dashboard.customers', 'Customers')}
                </p>
                <h3
                  className="text-3xl font-bold text-slate-900 dark:text-white mt-2"
                  data-testid="text-total-customers"
                >
                  {stats?.totalCustomers.toLocaleString() || 0}
                </h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-pink-600 shadow-lg shadow-teal-500/50">
                <Users className="h-6 w-6 text-white" />
              </div>
            </div>
            {stats && stats.trends.customers > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                >
                  +{stats.trends.customers} {t('admin.dashboard.thisMonth', 'this month')}
                </Badge>
              </div>
            )}
          </div>
          <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-teal-400/20 to-pink-400/20 blur-2xl"></div>
        </Card>

        {/* Active Packages */}
        <Card
          onClick={handlePackagesClick}
          className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 shadow-lg shadow-orange-100/50 dark:shadow-orange-900/10"
          data-testid="card-active-packages"
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                  {t('adminPanel.admin.dashboard.activePackages', 'Active Packages')}
                </p>
                <h3
                  className="text-3xl font-bold text-slate-900 dark:text-white mt-2"
                  data-testid="text-active-packages"
                >
                  {stats?.activePackages.toLocaleString() || 0}
                </h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 shadow-lg shadow-orange-500/50">
                <PackageIcon className="h-6 w-6 text-white" />
              </div>
            </div>
            {stats && stats.totalPackages > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats.totalPackages} {t('admin.dashboard.packages', 'packages')}
                </Badge>
              </div>
            )}
          </div>
          <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-orange-400/20 to-amber-400/20 blur-2xl"></div>
        </Card>

        {/* Total Tickets */}
        <Card
          onClick={handleTicketClick}
          className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 shadow-lg shadow-orange-100/50 dark:shadow-orange-900/10"
          data-testid="card-active-packages"
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                  {t('adminPanel.admin.dashboard.totalTickets', 'Total Tickets')}
                </p>
                <h3
                  className="text-3xl font-bold text-slate-900 dark:text-white mt-2"
                  data-testid="text-active-packages"
                >
                  {stats?.totalTickets.toLocaleString() || 0}
                </h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 shadow-lg shadow-orange-500/50">
                <PackageIcon className="h-6 w-6 text-white" />
              </div>
            </div>
            {stats && stats.pendingTickets > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats.pendingTickets} {t('admin.dashboard.tickets', 'tickets')}
                </Badge>
              </div>
            )}
          </div>
          <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-orange-400/20 to-amber-400/20 blur-2xl"></div>
        </Card>
      </div>

      {hasOrders ? (
        <>
          {/* Charts Section */}
          <div className="grid gap-6 lg:grid-cols-7">
            {/* Revenue Trend */}
            <Card className="lg:col-span-4 border-0 shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t('adminPanel.admin.dashboard.revenueTrend', 'Revenue Trend')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {t('adminPanel.admin.dashboard.last6Months', 'Last 6 months performance')}
                </p>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats?.revenueByMonth || []}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={themePrimary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={themePrimary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      className="dark:stroke-slate-800"
                    />
                    <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
                    <YAxis
                      stroke="#64748b"
                      style={{ fontSize: '12px' }}
                      tickFormatter={(value) => `$${value.toLocaleString()}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, t('adminPanel.admin.dashboard.revenue', 'Revenue')]}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke={themePrimary}
                      strokeWidth={3}
                      fill="url(#colorRevenue)"
                      dot={{ fill: themePrimary, r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Order Status */}
            <Card className="lg:col-span-3 border-0 shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t('adminPanel.admin.dashboard.orderStatus', 'Order Status')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {t('adminPanel.admin.dashboard.distributionOverview', 'Distribution overview')}
                </p>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Top Destinations */}
          <Card className="border-0 shadow-lg">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {t('adminPanel.admin.dashboard.topDestinations', 'Top Destinations')}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {t('adminPanel.admin.dashboard.topDestinationsDesc', 'Most popular packages by country')}
                  </p>
                </div>
                <Link href="/admin/unified-packages">
                  <Button variant="outline" size="sm" className="gap-2">
                    {t('adminPanel.admin.dashboard.viewAll', 'View All')}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="p-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {stats?.topDestinations.slice(0, 6).map((dest, index) => (
                  <div
                    key={dest.country}
                    className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all duration-200"
                    data-testid={`top-destination-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{dest.flag}</span>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {dest.country}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {dest.count} {t('adminPanel.admin.dashboard.orders', 'orders')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        ${dest.revenue.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* World Map */}
          <WorldMap
            data={stats?.ordersByCountry || []}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
          />

          {/* Latest Orders & Customers Grid */}
          <div className="grid gap-6   lg:grid-cols-2">
            {/* Latest Orders */}
            <Card className="border-0 shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {t('adminPanel.admin.dashboard.latestOrders', 'Latest Orders')}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {t('adminPanel.admin.dashboard.latestOrdersDesc', 'Recent eSIM purchases')}
                    </p>
                  </div>
                  <Link href="/admin/orders">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      data-testid="button-view-all-orders"
                    >
                      {t('adminPanel.admin.dashboard.viewAll', 'View All')}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {stats?.latestOrders?.slice(0, 10).map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all duration-200"
                      data-testid={`latest-order-${order.displayOrderId}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="font-mono text-xs">
                            OID{String(order.displayOrderId).padStart(3, '0')}
                          </Badge>
                          <Badge
                            variant={
                              order.status === 'completed'
                                ? 'default'
                                : order.status === 'failed'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="capitalize"
                          >
                            {order.status}
                          </Badge>
                        </div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">
                          {order.packageTitle}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {order.userEmail || t('adminPanel.admin.dashboard.adminOrder', 'Admin Order')} •{' '}
                          {order.destinationName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                          {format(new Date(order.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600 dark:text-emerald-400">
                          ${order.price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Latest Customers */}
            <Card className="border-0 shadow-lg">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {t('adminPanel.admin.dashboard.latestCustomers', 'Latest Customers')}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {t('adminPanel.admin.dashboard.latestCustomersDesc', 'Recently registered users')}
                    </p>
                  </div>
                  <Link href="/admin/customers">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      data-testid="button-view-all-customers"
                    >
                      {t('adminPanel.admin.dashboard.viewAll', 'View All')}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {stats?.latestCustomers?.slice(0, 10).map((customer) => (
                    <div
                      key={customer.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all duration-200"
                      data-testid={`latest-customer-${customer.displayUserId}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="font-mono text-xs">
                            UID{String(customer.displayUserId).padStart(3, '0')}
                          </Badge>
                        </div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">
                          {customer.name || t('adminPanel.admin.dashboard.noName', 'No Name')}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {customer.email}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                          {t('adminPanel.admin.dashboard.joined', 'Joined')}{' '}
                          {format(new Date(customer.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </>
      ) : (
        /* Empty State */
        <Card className="border-0 shadow-lg">
          <div className="p-12 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-indigo-100 dark:from-teal-900/30 dark:to-indigo-900/30 mx-auto mb-6">
              <ShoppingCart className="h-10 w-10 text-primary dark:text-primary-dark" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {t('adminPanel.admin.dashboard.noOrdersYet', 'No Orders Yet')}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6">
              {t(
                'adminPanel.admin.dashboard.noOrdersDesc',
                'Your marketplace is ready! Start by adding packages and wait for customers to place their first orders.',
              )}
            </p>
            <div className="flex gap-4 justify-center flex-col md:flex-row">
              <Link href="/admin/unified-packages">
                <Button className="bg-hero-gradient hover:bg-hero-gradient text-white">
                  {t('adminPanel.admin.dashboard.managePackages', 'Manage Packages')}
                </Button>
              </Link>
              <Link href="/admin/customers">
                <Button variant="outline">
                  {t('adminPanel.admin.dashboard.viewCustomers', 'View Customers')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
