import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import ReactCountryFlag from 'react-country-flag';
import {
  Search,
  Eye,
  Mail,
  Download,
  Filter,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Smartphone,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Order, UnifiedPackage, User, Destination } from '@shared/schema';
import { formatDisplayOrderId, formatDisplayUserId } from '@shared/utils';
import { ESimDetailsModal } from '@/components/admin/ESimDetailsModal';
import { useTranslation } from '@/contexts/TranslationContext';
import { useAdmin } from '@/hooks/use-admin';

type FailoverAttempt = {
  providerId: string;
  providerName?: string;
  timestamp: string;
  success: boolean;
  error?: string;
  margin?: number;
};

type OrderWithDetails = Order & {
  user: User | null;
  package: UnifiedPackage & { destination?: Destination };
  originalProviderName?: string;
  finalProviderName?: string;
};

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-[#dcf0de] text-[#194520] dark:bg-[#194520]/30 dark:text-[#3d9a4d]',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function OrderManagement() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [esimDetailsOrderId, setEsimDetailsOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { toast } = useToast();
  const { user } = useAdmin();

  const formatOrderDateTime = (dateVal: string | Date | null | undefined): string => {
    if (!dateVal) return t('common.na', 'N/A');
    let str = typeof dateVal === 'string' ? dateVal : dateVal.toISOString();
    if (typeof dateVal === 'string' && !str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
      str = str.replace(' ', 'T') + 'Z';
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return t('common.na', 'N/A');
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };


  // console.log('orders', selectedOrder);
  // console.log('esimDetailsOrderId', esimDetailsOrderId);

  const { data: orders, isLoading, error } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/admin/orders'],
  });

  const sendInstructionsMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest('POST', `/api/admin/orders/${orderId}/send-instructions`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: t('common.success', 'Success'),
        description: t(
          'admin.orders.instructionsSent',
          'Installation instructions sent successfully',
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description:
          error.message ||
          t('admin.orders.failedToSendInstructions', 'Failed to send instructions'),
        variant: 'destructive',
      });
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      return await apiRequest('PUT', `/api/admin/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.orders.statusUpdated', 'Order status updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description:
          error.message || t('admin.orders.failedToUpdateStatus', 'Failed to update order status'),
        variant: 'destructive',
      });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest('DELETE', `/api/admin/orders/${orderId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.orders.deleteSuccess', 'Order deleted successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('admin.orders.failedToDelete', 'Failed to delete order'),
        variant: 'destructive',
      });
    },
  });

  const fetchPendingOrdersMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/orders/fetch-pending', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: t('admin.orders.fetchComplete', 'Fetch Complete'),
        description:
          data.message ||
          t('admin.orders.pendingOrdersChecked', 'Pending orders checked successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description:
          error.message || t('admin.orders.failedToFetchPending', 'Failed to fetch pending orders'),
        variant: 'destructive',
      });
    },
  });

  // CSV Export Function
  const exportToCSV = () => {

    // console.log(user?.email, user?.email === "de****@di***")
    // return
    if (user?.email === "de****@di***") {
      return toast({
        title: t("common.error", "Error"),
        description: t('admin.orders.demoUserRestriction', 'Demo users are not allowed to perform this action'),
        variant: 'destructive',
      })
    }

    if (!orders || orders.length === 0) {
      toast({
        title: t('common.noData', 'No Data'),
        description: t('admin.orders.noOrdersToExport', 'There are no orders to export.'),
        variant: 'destructive',
      });
      return;
    }

    const headers = [
      t('admin.orders.orderId', 'Order ID'),
      t('admin.orders.customerName', 'Customer Name'),
      t('admin.orders.customerEmail', 'Customer Email'),
      t('admin.orders.customerId', 'Customer ID'),
      t('admin.orders.destination', 'Destination'),
      t('admin.orders.package', 'Package'),
      t('admin.orders.dataAmount', 'Data Amount'),
      t('admin.orders.validityDays', 'Validity (Days)'),
      t('admin.orders.quantity', 'Quantity'),
      t('admin.orders.customerPrice', 'Customer Price'),
      t('admin.orders.airaloCost', 'Airalo Cost'),
      t('admin.orders.profit', 'Profit'),
      t('admin.orders.currency', 'Currency'),
      t('admin.orders.status', 'Status'),
      t('admin.orders.iccid', 'ICCID'),
      t('admin.orders.qrCode', 'QR Code'),
      t('admin.orders.orderDate', 'Order Date'),
      t('admin.orders.webhookReceived', 'Webhook Received'),
    ];

    const rows = orders.map((order) => {
      const customerPrice = parseFloat(order.price as string);
      const airaloPrice = order.airaloPrice ? parseFloat(order.airaloPrice as string) : 0;
      const profit = (customerPrice - airaloPrice) * order.quantity;
      return [
        formatDisplayOrderId(order.displayOrderId),
        order.user?.name || t('common.unassigned', 'Unassigned'),
        order.user?.email || t('admin.orders.notAssigned', 'Not assigned'),
        order.user ? formatDisplayUserId(order.user.displayUserId) : t('common.na', 'N/A'),
        order.package?.destination?.name || order.package?.title || t('common.global', 'Global'),
        order.package?.title || 'eSIM Package',
        order.dataAmount,
        order.validity,
        order.quantity,
        customerPrice.toFixed(2),
        airaloPrice.toFixed(2),
        profit.toFixed(2),
        order.currency,
        order.status,
        order.iccid || t('common.pending', 'Pending'),
        order.qrCodeUrl ? t('common.available', 'Available') : t('common.pending', 'Pending'),
        formatOrderDateTime(order.createdAt),
        order.webhookReceivedAt
          ? formatOrderDateTime(order.webhookReceivedAt)
          : t('common.na', 'N/A'),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `esim-orders-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: t('admin.orders.exportSuccess', 'Export Successful'),
      description: t('admin.orders.exportedOrders', `Exported ${orders.length} orders to CSV.`),
    });
  };

  const filteredOrders = orders?.filter((order) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (order.user?.email?.toLowerCase()?.includes(q) ?? false) ||
      (order.guestEmail?.toLowerCase()?.includes(q) ?? false) ||
      (order.id?.toLowerCase()?.includes(q) ?? false) ||
      (order.package?.destination?.name?.toLowerCase()?.includes(q) ?? false) ||
      (order.package?.title?.toLowerCase()?.includes(q) ?? false) ||
      (order.iccid?.toLowerCase()?.includes(q) ?? false);

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil((filteredOrders?.length || 0) / itemsPerPage);
  const paginatedOrders = filteredOrders?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Manual status refresh mutation
  const refreshStatusMutation = useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      return apiRequest('POST', `/api/admin/orders/${orderId}/refresh-status`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: t('admin.orders.statusRefreshed', 'Status Refreshed'),
        description: t('admin.orders.statusUpdatedSuccessfully', 'Order status has been updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.orders.refreshFailed', 'Refresh Failed'),
        description: error.message || t('admin.orders.failedToRefreshStatus', 'Failed to refresh order status'),
        variant: 'destructive',
      });
    },
  });

  const refundOrderMutation = useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      return apiRequest('POST', `/api/admin/orders/${orderId}/refund`, {});
    },
    onSuccess: async (data) => {
      const res = await data.json();
      console.log('Refund response data:', res);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      const providerResult = res.data?.providerResult;
      const isSuccess = res.success && providerResult?.success !== false;
      toast({
        title: isSuccess ? t('admin.orders.refundProcessed', 'Refund Processed') : t('admin.orders.refundFailed', 'Refund Failed'),
        description:
          providerResult?.errorMessage ||
          providerResult?.message ||
          res.message ||
          t('admin.orders.refundSuccess', 'Order has been refunded successfully'),
        variant: isSuccess ? 'default' : 'destructive',
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.orders.refundFailed', 'Refund Failed'),
        description: error.message || t('admin.orders.failedToProcessRefund', 'Failed to process refund'),
        variant: 'destructive',
      });
    },
  });


  const formatPrice = (amount: string | number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number(amount));
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            {t('admin.orders.title', 'Order Management')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {t('admin.orders.description', 'Manage and track all eSIM orders')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => fetchPendingOrdersMutation.mutate()}
            disabled={fetchPendingOrdersMutation.isPending}
            data-testid="button-fetch-pending"
          >
            <RefreshCw
              className={`h-4 w-4 ${fetchPendingOrdersMutation.isPending ? 'animate-spin' : ''}`}
            />
            {t('admin.orders.fetchPending', 'Fetch Pending')}
          </Button>
          <Link href="/admin/orders/purchase">
            <Button data-testid="button-order-esim">
              <ShoppingCart className="h-4 w-4 mr-2" />
              {t('admin.orders.orderEsims', 'Order eSIMs')}
            </Button>
          </Link>
          <Button
            variant="outline"
            className="gap-2"
            onClick={exportToCSV}
            data-testid="button-export-orders"
          >
            <Download className="h-4 w-4" />
            {t('admin.orders.exportOrders', 'Export Orders 1')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-lg">
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={t(
                    'admin.orders.searchPlaceholder',
                    'Search by email, order ID, or destination...',
                  )}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 bg-slate-50 dark:bg-slate-900"
                  data-testid="input-search-orders"
                />
              </div>
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger
                className="bg-slate-50 dark:bg-slate-900"
                data-testid="select-status-filter"
              >
                <SelectValue placeholder={t('admin.orders.filterByStatus', 'Filter by status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className=" " value="all">
                  {t('admin.orders.allStatuses', 'All Statuses')}
                </SelectItem>
                <SelectItem className="bg-" value="pending">
                  {t('common.pending', 'Pending')}
                </SelectItem>
                <SelectItem value="processing">
                  {t('admin.orders.processing', 'Processing')}
                </SelectItem>
                <SelectItem value="completed">
                  {t('admin.orders.completed', 'Completed')}
                </SelectItem>
                <SelectItem value="failed">{t('admin.orders.failed', 'Failed')}</SelectItem>
                <SelectItem value="cancelled">
                  {t('admin.orders.cancelled', 'Cancelled')}
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-slate-600 dark:text-slate-400">
                {filteredOrders?.length || 0} {t('admin.orders.orders', 'orders')}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>Failed to load orders: {(error as any).message || 'Server error'}. Please refresh or ensure your admin session is active.</span>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] })}>
            Retry
          </Button>
        </div>
      )}

      {/* Orders Table */}
      <Card className="border-0 shadow-lg">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableHead className="font-semibold">
                  {t('admin.orders.orderId', 'Order ID')}
                </TableHead>
                <TableHead className="font-semibold">
                  {t('admin.orders.customer', 'Customer')}
                </TableHead>
                <TableHead className="font-semibold">
                  {t('admin.orders.destination', 'Destination')}
                </TableHead>
                <TableHead className="font-semibold">
                  {t('admin.orders.package', 'Package')}
                </TableHead>
                <TableHead className="font-semibold">
                  {t('admin.orders.amount', 'Amount')}
                </TableHead>
                <TableHead className="font-semibold">
                  {t('admin.orders.status', 'Status')}
                </TableHead>
                <TableHead className="font-semibold">{t('common.date', 'Date')}</TableHead>
                <TableHead className="font-semibold text-right">
                  {t('common.actions', 'Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e5427]"></div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {t('admin.orders.loadingOrders', 'Loading orders...')}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : !paginatedOrders || paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Search className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {t('admin.orders.noOrdersFound', 'No orders found')}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {searchQuery || statusFilter !== 'all'
                          ? t('common.tryAdjustingFilters', 'Try adjusting your filters')
                          : t(
                            'admin.orders.ordersWillAppear',
                            'Orders will appear here once customers start purchasing',
                          )}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    data-testid={`row-order-${order.id}`}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {formatDisplayOrderId(order.displayOrderId)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {order.user?.name || (order.guestEmail ? 'Guest' : t('common.unassigned', 'Unassigned'))}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {order.user?.email || order.guestEmail ||
                            t('admin.orders.notAssignedToCustomer', 'Not assigned to customer')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {order.package?.destination?.image ? (
                          <img src={order.package.destination.image}
                            alt={order.package.destination.name}
                            className="w-5 h-5 rounded-full object-cover border" loading="lazy" />
                        ) : order.package?.destination?.countryCode ? (
                          <ReactCountryFlag
                            countryCode={order.package.destination.countryCode}
                            svg
                            style={{ width: '20px', height: '15px' }}
                            title={order.package.destination.name}
                          />
                        ) : (
                          <span className="text-xl">
                            {order.package?.destination?.flagEmoji ?? '🌍'}
                          </span>
                        )}
                        <span className="font-medium">
                          {order.package?.destination?.name ?? t('common.global', 'Global')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {order.dataAmount}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          {order.validity} {t('common.days', 'days')}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {/* ${order.price} */}
                      {formatPrice(order.price, order.currency || order.orderCurrency)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusStyles[order.status]} variant="outline">
                        {t(`common.status.${order.status}`, order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {formatOrderDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-actions-${order.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* View Details - Always available */}
                          <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('common.viewDetails', 'View Details')}
                          </DropdownMenuItem>

                          {/* Refresh Status - Always available */}
                          <DropdownMenuItem
                            onClick={() => refreshStatusMutation.mutate({ orderId: order.id })}
                            disabled={
                              refreshStatusMutation.isPending || order.status === 'refunded'
                            }
                            data-testid="button-refresh-status"
                          >
                            <RefreshCw
                              className={`h-4 w-4 mr-2 ${refreshStatusMutation.isPending ? 'animate-spin' : ''}`}
                            />
                            {t('admin.orders.refreshStatus', 'Refresh Status')}
                          </DropdownMenuItem>

                          {/* Refund - Only for completed orders */}
                          {order.status === 'completed' && (
                            <DropdownMenuItem
                              onClick={() => refundOrderMutation.mutate({ orderId: order.id })}
                              disabled={refundOrderMutation.isPending}
                              data-testid={`button-refund-${order.id}`}
                            >
                              <RefreshCw
                                className={`h-4 w-4 mr-2 ${refundOrderMutation.isPending ? 'animate-spin' : ''}`}
                              />
                              {t('admin.orders.refund', 'Refund')}
                            </DropdownMenuItem>
                          )}

                          {/* View eSIM - Only for completed orders with ICCID */}
                          {order.iccid && order.status === 'completed' && (
                            <DropdownMenuItem
                              onClick={() => setEsimDetailsOrderId(order.id)}
                              data-testid={`button-view-esim-${order.id}`}
                            >
                              <Smartphone className="mr-2 h-4 w-4" />
                              {t('admin.orders.viewEsim', 'View eSIM')}
                            </DropdownMenuItem>
                          )}

                          {/* Send Instructions - Only for completed orders with ICCID */}
                          {order.iccid && order.status === 'completed' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => sendInstructionsMutation.mutate(order.id)}
                                disabled={sendInstructionsMutation.isPending}
                              >
                                <Mail className="mr-2 h-4 w-4" />
                                {t('admin.orders.sendInstructions', 'Send Instructions')}
                              </DropdownMenuItem>
                            </>
                          )}

                          {/* Mark as Completed - Only for pending, processing, or failed orders */}
                          {['pending', 'processing', 'failed'].includes(order.status) && (
                            <DropdownMenuItem
                              onClick={() =>
                                updateOrderStatusMutation.mutate({
                                  orderId: order.id,
                                  status: 'completed',
                                })
                              }
                              disabled={updateOrderStatusMutation.isPending}
                              data-testid={`button-mark-complete-${order.id}`}
                            >
                              {t('admin.orders.markAsCompleted', 'Mark as Completed')}
                            </DropdownMenuItem>
                          )}

                          {/* Delete Order - Only for non-terminal states */}
                          {['pending', 'processing', 'failed'].includes(order.status) && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                if (
                                  confirm(
                                    t(
                                      'admin.orders.deleteConfirm',
                                      'Are you sure you want to delete this order?',
                                    ),
                                  )
                                ) {
                                  deleteOrderMutation.mutate(order.id);
                                }
                              }}
                              disabled={deleteOrderMutation.isPending}
                              data-testid={`button-delete-order-${order.id}`}
                            >
                              {t('admin.orders.deleteOrder', 'Delete Order')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filteredOrders && filteredOrders.length > itemsPerPage && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-6 py-4">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {t('common.showing', 'Showing')} {(currentPage - 1) * itemsPerPage + 1}{' '}
              {t('common.to', 'to')} {Math.min(currentPage * itemsPerPage, filteredOrders.length)}{' '}
              {t('common.of', 'of')} {filteredOrders.length} {t('admin.orders.orders', 'orders')}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className="w-8"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('admin.orders.orderDetails', 'Order Details')}</DialogTitle>
            <DialogDescription>
              {t('admin.orders.completeInformation', 'Complete information about this order')}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('admin.orders.orderId', 'Order ID')}
                  </p>
                  <p className="text-sm font-mono mt-1">
                    {formatDisplayOrderId(selectedOrder.displayOrderId)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('admin.orders.status', 'Status')}
                  </p>
                  <Badge className={`${statusStyles[selectedOrder.status]} mt-1`} variant="outline">
                    {selectedOrder.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('admin.orders.customer', 'Customer')}
                  </p>
                  <p className="text-sm mt-1">
                    {selectedOrder.user?.email || selectedOrder.guestEmail || t('common.unassigned', 'Unassigned')}
                  </p>
                  {selectedOrder.guestPhone && (
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedOrder.guestPhone}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('admin.orders.amount', 'Amount')}
                  </p>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    ${selectedOrder.price} {selectedOrder.currency || selectedOrder.orderCurrency || 'USD'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('admin.orders.package', 'Package')}
                  </p>
                  <p className="text-sm font-medium mt-1">
                    {selectedOrder.package?.title || `${selectedOrder.dataAmount} • ${selectedOrder.validity} ${t('common.days', 'days')}`}
                  </p>
                  {(selectedOrder.package?.destination?.name || (selectedOrder as any).destination?.name) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedOrder.package?.destination?.name || (selectedOrder as any).destination?.name}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('common.date', 'Date')}
                  </p>
                  <p className="text-sm mt-1">
                    {formatOrderDateTime(selectedOrder.createdAt)}
                  </p>
                </div>
              </div>
              {selectedOrder.iccid && (
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('admin.orders.iccid', 'ICCID')}
                  </p>
                  <p className="text-sm font-mono mt-1 select-all">{selectedOrder.iccid}</p>
                </div>
              )}
              {(selectedOrder.smdpAddress || selectedOrder.activationCode || selectedOrder.lpaCode) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border">
                  {selectedOrder.smdpAddress && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">SM-DP+ Address</p>
                      <p className="text-xs font-mono mt-1 break-all select-all">{selectedOrder.smdpAddress}</p>
                    </div>
                  )}
                  {selectedOrder.activationCode && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Activation Code</p>
                      <p className="text-xs font-mono mt-1 break-all select-all">{selectedOrder.activationCode}</p>
                    </div>
                  )}
                  {selectedOrder.lpaCode && (
                    <div className="col-span-full">
                      <p className="text-xs font-medium text-muted-foreground">LPA String</p>
                      <p className="text-xs font-mono mt-1 break-all select-all">{selectedOrder.lpaCode}</p>
                    </div>
                  )}
                </div>
              )}
              {selectedOrder.qrCodeUrl && (
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                    {t('admin.orders.qrCode', 'QR Code')}
                  </p>
                  <img src={selectedOrder.qrCodeUrl}
                    alt="QR Code"
                    className="w-48 h-48 border rounded-lg bg-white p-2" loading="lazy" />
                </div>
              )}

              {/* Failover History Section */}
              {(() => {
                const failoverAttempts = Array.isArray(selectedOrder.failoverAttempts)
                  ? (selectedOrder.failoverAttempts as FailoverAttempt[])
                  : [];
                const showFailoverSection =
                  selectedOrder.originalProviderId ||
                  selectedOrder.finalProviderId ||
                  failoverAttempts.length > 0;

                if (!showFailoverSection) return null;

                return (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <p className="text-sm font-medium">
                        {t('admin.orders.providerInfo', 'Provider Information')}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {selectedOrder.originalProviderId && (
                        <div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('admin.orders.originalProvider', 'Original Provider')}
                          </p>
                          <p className="text-sm font-medium mt-1">
                            {selectedOrder.originalProviderName || selectedOrder.originalProviderId}
                          </p>
                        </div>
                      )}
                      {selectedOrder.finalProviderId && (
                        <div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('admin.orders.finalProvider', 'Final Provider')}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm font-medium">
                              {selectedOrder.finalProviderName || selectedOrder.finalProviderId}
                            </p>
                            {selectedOrder.originalProviderId &&
                              selectedOrder.originalProviderId !==
                              selectedOrder.finalProviderId && (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 text-xs"
                                >
                                  {t('admin.orders.failover', 'Failover')}
                                </Badge>
                              )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Failover Attempts History */}
                    {failoverAttempts.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">
                          {t('admin.orders.failoverHistory', 'Failover History')}
                        </p>
                        <div className="space-y-2">
                          {failoverAttempts.map((attempt, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md text-sm"
                            >
                              {attempt.success ? (
                                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                              )}
                              <span className="font-medium">
                                {attempt.providerName || attempt.providerId}
                              </span>
                              {attempt.margin !== undefined && (
                                <Badge variant="outline" className="text-xs">
                                  {t('admin.orders.margin', '{margin}% margin', { margin: attempt.margin.toFixed(1) })}
                                </Badge>
                              )}
                              {attempt.error && (
                                <span className="text-red-500 text-xs truncate flex-1">
                                  {attempt.error}
                                </span>
                              )}
                              <span className="text-slate-400 text-xs ml-auto">
                                {new Date(attempt.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* eSIM Details Modal */}
      <ESimDetailsModal
        orderId={esimDetailsOrderId}
        isOpen={!!esimDetailsOrderId}
        onClose={() => setEsimDetailsOrderId(null)}
      />
    </div>
  );
}
