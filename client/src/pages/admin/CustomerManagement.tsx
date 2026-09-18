import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search,
  Eye,
  Download,
  ChevronLeft,
  ChevronRight,
  UserCircle,
  Package,
  Activity,
  CheckCircle,
  XCircle,
  Ban,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from "@/lib/utils";
import type { User, Order, Package as PackageType, Destination } from '@shared/schema';
import { MoreVertical } from 'lucide-react';
import { formatDisplayUserId, formatDisplayOrderId } from '@shared/utils';
import { useTranslation } from '@/contexts/TranslationContext';
import { useAdmin } from '@/hooks/use-admin';

type OrderWithDetails = Order & {
  package: PackageType & { destination?: Destination };
};



const userStatusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  blocked: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  deleted: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};


export default function CustomerManagement() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [kycFilter, setKycFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();

  const { user } = useAdmin();

  // ---------------------------------------------------------------------------
  // UPDATED BACKEND DATA FETCHING (pagination + search + kycFilter)
  // ---------------------------------------------------------------------------

  const { data: customersRes, isLoading } = useQuery({
    queryKey: ['/api/admin/customers', currentPage, searchQuery, kycFilter, statusFilter, itemsPerPage],
    queryFn: () =>
      fetch(
        `/api/admin/customers?page=${currentPage}&limit=${itemsPerPage}&search=${searchQuery}&kycStatus=${kycFilter}&status=${statusFilter}`,
      ).then((res) => res.json()),
  });

  const customers = customersRes?.data?.data || [];
  const pagination = customersRes?.data?.pagination || {};
  const totalPages = pagination.totalPages || 1;
  const totalItems = pagination.total || 0;
  const stats = customersRes?.data?.stats || {};

  // console.log("Customers Res:", customersRes);

  // ---------------------------------------------------------------------------
  // Existing orders fetch
  // ---------------------------------------------------------------------------

  const { data: customerOrders } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/admin/orders', selectedCustomer?.id],
    enabled: !!selectedCustomer,
  });

  // ---------------------------------------------------------------------------
  // Mutations (UNCHANGED)
  // ---------------------------------------------------------------------------

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ customerId, data }: { customerId: string; data: Partial<User> }) => {
      return await apiRequest('PATCH', `/api/admin/customers/${customerId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.customers.updateSuccess', 'Customer updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('admin.customers.failedToUpdate', 'Failed to update customer'),
        variant: 'destructive',
      });
    },
  });

  const updateKycMutation = useMutation({
    mutationFn: async ({ customerId, kycStatus }: { customerId: string; kycStatus: string }) => {
      return await apiRequest('PATCH', `/api/admin/customers/${customerId}`, { kycStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
      toast({
        title: t('common.success', 'Success'),
        description: t(
          'admin.customers.kycStatusUpdated',
          'Customer KYC status updated successfully',
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description:
          error.message || t('admin.customers.failedToUpdateKyc', 'Failed to update KYC status'),
        variant: 'destructive',
      });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return await apiRequest('DELETE', `/api/admin/customers/${customerId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.customers.deleteSuccess', 'Customer deleted successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description:
          error.message || t('admin.customers.failedToDelete', 'Failed to delete customer'),
        variant: 'destructive',
      });
    },
  });

  // State for premium confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive' | 'warning';
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => { },
  });

  const handleConfirm = (config: {
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive' | 'warning';
  }) => {
    setConfirmDialog({
      open: true,
      ...config,
    });
  };

  const createCustomerMutation = useMutation({
    mutationFn: async ({ email, name }: { email: string; name: string }) => {
      return await apiRequest('POST', '/api/admin/customers', { email, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
      setCreateDialogOpen(false);
      setNewCustomerEmail('');
      setNewCustomerName('');
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.customers.createSuccess', 'Customer created successfully'),
      });
    },
    onError: (error: any) => {
      const isDuplicate = error.message?.includes('Email already exists');
      toast({
        title: t('common.error', 'Error'),
        description: isDuplicate
          ? t('admin.customers.emailExists', 'User with this email already exists')
          : (error.message || t('admin.customers.failedToCreate', 'Failed to create customer')),
        variant: 'destructive',
      });
    },
  });

  // ---------------------------------------------------------------------------
  // CSV Export Function (UNCHANGED)
  // ---------------------------------------------------------------------------

  const exportToCSV = async () => {
    try {

      if (user?.email === "de****@di***") {
        return toast({
          title: t("common.error", "Error"),
          description: t('admin.customers.demoUserRestriction', 'Demo users are not allowed to perform this action'),
          variant: 'destructive',
        })
      }

      const res = await fetch(`/api/admin/customers?page=1&limit=1000000`);

      const json = await res.json();
      const allCustomers = json?.data?.data || [];

      if (!allCustomers.length) {
        toast({
          title: t('common.noData', 'No Data'),
          description: t(
            'admin.customers.noCustomersToExport',
            'There are no customers to export.',
          ),
          variant: 'destructive',
        });
        return;
      }

      const headers = [
        t('admin.customers.customerId', 'Customer ID'),
        t('common.name', 'Name'),
        t('common.email', 'Email'),
        t('admin.customers.phone', 'Phone'),
        t('admin.customers.address', 'Address'),
        t('admin.customers.kycStatus', 'KYC Status'),
        t('admin.customers.accountStatus', 'Account Status'),
        t('admin.customers.joinedDate', 'Joined Date'),
      ];

      const rows = allCustomers.map((customer) => [
        formatDisplayUserId(customer.displayUserId),
        customer.name || '',
        customer.email,
        customer.phone || '',
        customer.address || '',
        customer.kycStatus,
        customer.isDeleted ? 'Deleted' : customer.isBlocked ? 'Blocked' : 'Active',
        new Date(customer.createdAt).toLocaleDateString(),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      toast({
        title: t('admin.customers.exportSuccess', 'Export Successful'),
        description: t(
          'admin.customers.exportedCustomers',
          `Exported ${allCustomers.length} customers to CSV.`,
        ),
      });
    } catch (err) {
      toast({
        title: t('common.error', 'Error'),
        description: 'Failed to export customers.',
        variant: 'destructive',
      });
    }
  };

  // ---------------------------------------------------------------------------
  // KYC Status Styles (unchanged)
  // ---------------------------------------------------------------------------

  const kycStatusStyles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    verified: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  // ---------------------------------------------------------------------------
  // START OF JSX (UNCHANGED — FULL UI PRESERVED)
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 lg:p-8 space-y-6 dark:text-white">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            {t('adminPanel.admin.customers.title', 'Customer Management')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {t('adminPanel.admin.customers.description', 'View and manage all registered customers')}
          </p>
        </div>
        <div className="flex gap-2 flex-col md:flex-row">
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-customer">
            {t('adminPanel.admin.customers.createCustomer', 'Create Customer')}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={exportToCSV}
            data-testid="button-export-customers"
          >
            <Download className="h-4 w-4" />
            {t('adminPanel.admin.customers.exportCustomers', 'Export Customers')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="border-0 bg-gradient-to-br from-teal-50 to-indigo-50 dark:from-teal-950/30 dark:to-indigo-950/30 shadow-lg p-6"
          data-testid="card-total-customers-stat"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-teal-600 dark:text-teal-400">
                {t('adminPanel.admin.customers.totalCustomers', 'Total Customers')}
              </p>
              <h3
                className="text-2xl font-bold text-slate-900 dark:text-white mt-1"
                data-testid="text-total-customers-count"
              >
                {totalItems}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark">
              <UserCircle className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card
          className="border-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-lg p-6"
          data-testid="card-verified-customers"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                {t('adminPanel.admin.customers.verified', 'Verified')}
              </p>
              <h3
                className="text-2xl font-bold text-slate-900 dark:text-white mt-1"
                data-testid="text-verified-count"
              >
                {stats?.totalVerified}
              </h3>
            </div>
          </div>
        </Card>

        <Card
          className="border-0 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 shadow-lg p-6"
          data-testid="card-blocked-customers"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                {t('adminPanel.admin.customers.blockedCustomer', 'Blocked Customers')}
              </p>
              <h3
                className="text-2xl font-bold text-slate-900 dark:text-white mt-1"
                data-testid="text-blocked-count"
              >
                {stats?.totalBlocked || 0}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-600">
              <Ban className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-lg">
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-5 items-end">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={t(
                    'adminPanel.admin.customers.searchPlaceholder',
                    'Search by name, email, or ID...',
                  )}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 bg-slate-50 dark:bg-slate-900"
                  data-testid="input-search-customers"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider px-1">
                {t("adminPanel.admin.customers.kycStatus", "KYC Status")}
              </label>
              <Select
                value={kycFilter}
                onValueChange={(value) => {
                  setKycFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
                  <SelectValue
                    placeholder={t('adminPanel.admin.customers.filterByKyc', 'Filter by KYC status')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('adminPanel.admin.customers.allKyc', 'All KYC')}
                  </SelectItem>
                  <SelectItem value="pending">{t('common.common.pending', 'Pending')}</SelectItem>
                  <SelectItem value="approved">
                    {t('adminPanel.admin.customers.approved', 'Approved')}
                  </SelectItem>
                  <SelectItem value="submitted">
                    {t('adminPanel.admin.customers.submitted', 'Submitted')}
                  </SelectItem>
                  <SelectItem value="rejected">
                    {t('adminPanel.admin.customers.rejected', 'Rejected')}
                  </SelectItem>
                  <SelectItem value="verified">
                    {t('adminPanel.admin.customers.verified', 'Verified')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider px-1">
                {t("adminPanel.admin.customers.accountStatus", "Account Status")}
              </label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
                  <SelectValue
                    placeholder={t('admin.customers.filterByStatus', 'Filter by status')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('adminPanel.admin.customers.allStatuses', 'All Statuses')}
                  </SelectItem>
                  <SelectItem value="active">{t('adminPanel.admin.customers.activeCustomers', 'Active')}</SelectItem>
                  <SelectItem value="blocked">{t('adminPanel.admin.customers.blockedCustomers', 'Blocked')}</SelectItem>
                  <SelectItem value="deleted">{t('adminPanel.admin.customers.deletedCustomers', 'Deleted')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-slate-600 dark:text-slate-400">
                {totalItems} {t('adminPanel.admin.customers.customers', 'customers')}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

    

      {/* Customers Table */}
      <Card className="border-0 shadow-lg">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableHead className="font-semibold">
                  {t('adminPanel.admin.customers.customerId', 'Customer ID')}
                </TableHead>
                <TableHead className="font-semibold">{t('adminPanel.admin.customers.table.customer', 'Name')}</TableHead>
                <TableHead className="font-semibold">{t('adminPanel.admin.customers.table.email', 'Email')}</TableHead>
                <TableHead className="font-semibold">
                  {t('adminPanel.admin.customers.phone', 'Phone')}
                </TableHead>
                <TableHead className="font-semibold">
                  {t('adminPanel.admin.customers.table.status', 'KYC Status')}
                </TableHead>
                <TableHead className="font-semibold">
                  {t("adminPanel.admin.customers.table.userStatus", "User Status")}
                </TableHead>

                <TableHead className="font-semibold">
                  {t('adminPanel.admin.customers.joined', 'Joined')}
                </TableHead>
                <TableHead className="font-semibold text-right">
                  {t('common.common.actions', 'Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {t('admin.customers.loadingCustomers', 'Loading customers...')}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <UserCircle className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {t('adminPanel.admin.customers.noCustomersFound', 'No customers found')}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {searchQuery || kycFilter !== 'all'
                          ? t('common.tryAdjustingFilters', 'Try adjusting your filters')
                          : t(
                            'admin.customers.customersWillAppear',
                            'Customers will appear here once they register',
                          )}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    data-testid={`row-customer-${customer.id}`}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {formatDisplayUserId(customer.displayUserId)}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white text-xs font-semibold">
                          {customer.name?.charAt(0).toUpperCase() ||
                            customer.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">
                          {customer.name || t('common.na', 'N/A')}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {customer.email}
                    </TableCell>

                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {customer.phone || t('common.na', 'N/A')}
                    </TableCell>

                    <TableCell>
                      <Badge className={kycStatusStyles[customer.kycStatus]} variant="outline">
                        {customer.kycStatus}
                      </Badge>
                    </TableCell>


                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          className={
                            customer.isDeleted
                              ? userStatusStyles.deleted
                              : customer.isBlocked
                                ? userStatusStyles.blocked
                                : userStatusStyles.active
                          }
                          variant="outline"
                        >
                          {customer.isDeleted ? 'Deleted' : customer.isBlocked ? 'Blocked' : 'Active'}
                        </Badge>
                      </div>
                    </TableCell>


                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-actions-customer-${customer.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedCustomer(customer)}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('common.common.viewDetails', 'View Details')}
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => {
                              const actionName = customer.isBlocked ? 'unblock' : 'block';
                              const title = customer.isBlocked
                                ? t('adminPanel.admin.customers.unblockTitle', 'Unblock Customer')
                                : t('adminPanel.admin.customers.blockTitle', 'Block Customer');

                              const description = customer.isBlocked
                                ? t('adminPanel.admin.customers.unblockConfirm', 'Are you sure you want to unblock this customer? They will regain access to their account.')
                                : t('adminPanel.admin.customers.blockConfirm', 'Are you sure you want to block this customer? They will be immediately logged out and prevented from accessing their account.');

                              handleConfirm({
                                title,
                                description,
                                confirmText: customer.isBlocked ? t('common.unblock', 'Unblock') : t('common.block', 'Block'),
                                variant: customer.isBlocked ? 'default' : 'destructive',
                                onConfirm: () => {
                                  updateCustomerMutation.mutate({
                                    customerId: customer.id,
                                    data: { isBlocked: !customer.isBlocked },
                                  });
                                }
                              });
                            }}
                            disabled={updateCustomerMutation.isPending}
                          >
                            {customer.isBlocked ? (
                              <>
                                <ShieldCheck className="mr-2 h-4 w-4 text-green-600" />
                                {t('adminPanel.admin.customers.unblockCustomer', 'Unblock Customer')}
                              </>
                            ) : (
                              <>
                                <Ban className="mr-2 h-4 w-4 text-orange-600" />
                                {t('adminPanel.admin.customers.blockCustomer', 'Block Customer')}
                              </>
                            )}
                          </DropdownMenuItem>

                          {/* <DropdownMenuItem
                            onClick={() =>
                              updateKycMutation.mutate({
                                customerId: customer.id,
                                kycStatus: 'verified',
                              })
                            }
                            disabled={
                              updateKycMutation.isPending || customer.kycStatus === 'verified'
                            }
                          >
                            <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                            {t('admin.customers.verifyKyc', 'Verify KYC')}
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() =>
                              updateKycMutation.mutate({
                                customerId: customer.id,
                                kycStatus: 'rejected',
                              })
                            }
                            disabled={
                              updateKycMutation.isPending || customer.kycStatus === 'rejected'
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4 text-red-600" />
                            {t('admin.customers.rejectKyc', 'Reject KYC')}
                          </DropdownMenuItem> */}

                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              handleConfirm({
                                title: t('admin.customers.deleteTitle', 'Delete Customer'),
                                description: t(
                                  'adminPanel.admin.customers.deleteConfirm',
                                  'Are you sure you want to delete this customer? This action cannot be undone and will permanently deactivate their account.',
                                ),
                                confirmText: t('common.delete', 'Delete'),
                                variant: 'destructive',
                                onConfirm: () => {
                                  deleteCustomerMutation.mutate(customer.id);
                                }
                              });
                            }}
                            disabled={deleteCustomerMutation.isPending}
                            data-testid={`button-delete-customer-${customer.id}`}
                          >
                            {t('adminPanel.admin.customers.deleteCustomer', 'Delete Customer')}
                          </DropdownMenuItem>
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
        {totalPages > 1 && (
          <div className="flex flex-col md:flex-row items-center justify-between border-t border-slate-200 dark:border-slate-800 px-6 py-4 gap-4">
            <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              <div>
                {t('common.showing', 'Showing')} {(currentPage - 1) * itemsPerPage + 1}{' '}
                {t('common.to', 'to')} {Math.min(currentPage * itemsPerPage, totalItems)}{' '}
                {t('common.of', 'of')} {totalItems} {t('admin.customers.customers', 'customers')}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">
                  {t('common.perPage', 'Per Page')}
                </span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px] bg-slate-50 dark:bg-slate-900">
                    <SelectValue placeholder="Limit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1">
                {(() => {
                  const delta = 1;
                  const range = [];
                  for (
                    let i = Math.max(2, currentPage - delta);
                    i <= Math.min(totalPages - 1, currentPage + delta);
                    i++
                  ) {
                    range.push(i);
                  }

                  if (currentPage - delta > 2) {
                    range.unshift('...');
                  }
                  if (currentPage + delta < totalPages - 1) {
                    range.push('...');
                  }

                  range.unshift(1);
                  if (totalPages > 1) {
                    range.push(totalPages);
                  }

                  return range.map((page, index) => {
                    if (page === '...') {
                      return (
                        <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
                          ...
                        </span>
                      );
                    }
                    return (
                      <Button
                        key={`page-${page}`}
                        variant={currentPage === page ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page as number)}
                        className="w-8"
                      >
                        {page}
                      </Button>
                    );
                  });
                })()}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Customer Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('adminPanel.admin.customers.createNewCustomer', 'Create New Customer')}
            </DialogTitle>
            <DialogDescription>
              {t('adminPanel.admin.customers.addNewCustomer', 'Add a new customer to the system')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('common.email', 'Email')}</label>
              <Input
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                data-testid="input-create-customer-email"
              />
            </div>

            <div>
              <label className="text-sm font-medium">{t('common.name', 'Name')}</label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="John Doe"
                data-testid="input-create-customer-name"
              />
            </div>

            <Button
              onClick={() =>
                createCustomerMutation.mutate({ email: newCustomerEmail, name: newCustomerName })
              }
              disabled={!newCustomerEmail || createCustomerMutation.isPending}
              className="w-full"
              data-testid="button-submit-create-customer"
            >
              {createCustomerMutation.isPending
                ? t('adminPanel.admin.customers.creating', 'Creating...')
                : t('adminPanel.admin.customers.createCustomer', 'Create Customer')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Details Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="dialog-customer-details">
          <DialogHeader>
            <DialogTitle>{t('adminPanel.admin.customers.customerDetails', 'Customer Details')}</DialogTitle>
            <DialogDescription>
              {t('adminPanel.admin.customers.completeInformation', 'Complete information about this customer')}
            </DialogDescription>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/50">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-gradient text-white text-2xl font-semibold">
                  {selectedCustomer.name?.charAt(0).toUpperCase() ||
                    selectedCustomer.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {selectedCustomer.name || t('admin.customers.customer', 'Customer')}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedCustomer.email}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details" data-testid="tab-customer-details">
                    {t('adminPanel.admin.customers.details', 'Details')}
                  </TabsTrigger>
                  <TabsTrigger value="orders" data-testid="tab-customer-orders">
                    {t('adminPanel.admin.customers.orders', 'Orders')} (
                    {customerOrders?.filter((o) => o.userId === selectedCustomer.id).length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="activity" data-testid="tab-customer-activity">
                    {t('adminPanel.admin.customers.activity', 'Activity')}
                  </TabsTrigger>
                </TabsList>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {t('adminPanel.admin.customers.customerId', 'Customer ID')}
                      </p>
                      <p className="text-sm font-mono mt-1">
                        {formatDisplayUserId(selectedCustomer.displayUserId)}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {t('adminPanel.admin.customers.kycStatus', 'KYC Status')}
                      </p>
                      <Badge
                        className={`${kycStatusStyles[selectedCustomer.kycStatus]} mt-1`}
                        variant="outline"
                      >
                        {selectedCustomer.kycStatus}
                      </Badge>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {t('adminPanel.admin.customers.phoneNumber', 'Phone Number')}
                      </p>
                      <p className="text-sm mt-1">
                        {selectedCustomer.phone || t('adminPanel.admin.customers.notProvided', 'Not provided')}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {t('adminPanel.admin.customers.joinedDate', 'Joined Date')}
                      </p>
                      <p className="text-sm mt-1">
                        {new Date(selectedCustomer.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {t('adminPanel.admin.customers.address', 'Address')}
                      </p>
                      <p className="text-sm mt-1">
                        {selectedCustomer.address ||
                          t('adminPanel.admin.customers.notProvided', 'Not provided')}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {t('adminPanel.admin.customers.lastUpdated', 'Last Updated')}
                      </p>
                      <p className="text-sm mt-1">
                        {new Date(selectedCustomer.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* eSIM Statistics */}
                  <div className="grid grid-cols-3 gap-3 pt-4">
                    <Card className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Total eSIMs
                        </p>
                      </div>
                      <p className="text-2xl font-bold">
                        {customerOrders?.filter((o) => o.userId === selectedCustomer.id).length ||
                          0}
                      </p>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Active eSIMs
                        </p>
                      </div>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {customerOrders?.filter(
                          (o) => o.userId === selectedCustomer.id && o.status === 'completed',
                        ).length || 0}
                      </p>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <XCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Failed
                        </p>
                      </div>
                      <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                        {customerOrders?.filter(
                          (o) => o.userId === selectedCustomer.id && o.status === 'failed',
                        ).length || 0}
                      </p>
                    </Card>
                  </div>
                </TabsContent>

                {/* Orders Tab */}
                <TabsContent value="orders">
                  <ScrollArea className="h-[400px] pr-4">
                    {customerOrders &&
                      customerOrders.filter((o) => o.userId === selectedCustomer.id).length > 0 ? (
                      <div className="space-y-3">
                        {customerOrders
                          .filter((o) => o.userId === selectedCustomer.id)
                          .map((order) => (
                            <Card
                              key={order.id}
                              className="p-4"
                              data-testid={`card-customer-order-${order.id}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-2xl">
                                      {order.package.destination?.flagEmoji || '🌍'}
                                    </span>
                                    <div>
                                      <p className="font-semibold text-slate-900 dark:text-white">
                                        {order.package.destination?.name || 'Global'}
                                      </p>
                                      <p className="text-xs text-slate-600 dark:text-slate-400">
                                        {order.dataAmount} • {order.validity} days
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                      <span className="text-slate-600 dark:text-slate-400">
                                        Order ID:
                                      </span>
                                      <p className="font-mono">
                                        {formatDisplayOrderId(order.displayOrderId)}
                                      </p>
                                    </div>

                                    <div>
                                      <span className="text-slate-600 dark:text-slate-400">
                                        Price:
                                      </span>
                                      <p className="font-semibold">${order.price}</p>
                                    </div>

                                    <div>
                                      <span className="text-slate-600 dark:text-slate-400">
                                        Date:
                                      </span>
                                      <p>{new Date(order.createdAt).toLocaleDateString()}</p>
                                    </div>
                                  </div>

                                  {order.iccid && (
                                    <div className="mt-2 text-xs">
                                      <span className="text-slate-600 dark:text-slate-400">
                                        ICCID:
                                      </span>
                                      <p className="font-mono text-slate-900 dark:text-white">
                                        {order.iccid}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                <Badge
                                  className={
                                    order.status === 'completed'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                      : order.status === 'processing'
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400'
                                        : order.status === 'failed'
                                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  }
                                  variant="outline"
                                >
                                  {order.status}
                                </Badge>
                              </div>
                            </Card>
                          ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <Package className="h-12 w-12 text-slate-400 mb-3" />
                        <p className="font-medium text-slate-900 dark:text-white">No Orders Yet</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          This customer hasn't made any purchases
                        </p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                {/* Activity Tab */}
                <TabsContent value="activity">
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      <div className="flex gap-3" data-testid="activity-account-created">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
                          <UserCircle className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Account Created</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {new Date(selectedCustomer.createdAt).toLocaleDateString()} at{' '}
                            {new Date(selectedCustomer.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3" data-testid="activity-kyc-status">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${selectedCustomer.kycStatus === 'verified'
                            ? 'bg-green-100 dark:bg-green-900/30'
                            : selectedCustomer.kycStatus === 'rejected'
                              ? 'bg-red-100 dark:bg-red-900/30'
                              : 'bg-yellow-100 dark:bg-yellow-900/30'
                            }`}
                        >
                          <Activity
                            className={`h-4 w-4 ${selectedCustomer.kycStatus === 'verified'
                              ? 'text-green-600 dark:text-green-400'
                              : selectedCustomer.kycStatus === 'rejected'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-yellow-600 dark:text-yellow-400'
                              }`}
                          />
                        </div>

                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            KYC Status: {selectedCustomer.kycStatus}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Current verification status
                          </p>
                        </div>
                      </div>

                      {customerOrders
                        ?.filter((o) => o.userId === selectedCustomer.id)
                        .map((order) => (
                          <div
                            key={order.id}
                            className="flex gap-3"
                            data-testid={`activity-order-${order.id}`}
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
                              <Package className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            </div>

                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                Purchased eSIM for {order.package.destination?.name || 'Global'}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                {new Date(order.createdAt).toLocaleDateString()} • ${order.price} •{' '}
                                {order.status}
                              </p>
                            </div>
                          </div>
                        ))}

                      {(!customerOrders ||
                        customerOrders.filter((o) => o.userId === selectedCustomer.id).length ===
                        0) && (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Activity className="h-12 w-12 text-slate-400 mb-3" />
                            <p className="font-medium text-slate-900 dark:text-white">
                              No Activity Yet
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              Customer activity will appear here
                            </p>
                          </div>
                        )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-md border-0 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn(
                "p-2 rounded-full",
                confirmDialog.variant === 'destructive' ? "bg-red-100 dark:bg-red-900/30 text-red-600" :
                  confirmDialog.variant === 'warning' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600" :
                    "bg-teal-100 dark:bg-teal-900/30 text-teal-600"
              )}>
                {confirmDialog.variant === 'destructive' ? <ShieldAlert className="h-5 w-5" /> :
                  confirmDialog.variant === 'warning' ? <ShieldAlert className="h-5 w-5" /> :
                    <ShieldCheck className="h-5 w-5" />}
              </div>
              <AlertDialogTitle className="text-xl font-bold tracking-tight">
                {confirmDialog.title}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel className="rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800">
              {confirmDialog.cancelText || t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "rounded-xl font-semibold shadow-lg transition-all duration-200 active:scale-95",
                confirmDialog.variant === 'destructive'
                  ? "bg-gradient-to-r from-red-600 to-red-600 hover:from-red-700 hover:to-red-700 shadow-red-500/20"
                  : confirmDialog.variant === 'warning'
                    ? "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-orange-500/20"
                    : "bg-gradient-to-r from-teal-600 to-teal-600 hover:from-teal-700 hover:to-teal-700 shadow-teal-500/20"
              )}
              onClick={() => {
                confirmDialog.onConfirm();
              }}
            >
              {confirmDialog.confirmText || t('common.confirm', 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
