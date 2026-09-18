import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Bell,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { User } from '@shared/schema';
import { useTranslation } from '@/contexts/TranslationContext';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationHistoryItem {
  id: string;
  iccid: string;
  type: string;
  processed: boolean;
  emailSent: boolean;
  error: string | null;
  webhookPayload: any;
  createdAt: string;
}

interface NotificationHistoryResponse {
  notifications: NotificationHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

// Note: These labels will be translated dynamically in getTypeInfo function

export default function NotificationHistory() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [processedFilter, setProcessedFilter] = useState<boolean | null>(null);
  const [emailSentFilter, setEmailSentFilter] = useState<boolean | null>(null);
  const [iccidSearch, setIccidSearch] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<NotificationHistoryItem | null>(
    null,
  );
  const [showCustomNotificationModal, setShowCustomNotificationModal] = useState(false);
  const [open, setOpen] = useState(false);
  // Custom notification form state
  const [customSubject, setCustomSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [recipientType, setRecipientType] = useState<'all' | 'single'>('all');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendInApp, setSendInApp] = useState(true);

  const itemsPerPage = 20;
  const { toast } = useToast();

  const [search, setSearch] = useState('');

  const { data: customersRes } = useQuery<User[]>({
    queryKey: ['/api/admin/customers', search],
    queryFn: () => fetch(`/api/admin/customers?search=${search}`).then((res) => res.json()),
  });

  // console.log(customersRes);

  const customers = customersRes?.data?.data;

  const { data: statsRes, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/notifications/stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/notifications/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const stats = statsRes?.data;

  const notificationStats = stats?.notifications;
  const customStats = stats?.customNotifications;

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.append('page', currentPage.toString());
    params.append('limit', itemsPerPage.toString());

    if (sourceFilter !== 'all') {
      params.append('source', sourceFilter);
    }
    if (typeFilter !== 'all') {
      params.append('type', typeFilter);
    }
    if (iccidSearch) {
      params.append('iccid', iccidSearch);
    }
    if (processedFilter !== null) {
      params.append('processed', processedFilter.toString());
    }
    if (emailSentFilter !== null) {
      params.append('emailSent', emailSentFilter.toString());
    }

    return params.toString();
  };

  const { data: historyData, isLoading } = useQuery<NotificationHistoryResponse>({
    queryKey: [
      '/api/admin/notifications/history',
      currentPage,
      sourceFilter,
      typeFilter,
      iccidSearch,
      processedFilter,
      emailSentFilter,
    ],
    queryFn: async () => {
      const response = await fetch(`/api/admin/notifications/history?${buildQueryParams()}`);
      if (!response.ok)
        throw new Error(
          t('adminPanel.admin.notifications.error.fetchFailed', 'Failed to fetch notification history'),
        );
      return response.json();
    },
  });

  const sendCustomNotificationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/notifications/send-custom', {
        subject: customSubject,
        message: customMessage,
        recipientType,
        recipientUserId: recipientType === 'single' ? recipientUserId : undefined,
        sendEmail,
        sendInApp,
      });
    },
    onSuccess: (data: any) => {
      const parts = [];
      if (sendEmail && data.emailsSent > 0) {
        parts.push(
          t('adminPanel.admin.notifications.success.emailsSent', `${data.emailsSent} email(s) sent`, {
            count: data.emailsSent,
          }),
        );
      }
      if (sendInApp && data.inAppSent > 0) {
        parts.push(
          t(
            'adminPanel.admin.notifications.success.inAppSent',
            `${data.inAppSent} in-app notification(s) sent`,
            { count: data.inAppSent },
          ),
        );
      }
      toast({
        title: t('adminPanel.admin.notifications.success.title', 'Success'),
        description:
          parts.length > 0
            ? parts.join(', ')
            : t('adminPanel.admin.notifications.success.sent', 'Notification sent successfully'),
      });
      setCustomSubject('');
      setCustomMessage('');
      setRecipientUserId('');
      setShowCustomNotificationModal(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notifications/history'] });
    },
    onError: (error: any) => {
      toast({
        title: t('adminPanel.admin.notifications.error.title', 'Error'),
        description:
          error.message || t('adminPanel.admin.notifications.error.sendFailed', 'Failed to send notification'),
        variant: 'destructive',
      });
    },
  });

  const notifications = historyData?.notifications || [];
  const totalPages = historyData ? Math.ceil(historyData.total / itemsPerPage) : 1;

  const handleExportCSV = () => {
    if (!notifications || notifications.length === 0) {
      toast({
        title: t('adminPanel.admin.notifications.export.noData', 'No Data'),
        description: t('adminPanel.admin.notifications.export.noNotifications', 'No notifications to export'),
        variant: 'destructive',
      });
      return;
    }

    const headers = [
      t('adminPanel.admin.notifications.table.timestamp', 'Timestamp'),
      t('adminPanel.admin.notifications.table.type', 'Type'),
      t('adminPanel.admin.notifications.table.iccid', 'ICCID'),
      t('adminPanel.admin.notifications.table.processed', 'Processed'),
      t('adminPanel.admin.notifications.table.emailSent', 'Email Sent'),
      t('adminPanel.admin.notifications.table.error', 'Error'),
    ];
    const csvContent = [
      headers.join(','),
      ...notifications.map((n) =>
        [
          new Date(n.createdAt).toISOString(),
          n.type,
          n.iccid,
          n.processed
            ? t('adminPanel.admin.notifications.csv.yes', 'Yes')
            : t('adminPanel.admin.notifications.csv.no', 'No'),
          n.emailSent
            ? t('adminPanel.admin.notifications.csv.yes', 'Yes')
            : t('adminPanel.admin.notifications.csv.no', 'No'),
          n.error ? `"${n.error.replace(/"/g, '""')}"` : t('adminPanel.admin.notifications.csv.none', 'None'),
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notification-history-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: t('adminPanel.admin.notifications.export.success', 'Export Successful'),
      description: t(
        'adminPanel.admin.notifications.export.description',
        'Notification history exported to CSV',
      ),
    });
  };

  const getTypeInfo = (type: string) => {
    const typeMap: Record<
      string,
      { variant: 'default' | 'secondary' | 'outline'; labelKey: string; color: string }
    > = {
      '75': {
        variant: 'outline',
        labelKey: 'adminPanel.admin.notifications.type.lowData75',
        color: 'text-yellow-600 dark:text-yellow-400',
      },
      '90': {
        variant: 'outline',
        labelKey: 'adminPanel.admin.notifications.type.lowData90',
        color: 'text-orange-600 dark:text-orange-400',
      },
      '3days': {
        variant: 'outline',
        labelKey: 'adminPanel.admin.notifications.type.expiring3Days',
        color: 'text-teal-600 dark:text-teal-400',
      },
      '1day': {
        variant: 'outline',
        labelKey: 'adminPanel.admin.notifications.type.expiring1Day',
        color: 'text-red-600 dark:text-red-400',
      },
      custom: {
        variant: 'outline',
        labelKey: 'adminPanel.admin.notifications.type.custom',
        color: 'text-teal-600 dark:text-teal-400',
      },
    };

    const typeInfo = typeMap[type];
    if (typeInfo) {
      const fallback =
        type === '75'
          ? 'Low Data 75%'
          : type === '90'
            ? 'Low Data 90%'
            : type === '3days'
              ? 'Expiring 3 Days'
              : type === '1day'
                ? 'Expiring 1 Day'
                : 'Custom';
      return {
        variant: typeInfo.variant,
        label: t(typeInfo.labelKey, fallback),
        color: typeInfo.color,
      };
    }
    return {
      variant: 'secondary' as const,
      label: type,
      color: 'text-gray-600 dark:text-gray-400',
    };
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent leading-tight">
            {t('adminPanel.admin.notifications.title', 'Notifications')}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1 leading-snug">
            {t(
              'adminPanel.admin.notifications.description',
              'View notification history and send custom notifications to customers',
            )}
          </p>
        </div>

        <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setShowCustomNotificationModal(true)}
            className="flex-1 gap-2 h-11 sm:h-10 order-1 sm:order-none"
            data-testid="button-new-notification"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('adminPanel.admin.notifications.button.new', 'New Notification')}</span>
          </Button>
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="flex-1 gap-2 h-11 sm:h-10 order-2 sm:order-none"
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('adminPanel.admin.notifications.button.export', 'Export CSV')}</span>
          </Button>
        </div>
      </div>


      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Notifications */}
        <Card className="shadow-md">
          <CardContent className="p-4 flex items-center gap-4">
            <Bell className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">
                {t('adminPanel.admin.notifications.stats.total', 'Total Notifications')}
              </p>
              <p className="text-2xl font-bold">
                {statsLoading ? '—' : (notificationStats?.total ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Unread */}
        <Card className="shadow-md">
          <CardContent className="p-4 flex items-center gap-4">
            <AlertCircle className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">
                {t('adminPanel.admin.notifications.stats.unread', 'Unread')}
              </p>
              <p className="text-2xl font-bold">
                {statsLoading ? '—' : (notificationStats?.unread ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Emails Sent */}
        <Card className="shadow-md">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-sm text-muted-foreground">
                {t('adminPanel.admin.notifications.stats.emailsSent', 'Emails Sent')}
              </p>
              <p className="text-2xl font-bold">
                {statsLoading ? '—' : (customStats?.totalEmailsSent ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Emails Failed */}
        <Card className="shadow-md">
          <CardContent className="p-4 flex items-center gap-4">
            <XCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">
                {t('adminPanel.admin.notifications.stats.emailsFailed', 'Emails Failed')}
              </p>
              <p className="text-2xl font-bold">
                {statsLoading ? '—' : (customStats?.totalEmailsFailed ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t('adminPanel.admin.notifications.filters.title', 'Filters')}
          </CardTitle>
          <CardDescription>
            {t(
              'adminPanel.admin.notifications.filters.description',
              'Filter notification history by type, status, and ICCID',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Source Filter */}
            <div className="space-y-2">
              <Label>{t('adminPanel.admin.notifications.filters.source', 'Notification Source')}</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger data-testid="select-source-filter">
                  <SelectValue
                    placeholder={t('adminPanel.admin.notifications.filters.allSources', 'All Sources')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('adminPanel.admin.notifications.filters.allSources', 'All Sources')}
                  </SelectItem>
                  <SelectItem value="airalo">
                    {t('adminPanel.admin.notifications.filters.airaloWebhook', 'Airalo Webhook')}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t('adminPanel.admin.notifications.filters.customNotification', 'Custom Notification')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="space-y-2">
              <Label>{t('adminPanel.admin.notifications.filters.typeLabel', 'Notification Type')}</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-type-filter">
                  <SelectValue
                    placeholder={t('adminPanel.admin.notifications.filters.allTypes', 'All Types')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('adminPanel.admin.notifications.filters.allTypes', 'All Types')}
                  </SelectItem>
                  <SelectItem value="75">
                    {t('adminPanel.admin.notifications.type.lowData75', 'Low Data 75%')}
                  </SelectItem>
                  <SelectItem value="90">
                    {t('adminPanel.admin.notifications.type.lowData90', 'Low Data 90%')}
                  </SelectItem>
                  <SelectItem value="3days">
                    {t('adminPanel.admin.notifications.type.expiring3Days', 'Expiring 3 Days')}
                  </SelectItem>
                  <SelectItem value="1day">
                    {t('adminPanel.admin.notifications.type.expiring1Day', 'Expiring 1 Day')}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t('adminPanel.admin.notifications.type.custom', 'Custom')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ICCID Search */}
            <div className="space-y-2">
              <Label htmlFor="iccid-search">
                {t('adminPanel.admin.notifications.filters.iccid', 'ICCID')}
              </Label>
              <Input
                id="iccid-search"
                placeholder={t(
                  'adminPanel.admin.notifications.filters.iccidPlaceholder',
                  'Search by ICCID...',
                )}
                value={iccidSearch}
                onChange={(e) => setIccidSearch(e.target.value)}
                data-testid="input-iccid-search"
              />
            </div>

            {/* Processed Filter */}
            <div className="space-y-2">
              <Label>
                {t('adminPanel.admin.notifications.filters.processingStatus', 'Processing Status')}
              </Label>
              <div className="flex items-center space-x-4 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="processed-yes"
                    checked={processedFilter === true}
                    onCheckedChange={(checked) => setProcessedFilter(checked ? true : null)}
                    data-testid="checkbox-processed-yes"
                  />
                  <label
                    htmlFor="processed-yes"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('adminPanel.admin.notifications.filters.processed', 'Processed')}
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="processed-no"
                    checked={processedFilter === false}
                    onCheckedChange={(checked) => setProcessedFilter(checked ? false : null)}
                    data-testid="checkbox-processed-no"
                  />
                  <label
                    htmlFor="processed-no"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('adminPanel.admin.notifications.filters.notProcessed', 'Not Processed')}
                  </label>
                </div>
              </div>
            </div>

            {/* Email Sent Filter */}
            <div className="space-y-2">
              <Label>{t('adminPanel.admin.notifications.filters.emailStatus', 'Email Status')}</Label>
              <div className="flex items-center space-x-4 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="email-yes"
                    checked={emailSentFilter === true}
                    onCheckedChange={(checked) => setEmailSentFilter(checked ? true : null)}
                    data-testid="checkbox-email-yes"
                  />
                  <label
                    htmlFor="email-yes"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('adminPanel.admin.notifications.filters.sent', 'Sent')}
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="email-no"
                    checked={emailSentFilter === false}
                    onCheckedChange={(checked) => setEmailSentFilter(checked ? false : null)}
                    data-testid="checkbox-email-no"
                  />
                  <label
                    htmlFor="email-no"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('adminPanel.admin.notifications.filters.notSent', 'Not Sent')}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Table */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">
                {t('adminPanel.admin.notifications.empty.title', 'No Notifications Found')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  'adminPanel.admin.notifications.empty.description',
                  'No notification history matches your current filters',
                )}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('adminPanel.admin.notifications.table.timestamp', 'Timestamp')}</TableHead>
                    <TableHead>{t('adminPanel.admin.notifications.table.type', 'Type')}</TableHead>
                    <TableHead>{t('adminPanel.admin.notifications.table.iccid', 'ICCID')}</TableHead>
                    <TableHead>{t('adminPanel.admin.notifications.table.processed', 'Processed')}</TableHead>
                    {/* <TableHead>{t('adminPanel.admin.notifications.table.emailSent', 'Email Sent')}</TableHead> */}
                    <TableHead>{t('adminPanel.admin.notifications.table.error', 'Error')}</TableHead>
                    <TableHead className="text-right">
                      {t('adminPanel.admin.notifications.table.actions', 'Actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((notification) => {
                    const typeInfo = getTypeInfo(notification.type);
                    return (
                      <TableRow
                        key={notification.id}
                        className="cursor-pointer hover:bg-muted/50"
                        data-testid={`row-notification-${notification.id}`}
                      >
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {new Date(notification.createdAt).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeInfo.variant} className={typeInfo.color}>
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{notification.iccid}</TableCell>
                        <TableCell>
                          {notification.processed ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {t('adminPanel.admin.notifications.badge.yes', 'Yes')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              {t('adminPanel.admin.notifications.badge.no', 'No')}
                            </Badge>
                          )}
                        </TableCell>
                        {/* <TableCell>
                          {notification.emailSent ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {t('adminPanel.admin.notifications.badge.yes', 'Yes')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              {t('adminPanel.admin.notifications.badge.no', 'No')}
                            </Badge>
                          )}
                        </TableCell> */}
                        <TableCell>
                          {notification.error ? (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-destructive" />
                              <span className="text-sm text-destructive truncate max-w-[200px]">
                                {notification.error}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {t('adminPanel.admin.notifications.badge.none', 'None')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedNotification(notification)}
                            className="gap-2"
                            data-testid={`button-view-details-${notification.id}`}
                          >
                            <Eye className="h-4 w-4" />
                            {t('adminPanel.admin.notifications.button.viewDetails', 'View Details')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  {t(
                    'adminPanel.admin.notifications.pagination.showing',
                    'Showing {{from}} to {{to}} of {{total}} notifications',
                    {
                      from: (currentPage - 1) * itemsPerPage + 1,
                      to: Math.min(currentPage * itemsPerPage, historyData?.total || 0),
                      total: historyData?.total || 0,
                    },
                  )}
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
                    {t('adminPanel.admin.notifications.pagination.previous', 'Previous')}
                  </Button>
                  <div className="text-sm font-medium">
                    {t('adminPanel.admin.notifications.pagination.page', 'Page {{current}} of {{total}}', {
                      current: currentPage,
                      total: totalPages,
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    {t('adminPanel.admin.notifications.pagination.next', 'Next')}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notification Details Dialog */}
      <Dialog open={!!selectedNotification} onOpenChange={() => setSelectedNotification(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('adminPanel.admin.notifications.details.title', 'Notification Details')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'adminPanel.admin.notifications.details.description',
                'Detailed webhook payload and processing information',
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedNotification && (
            <div className="space-y-4">
              {/* Summary Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('adminPanel.admin.notifications.details.timestamp', 'Timestamp')}
                  </Label>
                  <div className="font-mono text-sm">
                    {new Date(selectedNotification.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('adminPanel.admin.notifications.details.type', 'Type')}
                  </Label>
                  <div className="mt-1">
                    <Badge variant={getTypeInfo(selectedNotification.type).variant}>
                      {getTypeInfo(selectedNotification.type).label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('adminPanel.admin.notifications.details.iccid', 'ICCID')}
                  </Label>
                  <div className="font-mono text-sm">{selectedNotification.iccid}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('adminPanel.admin.notifications.details.status', 'Status')}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Badge variant={selectedNotification.processed ? 'default' : 'secondary'}>
                      {selectedNotification.processed
                        ? t('adminPanel.admin.notifications.details.processed', 'Processed')
                        : t('adminPanel.admin.notifications.details.notProcessed', 'Not Processed')}
                    </Badge>
                    <Badge variant={selectedNotification.emailSent ? 'default' : 'secondary'}>
                      {selectedNotification.emailSent
                        ? t('adminPanel.admin.notifications.details.emailSent', 'Email Sent')
                        : t('adminPanel.admin.notifications.details.noEmail', 'No Email')}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Error (if any) */}
              {selectedNotification.error && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <Label className="text-xs text-destructive font-semibold">
                    {t('adminPanel.admin.notifications.details.error', 'Error')}
                  </Label>
                  <div className="text-sm mt-1">{selectedNotification.error}</div>
                </div>
              )}

              {/* Webhook Payload */}
              <div>
                <Label className="text-sm font-semibold">
                  {t('adminPanel.admin.notifications.details.webhookPayload', 'Webhook Payload')}
                </Label>
                <div className="mt-2 p-4 rounded-lg bg-muted font-mono text-xs overflow-x-auto">
                  <pre>{JSON.stringify(selectedNotification.webhookPayload, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Notification Modal */}
      <Dialog open={showCustomNotificationModal} onOpenChange={setShowCustomNotificationModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('adminPanel.admin.notifications.custom.title', 'Send Custom Notification')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'adminPanel.admin.notifications.custom.description',
                'Send a branded email notification to your customers',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="modal-subject">
                {t('adminPanel.admin.notifications.custom.subject', 'Subject')}
              </Label>
              <Input
                id="modal-subject"
                placeholder={t('adminPanel.admin.notifications.custom.subjectPlaceholder', 'Important Update')}
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                data-testid="input-modal-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modal-message">
                {t('adminPanel.admin.notifications.custom.message', 'Message')}
              </Label>
              <Textarea
                id="modal-message"
                placeholder={t(
                  'adminPanel.admin.notifications.custom.messagePlaceholder',
                  'Enter your notification message...',
                )}
                rows={6}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                data-testid="textarea-modal-message"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modal-recipient-type">
                {t('adminPanel.admin.notifications.custom.sendTo', 'Send To')}
              </Label>
              <Select
                value={recipientType}
                onValueChange={(value: 'all' | 'single') => setRecipientType(value)}
              >
                <SelectTrigger data-testid="select-modal-recipient-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('adminPanel.admin.notifications.custom.allCustomers', 'All Customers')}
                  </SelectItem>
                  <SelectItem value="single">
                    {t('adminPanel.admin.notifications.custom.singleCustomer', 'Single Customer')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipientType === 'single' && (
              <div className="space-y-2">
                <Label>{t('adminPanel.admin.notifications.custom.selectCustomer', 'Select Customer')}</Label>

                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <div
                      role="combobox"
                      className="border rounded-md h-10 px-3 flex items-center justify-between cursor-pointer"
                    >
                      <span>
                        {customers?.find((c) => c.id === recipientUserId)?.name ||
                          t('adminPanel.admin.notifications.custom.chooseCustomer', 'Choose a customer')}
                      </span>
                    </div>
                  </PopoverTrigger>

                  <PopoverContent className="p-0 w-[300px]">
                    <Command>
                      <CommandInput placeholder="Search customer..." onValueChange={setSearch} />
                      <CommandEmpty>No customer found.</CommandEmpty>

                      <CommandGroup>
                        {customers?.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={`${customer.name} ${customer.email}`}
                            onSelect={() => {
                              setRecipientUserId(customer.id);
                              setOpen(false);
                            }}
                          >
                            {customer.name || customer.email} ({customer.email})
                            <Check
                              className={cn(
                                'ml-auto h-4 w-4',
                                customer.id === recipientUserId ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-medium">
                {t('adminPanel.admin.notifications.custom.deliveryMethods', 'Delivery Methods')}
              </Label>
              {/* <div className="flex items-center space-x-2">
                <Checkbox
                  id="send-email"
                  checked={sendEmail}
                  onCheckedChange={setSendEmail}
                  data-testid="checkbox-send-email"
                />
                <label
                  htmlFor="send-email"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {t('adminPanel.admin.notifications.custom.sendEmail', 'Send Email')}
                </label>
              </div> */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="send-in-app"
                  checked={sendInApp}
                  onCheckedChange={setSendInApp}
                  data-testid="checkbox-send-in-app"
                />
                <label
                  htmlFor="send-in-app"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {t('adminPanel.admin.notifications.custom.sendInApp', 'Send In-App Notification')}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'adminPanel.admin.notifications.custom.methodRequired',
                  'At least one delivery method must be selected',
                )}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowCustomNotificationModal(false)}
                data-testid="button-cancel-notification"
              >
                {t('adminPanel.admin.notifications.custom.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={() => sendCustomNotificationMutation.mutate()}
                disabled={
                  !customSubject ||
                  !customMessage ||
                  (!sendEmail && !sendInApp) ||
                  sendCustomNotificationMutation.isPending ||
                  (recipientType === 'single' && !recipientUserId)
                }
                className="gap-2"
                data-testid="button-send-modal-notification"
              >
                <Bell className="h-4 w-4" />
                {sendCustomNotificationMutation.isPending
                  ? t('adminPanel.admin.notifications.custom.sending', 'Sending...')
                  : t(
                    'adminPanel.admin.notifications.custom.sendButton',
                    `Send to ${recipientType === 'all' ? 'All Customers' : 'Customer'}`,
                    {
                      recipient:
                        recipientType === 'all'
                          ? t('adminPanel.admin.notifications.custom.allCustomers', 'All Customers')
                          : t('adminPanel.admin.notifications.custom.singleCustomer', 'Customer'),
                    },
                  )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
