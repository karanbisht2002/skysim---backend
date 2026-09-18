import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, DollarSign, ShoppingCart, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from '@/contexts/TranslationContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from "recharts";
import { useTheme } from "@/contexts/ThemeContext";

interface StatsData {
  totalOrders: number;
  totalRevenue: number;
  totalEsims: number;
  totalCost: number;
  totalCustomers: number;
  activePackages: number;
  trends: {
    orders: number;
    revenue: number;
    customers: number;
  };
  revenueByMonth: Array<{ month: string; revenue: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
  topDestinations: Array<{ country: string; flag: string; count: number; revenue: number }>;
  providerStats: Array<{
    id: string;
    name: string;
    slug: string;
    orderCount: number;
    totalCost: number;
    totalRevenue: number;
  }>;
}

export default function Analytics() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const themePrimary = colors.primary;
  const { data: stats, isLoading } = useQuery<StatsData>({
    queryKey: ["/api/admin/stats"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">{t('adminPanel.admin.analytics.loadingAnalytics', 'Loading analytics...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            {t('adminPanel.admin.analytics.title', 'Analytics & Reports')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {t('adminPanel.admin.analytics.description', 'Detailed insights and performance metrics')}
          </p>
        </div>
        <Button variant="outline" className="gap-2" data-testid="button-export-report">
          <Download className="h-4 w-4" />
          {t('adminPanel.admin.analytics.exportReport', 'Export Report')}
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 bg-gradient-to-br from-teal-50 to-indigo-50 dark:from-teal-950/30 dark:to-indigo-950/30 shadow-lg p-6" data-testid="card-analytics-revenue">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-teal-600 dark:text-teal-400">{t('adminPanel.admin.analytics.totalRevenue', 'Total Revenue')}</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2" data-testid="text-analytics-total-revenue">
                ${stats?.totalRevenue.toFixed(2) || "0.00"}
              </h3>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 font-medium" data-testid="text-analytics-revenue-trend">
                {stats?.trends.revenue >= 0 ? "+" : ""}{stats?.trends.revenue.toFixed(1)}% {t('adminPanel.admin.analytics.vsLastMonth', 'vs last month')}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-indigo-600">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 shadow-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t('adminPanel.admin.analytics.totalOrders', 'Total Orders')}</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                {stats?.totalOrders.toLocaleString() || 0}
              </h3>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                {stats?.totalEsims.toLocaleString() || 0} {t('adminPanel.admin.analytics.totalEsims', 'eSIMs sold')}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600">
              <ShoppingCart className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-teal-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 shadow-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-teal-600 dark:text-teal-400">{t('adminPanel.admin.analytics.totalCustomers', 'Total Customers')}</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                {stats?.totalCustomers.toLocaleString() || 0}
              </h3>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 font-medium">
                +{stats?.trends.customers || 0} {t('adminPanel.admin.analytics.newThisMonth', 'new this month')}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-pink-600">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 shadow-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{t('adminPanel.admin.analytics.paidToProviders', 'Paid to Providers')}</p>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                ${stats?.totalCost.toFixed(2) || "0.00"}
              </h3>
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                {t('adminPanel.admin.analytics.profit', 'Profit:')} ${((stats?.totalRevenue || 0) - (stats?.totalCost || 0)).toFixed(2)}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-600">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
      </div>

      {/* Provider Statistics */}
      {stats?.providerStats && stats.providerStats.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('adminPanel.admin.analytics.providerPerformance', 'Provider Performance')}</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">{t('adminPanel.admin.analytics.providerPerformanceDesc', 'Orders and costs by provider')}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {stats.providerStats.map((provider) => (
              <Card key={provider.id} className="border-0 shadow-lg" data-testid={`card-provider-${provider.slug}`}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white capitalize">{provider.name}</h3>
                    <div className="px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium">
                      {provider.orderCount} {t('adminPanel.admin.analytics.orders', 'orders')}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{t('adminPanel.admin.analytics.revenue', 'Revenue')}</span>
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" data-testid={`text-provider-revenue-${provider.slug}`}>
                        ${provider.totalRevenue.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{t('adminPanel.admin.analytics.cost', 'Cost')}</span>
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400" data-testid={`text-provider-cost-${provider.slug}`}>
                        ${provider.totalCost.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{t('adminPanel.admin.analytics.profitLabel', 'Profit')}</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white" data-testid={`text-provider-profit-${provider.slug}`}>
                        ${(provider.totalRevenue - provider.totalCost).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <Card className="border-0 shadow-lg">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('adminPanel.admin.analytics.revenueOverTime', 'Revenue Over Time')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t('adminPanel.admin.analytics.monthlyRevenueTrend', 'Monthly revenue trend')}</p>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats?.revenueByMonth || []}>
                <defs>
                  <linearGradient id="colorRevenue2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${value}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#14b8a6"
                  fillOpacity={1}
                  fill="url(#colorRevenue2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Destinations Revenue */}
        <Card className="border-0 shadow-lg">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('adminPanel.admin.analytics.topDestinations', 'Top Destinations by Revenue')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t('adminPanel.admin.analytics.highestEarning', 'Highest earning markets')}</p>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.topDestinations.slice(0, 6) || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis
                  type="category"
                  dataKey="country"
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Performance Summary */}
      <Card className="border-0 shadow-lg">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('adminPanel.admin.analytics.performanceSummary', 'Performance Summary')}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t('adminPanel.admin.analytics.keyMetrics', 'Key metrics and insights')}</p>
        </div>
        <div className="p-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('adminPanel.admin.analytics.customerLifetimeValue', 'Customer Lifetime Value')}</p>
              <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
                ${stats?.totalOrders > 0 ? (stats.totalRevenue / stats.totalCustomers).toFixed(2) : "0.00"}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t('adminPanel.admin.analytics.averagePerCustomer', 'Average per customer')}</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('adminPanel.admin.analytics.conversionRate', 'Conversion Rate')}</p>
              <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
                {stats?.totalCustomers > 0 ? ((stats.totalOrders / stats.totalCustomers) * 100).toFixed(1) : "0"}%
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t('adminPanel.admin.analytics.ordersPerCustomer', 'Orders per customer')}</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t('adminPanel.admin.analytics.activePackageRate', 'Active Package Rate')}</p>
              <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">100%</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t('adminPanel.admin.analytics.allPackagesAvailable', 'All packages available')}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
