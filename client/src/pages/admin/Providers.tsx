import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Server,
  RefreshCw,
  Settings as SettingsIcon,
  Check,
  X,
  Clock,
  Package,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';
import ProviderConfigModal from '@/components/admin/ProviderConfigModal';
import { useTranslation } from '@/contexts/TranslationContext';

interface Provider {
  id: string;
  name: string;
  slug: string;
  apiBaseUrl: string | null;
  enabled: boolean;
  isPreferred: boolean;
  pricingMargin: string;
  syncIntervalMinutes: number;
  lastSyncAt: string | null;
  apiRateLimitPerHour: number;
  webhookSecret: string | null;
  totalPackages: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function Providers() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  const { data: providers, isLoading } = useQuery<Provider[]>({
    queryKey: ['/api/admin/providers'],
  });

  const syncProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      return await apiRequest('POST', `/api/admin/providers/${providerId}/sync`);
    },
    onSuccess: (_data, providerId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/providers'] });
      toast({
        title: t('adminPanel.admin.providers.syncCompletedTitle', 'Sync Completed'),
        description: t(
          'adminPanel.admin.providers.syncCompletedDescription',
          'Provider packages have been synchronized successfully.',
        ),
      });
      setSyncingProvider(null);
    },
    onError: (error: any, providerId) => {
      toast({
        title: t('admin.providers.syncFailedTitle', 'Sync Failed'),
        description:
          error.message ||
          t('adminPanel.admin.providers.syncFailedDescription', 'Failed to sync provider packages.'),
        variant: 'destructive',
      });
      setSyncingProvider(null);
    },
  });

  const runPriceComparisonMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/providers/price-comparison');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/providers'] });
      toast({
        title: t('adminPanel.admin.providers.priceComparisonCompleteTitle', 'Price Comparison Complete'),
        description: t(
          'adminPanel.admin.providers.priceComparisonCompleteDescription',
          'Analyzed {{total}} packages, found {{best}} best price packages.',
          { total: data.totalPackages, best: data.bestPricePackages },
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('adminPanel.admin.providers.priceComparisonFailedTitle', 'Price Comparison Failed'),
        description:
          error.message ||
          t('adminPanel.admin.providers.priceComparisonFailedDescription', 'Failed to run price comparison.'),
        variant: 'destructive',
      });
    },
  });

  const handleSyncProvider = (providerId: string) => {
    setSyncingProvider(providerId);
    syncProviderMutation.mutate(providerId);
  };

  const getApiHealthStatus = (provider: Provider) => {
    if (!provider.enabled) {
      return {
        status: 'disabled',
        label: t('adminPanel.admin.providers.status.disabled', 'Disabled'),
        variant: 'outline' as const,
        className: 'border-muted-foreground/30 text-muted-foreground',
        icon: X,
      };
    }

    if (!provider.lastSyncAt) {
      return {
        status: 'pending',
        label: t('adminPanel.admin.providers.status.neverSynced', 'Never Synced'),
        variant: 'outline' as const,
        className: 'border-slate-500/30 bg-slate-500/10 text-slate-600',
        icon: Clock,
      };
    }

    const lastSync = new Date(provider.lastSyncAt);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

    // If last sync was within 2x the sync interval, consider it healthy
    const healthyThreshold = (provider.syncIntervalMinutes / 60) * 2;

    if (hoursSinceSync < healthyThreshold) {
      return {
        status: 'healthy',
        label: t('adminPanel.admin.providers.status.healthy', 'Healthy'),
        variant: 'outline' as const,
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
        icon: Check,
      };
    }

    return {
      status: 'warning',
      label: t('adminPanel.admin.providers.status.stale', 'Stale'),
      variant: 'outline' as const,
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
      icon: X,
    };
  };

  const formatLastSync = (lastSyncAt: string | null) => {
    if (!lastSyncAt) return t('admin.providers.never', 'Never');
    try {
      return formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true });
    } catch {
      return t('adminPanel.admin.providers.invalidDate', 'Invalid date');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96 dark:text-white">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>{t('adminPanel.admin.providers.loading', 'Loading providers...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 dark:text-white">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t('adminPanel.admin.providers.title', 'Provider Management')}
          </h1>
          <p className="text-muted-foreground">
            {t(
              'adminPanel.admin.providers.subtitle',
              'Manage eSIM providers, sync packages, and configure integrations',
            )}
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button
            className="w-full md:w-auto" 
            variant="outline"
            onClick={() => runPriceComparisonMutation.mutate()}
            disabled={runPriceComparisonMutation.isPending}
            data-testid="button-run-price-comparison"
          >
            {runPriceComparisonMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t('adminPanel.admin.providers.runPriceComparison', 'Run Price Comparison')}
          </Button>
        </div>
      </div>


      <Card>
        <CardHeader>
          <CardTitle>{t('adminPanel.admin.providers.cardTitle', 'Providers')}</CardTitle>
          <CardDescription>
            {t('adminPanel.admin.providers.cardDescription', 'View and manage all eSIM provider integrations')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!providers || providers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('adminPanel.admin.providers.noProviders', 'No providers configured')}</p>
            </div>
          ) : (
            <Table data-testid="table-providers">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('adminPanel.admin.providers.table.provider', 'Provider')}</TableHead>
                  <TableHead>{t('adminPanel.admin.providers.table.status', 'Status')}</TableHead>
                  <TableHead>{t('adminPanel.admin.providers.table.apiHealth', 'API Health')}</TableHead>
                  <TableHead>{t('adminPanel.admin.providers.table.lastSync', 'Last Sync')}</TableHead>
                  <TableHead>{t('adminPanel.admin.providers.table.packages', 'Packages')}</TableHead>
                  <TableHead>{t('adminPanel.admin.providers.table.syncInterval', 'Sync Interval')}</TableHead>
                  <TableHead>{t('adminPanel.admin.providers.table.margin', 'Margin')}</TableHead>
                  <TableHead className="text-right">
                    {t('adminPanel.admin.providers.table.actions', 'Actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((provider) => {
                  const healthStatus = getApiHealthStatus(provider);
                  const HealthIcon = healthStatus.icon;

                  return (
                    <TableRow
                      key={provider.id}
                      data-testid={`row-provider-${provider.id}`}
                      className="odd:bg-muted/40 hover:bg-muted transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {provider.name}
                              {provider.isPreferred && (
                                <Badge
                                  variant="default"
                                  className="gap-1"
                                  data-testid={`badge-preferred-${provider.id}`}
                                >
                                  <Star className="h-3 w-3" />
                                  {t('adminPanel.admin.providers.preferred', 'Preferred')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">{provider.slug}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            provider.enabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                              : 'border-muted-foreground/30 text-muted-foreground'
                          }
                          data-testid={`badge-status-${provider.id}`}
                        >
                          {provider.enabled
                            ? t('adminPanel.admin.providers.enabled', 'Enabled')
                            : t('adminPanel.admin.providers.disabled', 'Disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={healthStatus.variant}
                          className={`gap-1.5 ${healthStatus.className || ''}`}
                          data-testid={`badge-health-${provider.id}`}
                        >
                          <HealthIcon className="h-3 w-3" />
                          {healthStatus.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm" data-testid={`text-last-sync-${provider.id}`}>
                          {formatLastSync(provider.lastSyncAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className="text-sm flex items-center gap-1"
                          data-testid={`text-total-packages-${provider.id}`}
                        >
                          <Package className="h-3 w-3" />
                          {provider.totalPackages?.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {provider.syncIntervalMinutes < 60
                            ? `${provider.syncIntervalMinutes}m`
                            : `${(provider.syncIntervalMinutes / 60).toFixed(0)}h`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {parseFloat(provider.pricingMargin).toFixed(1)}%
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncProvider(provider.id)}
                            disabled={!provider.enabled || syncingProvider === provider.id}
                            data-testid={`button-sync-${provider.id}`}
                          >
                            {syncingProvider === provider.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                {t('adminPanel.admin.providers.sync', 'Sync')}
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedProvider(provider);
                              setConfigModalOpen(true);
                            }}
                            data-testid={`button-configure-${provider.id}`}
                          >
                            <SettingsIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProviderConfigModal
        provider={selectedProvider}
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
      />
    </div>
  );
}