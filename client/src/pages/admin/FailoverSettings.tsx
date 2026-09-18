import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Check,
  ArrowUp,
  ArrowDown,
  Percent,
  Save,
  Server,
  Key,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Activity,
  Zap,
  Lock,
  Globe,
  Database,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

import { useTranslation } from '@/contexts/TranslationContext';

interface Provider {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  isPreferred: boolean;
  pricingMargin: string;
  priority: number;
  minMarginPercent: number;
}

interface FailoverSettings {
  enabled: boolean;
  globalMinMargin: number;
  maxFailoverAttempts: number;
}

interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  apiKeyPrefix: string;
  isActive: boolean;
  rateLimit: number;
  requestCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function FailoverSettings() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [providerMargins, setProviderMargins] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<FailoverSettings>({
    enabled: false,
    globalMinMargin: 15,
    maxFailoverAttempts: 3,
  });
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [newApiKeyRateLimit, setNewApiKeyRateLimit] = useState('1000');
  const [generatedKey, setGeneratedKey] = useState<{ key: string; secret: string } | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  // API Test states
  const [showTestModal, setShowTestModal] = useState(false);
  const [testApiKey, setTestApiKey] = useState('');
  const [testApiSecret, setTestApiSecret] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; keyName?: string } | null>(null);

  const testApiKeyMutation = useMutation({
    mutationFn: async (credentials: { apiKey: string; apiSecret: string }) => {
      const response = await apiRequest('POST', '/api/admin/api-keys/test', credentials);
      return response.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) {
        toast({
          title: t("adminPanel.admin.failover.toasts.connectionSuccess.title", "Connection Success"),
          description: t("adminPanel.admin.failover.toasts.connectionSuccess.description", "API key and secret are valid."),
        });
      } else {
        toast({
          title: t("adminPanel.admin.failover.toasts.connectionFailed.title", "Connection Failed"),
          description: data.message || t("adminPanel.admin.failover.toasts.connectionFailed.description", "Invalid credentials"),
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      setTestResult({ success: false, message: error.message });
      toast({
        title: t("common.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsTesting(false);
    }
  });

  const handleTestConnection = () => {
    if (!testApiKey || !testApiSecret) {
      toast({
        title: t("adminPanel.admin.failover.toasts.missingInfo.title", "Missing Information"),
        description: t("adminPanel.admin.failover.toasts.missingInfo.description", "Please enter both API key and secret"),
        variant: "destructive",
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    testApiKeyMutation.mutate({ apiKey: testApiKey, apiSecret: testApiSecret });
  };

  const { data: providers, isLoading: providersLoading } = useQuery<Provider[]>({
    queryKey: ['/api/admin/providers'],
  });

  const { data: failoverSettings, isLoading: settingsLoading } = useQuery<FailoverSettings>({
    queryKey: ['/api/admin/failover-settings'],
  });

  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery<ApiKey[]>({
    queryKey: ['/api/admin/api-keys'],
  });

  const updateFailoverSettingsMutation = useMutation({
    mutationFn: async (data: Partial<FailoverSettings>) => {
      return await apiRequest('PUT', '/api/admin/failover-settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/failover-settings'] });
      toast({
        title: t("adminPanel.admin.failover.toasts.settingsUpdated.title", "Settings Updated"),
        description: t("adminPanel.admin.failover.toasts.settingsUpdated.description", "Failover settings have been saved successfully."),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("adminPanel.admin.failover.toasts.updateFailed.title", "Update Failed"),
        description: error.message || t("adminPanel.admin.failover.toasts.updateFailed.description", "Failed to update failover settings."),
        variant: "destructive",
      });
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Provider> }) => {
      return await apiRequest('PUT', `/api/admin/providers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/providers'] });
      toast({
        title: t("adminPanel.admin.failover.toasts.providerUpdated.title", "Provider Updated"),
        description: t("adminPanel.admin.failover.toasts.providerUpdated.description", "Provider settings have been saved."),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("adminPanel.admin.failover.toasts.updateFailed.title", "Update Failed"),
        description: error.message || t("adminPanel.admin.failover.toasts.providerFailed.description", "Failed to update provider."),
        variant: "destructive",
      });
    },
  });

  const updateProviderPriorityMutation = useMutation({
    mutationFn: async (priorities: { id: string; priority: number }[]) => {
      return await apiRequest('PUT', '/api/admin/provider-priorities', { priorities });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/providers'] });
      toast({
        title: t("adminPanel.admin.failover.toasts.prioritiesUpdated.title", "Priorities Updated"),
        description: t("adminPanel.admin.failover.toasts.prioritiesUpdated.description", "Provider failover order has been saved."),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("adminPanel.admin.failover.toasts.updateFailed.title", "Update Failed"),
        description: error.message || t("adminPanel.admin.failover.toasts.prioritiesFailed.description", "Failed to update priorities."),
        variant: "destructive",
      });
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (data: { name: string; rateLimit: number }) => {
      const res = await apiRequest('POST', '/api/admin/api-keys', data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-keys'] });
      setGeneratedKey({ key: data.apiKey, secret: data.apiSecret });
      setNewApiKeyName('');
      setNewApiKeyRateLimit('1000');
      toast({
        title: t("adminPanel.admin.failover.toasts.apiKeyCreated.title", "API Key Created"),
        description: t("adminPanel.admin.failover.toasts.apiKeyCreated.description", "Make sure to copy the secret - it won't be shown again!"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("adminPanel.admin.failover.toasts.creationFailed.title", "Creation Failed"),
        description: error.message || t("adminPanel.admin.failover.toasts.creationFailed.description", "Failed to create API key."),
        variant: "destructive",
      });
    },
  });

  const toggleApiKeyMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest('PUT', `/api/admin/api-keys/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-keys'] });
      toast({
        title: t("adminPanel.admin.failover.toasts.apiKeyUpdated.title", "API Key Updated"),
        description: t("adminPanel.admin.failover.toasts.apiKeyUpdated.description", "API key status has been changed."),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("adminPanel.admin.failover.toasts.updateFailed.title", "Update Failed"),
        description: error.message || t("adminPanel.admin.failover.toasts.apiKeyUpdatedFailed.description", "Failed to update API key."),
        variant: "destructive",
      });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/admin/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-keys'] });
      toast({
        title: t("adminPanel.admin.failover.toasts.apiKeyDeleted.title", "API Key Deleted"),
        description: t("adminPanel.admin.failover.toasts.apiKeyDeleted.description", "The API key has been permanently removed."),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("adminPanel.admin.failover.toasts.deletionFailed.title", "Deletion Failed"),
        description: error.message || t("adminPanel.admin.failover.toasts.apiKeyDeletedFailed.description", "Failed to delete API key."),
        variant: "destructive",
      });
    },
  });

  const sortedProviders = [...(providers || [])].sort(
    (a, b) => (a.priority || 0) - (b.priority || 0),
  );

  const moveProviderUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...sortedProviders];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    const priorities = newOrder.map((p, i) => ({ id: p.id, priority: i + 1 }));
    updateProviderPriorityMutation.mutate(priorities);
  };

  const moveProviderDown = (index: number) => {
    if (index === sortedProviders.length - 1) return;
    const newOrder = [...sortedProviders];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    const priorities = newOrder.map((p, i) => ({ id: p.id, priority: i + 1 }));
    updateProviderPriorityMutation.mutate(priorities);
  };

  const handleMarginChange = (providerId: string, value: string) => {
    setProviderMargins((prev) => ({ ...prev, [providerId]: value }));
  };

  const saveProviderMargin = (provider: Provider) => {
    const margin = providerMargins[provider.id];
    if (margin !== undefined) {
      updateProviderMutation.mutate({
        id: provider.id,
        data: { pricingMargin: margin },
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t("common.copied", "Copied"),
      description: t("common.valueCopied", "Value copied to clipboard."),
    });
  };

  const isLoading = providersLoading || settingsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentSettings = failoverSettings || settings;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto"
      data-testid="failover-settings-page"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60" data-testid="page-title">
            {t("adminPanel.admin.failover.title", "Smart Failover Settings")}
          </h1>
          <p className="text-muted-foreground mt-2 text-lg max-w-2xl">
            {t(
              "adminPanel.admin.failover.description",
              "Advanced routing logic to ensure zero-downtime eSIM fulfillment."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="px-4 py-1.5 border-primary/20 bg-primary/5 text-primary">
            <Activity className="h-3.5 w-3.5 mr-2 animate-pulse" />
            System Active
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="failover" className="space-y-8">
        <div className="relative">
          <TabsList className="bg-muted/50 p-1 rounded-xl h-auto gap-2" data-testid="tabs-list">
            <TabsTrigger
              value="failover"
              className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              data-testid="tab-failover"
            >
              <Shield className="h-4 w-4 mr-2" />
              {t("adminPanel.admin.failover.tabs.failover", "Logic & Security")}
            </TabsTrigger>
            <TabsTrigger
              value="providers"
              className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              data-testid="tab-providers"
            >
              <Server className="h-4 w-4 mr-2" />
              {t("adminPanel.admin.failover.tabs.providers", "Routing Engine")}
            </TabsTrigger>
            <TabsTrigger
              value="api-keys"
              className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              data-testid="tab-api-keys"
            >
              <Key className="h-4 w-4 mr-2" />
              {t("adminPanel.admin.failover.tabs.apiKeys", "Integration Keys")}
            </TabsTrigger>
          </TabsList>
        </div>

        <AnimatePresence mode="wait">
          <TabsContent value="failover" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur-sm border border-white/10">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-transparent" />
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-2xl flex items-center gap-2">
                          <Zap className="h-5 w-5 text-yellow-500" />
                          {t("adminPanel.admin.failover.page.title", "Failover Engine")}
                        </CardTitle>
                        <CardDescription>
                          {t("adminPanel.admin.failover.page.description", "Configure how the system behaves when a preferred provider is unavailable.")}
                        </CardDescription>
                      </div>
                      <Switch
                        data-testid="switch-failover-enabled"
                        checked={currentSettings.enabled}
                        onCheckedChange={(checked) =>
                          updateFailoverSettingsMutation.mutate({ enabled: checked })
                        }
                        className="scale-125 data-[state=checked]:bg-primary"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-8 pt-6">
                    <div className="grid md:grid-cols-2 gap-8">
                      <div className="space-y-4 p-4 rounded-2xl bg-muted/30 border border-white/5">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold flex items-center gap-2">
                            <Percent className="h-4 w-4 text-primary" />
                            {t("adminPanel.admin.failover.page.globalMinMargin", "Global Min Margin")}
                          </Label>
                          <Badge variant="secondary" className="font-mono">{currentSettings.globalMinMargin}%</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {t("adminPanel.admin.failover.page.globalMinMarginDescription", "Minimum profit margin required for any provider to be eligible during failover.")}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            type="number"
                            value={currentSettings.globalMinMargin}
                            onChange={(e) =>
                              setSettings({
                                ...currentSettings,
                                globalMinMargin: parseInt(e.target.value) || 0,
                              })
                            }
                            className="bg-background/50 border-white/10"
                          />
                          <Button
                            size="icon"
                            variant="secondary"
                            className="shrink-0"
                            onClick={() =>
                              updateFailoverSettingsMutation.mutate({
                                globalMinMargin: currentSettings.globalMinMargin,
                              })
                            }
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4 p-4 rounded-2xl bg-muted/30 border border-white/5">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-primary" />
                            {t("adminPanel.admin.failover.page.maxRetryChain", "Max Retry Chain")}
                          </Label>
                          <Badge variant="secondary" className="font-mono">{currentSettings.maxFailoverAttempts} {t("adminPanel.admin.failover.page.maxRetryChainAttempts", "attempts")}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {t("adminPanel.admin.failover.page.maxRetryChainDescription", "Maximum number of providers the system will cycle through before failing the order.")}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            type="number"
                            value={currentSettings.maxFailoverAttempts}
                            onChange={(e) =>
                              setSettings({
                                ...currentSettings,
                                maxFailoverAttempts: parseInt(e.target.value) || 0,
                              })
                            }
                            className="bg-background/50 border-white/10"
                          />
                          <Button
                            size="icon"
                            variant="secondary"
                            className="shrink-0"
                            onClick={() =>
                              updateFailoverSettingsMutation.mutate({
                                maxFailoverAttempts: currentSettings.maxFailoverAttempts,
                              })
                            }
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Shield className="h-6 w-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold text-foreground">{t("adminPanel.admin.failover.page.operationalStatus", "Operational Status")}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {currentSettings.enabled
                            ? t("adminPanel.admin.failover.page.operationalStatusDescription", "Smart failover is currently protecting your orders. Systems will automatically fallback to the next best provider in your priority list.")
                            : t("adminPanel.admin.failover.page.operationalStatusDescription", "Failover protection is disabled. Orders will only be placed with the initially selected provider, even if they are down.")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-xl bg-card/30 backdrop-blur-sm border border-white/5 h-fit">
                  <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      {t("adminPanel.admin.failover.page.quickStats", "Quick Stats")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("adminPanel.admin.failover.page.activeProviders", "Active Providers")}</span>
                        <span className="font-bold">{providers?.filter(p => p.enabled).length || 0} / {providers?.length || 0}</span>
                      </div>
                      <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-1000"
                          style={{ width: `${((providers?.filter(p => p.enabled).length || 0) / (providers?.length || 1)) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Check className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium"> {t("adminPanel.admin.failover.page.gatewayHealth", "Gateway Health")} </p>
                          <p className="text-xs text-muted-foreground text-green-500">{t("adminPanel.admin.failover.page.allSystemsOperational", "All systems operational")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <Globe className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium"> {t("adminPanel.admin.failover.page.apiConnectivity", "API Connectivity")} </p>
                          <p className="text-xs text-muted-foreground">{t("adminPanel.admin.failover.page.normalLatency", "Normal Latency (120ms)")}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="providers" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm border border-white/10 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-transparent" />
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-2xl flex items-center gap-2">
                        <Server className="h-5 w-5 text-primary" />
                        {t('adminPanel.admin.failover.routing.title', 'Routing Chain')}
                      </CardTitle>
                      <CardDescription>
                        {t('adminPanel.admin.failover.routing.description', 'Define the sequence in which providers are engaged for order fulfillment.')}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-white/5 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="w-20 text-center font-bold">{t("adminPanel.admin.failover.routing.table.pos", "POS")}</TableHead>
                          <TableHead>{t("adminPanel.admin.failover.routing.table.provider", "PROVIDER")}</TableHead>
                          <TableHead>{t("adminPanel.admin.failover.routing.table.status", "STATUS")}</TableHead>
                          <TableHead className="text-right">{t("adminPanel.admin.failover.routing.table.margin", "ADAPTIVE MARGIN")}</TableHead>
                          <TableHead className="w-32 text-center">{t("adminPanel.admin.failover.routing.table.ordering", "ORDERING")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedProviders.map((provider, index) => (
                          <TableRow
                            key={provider.id}
                            data-testid={`provider-row-${provider.slug}`}
                            className="border-white/5 hover:bg-white/5 transition-colors group"
                          >
                            <TableCell className="text-center">
                              <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-mono font-bold text-sm">
                                {index + 1}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-bold text-foreground group-hover:text-primary transition-colors">{provider.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">{provider.slug}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {provider.enabled ? (
                                <Badge className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20 flex w-fit items-center gap-1.5">
                                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                  {t("adminPanel.admin.failover.routing.statusReady", "Ready")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="opacity-50">{t("adminPanel.admin.failover.routing.statusOffline", "Offline")}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="relative group/input">
                                  <Input
                                    data-testid={`input-margin-${provider.slug}`}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={providerMargins[provider.id] ?? provider.pricingMargin}
                                    onChange={(e) => handleMarginChange(provider.id, e.target.value)}
                                    className="w-24 text-right bg-background/50 border-white/10 focus:border-primary/50 transition-all pr-7 font-mono"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">%</span>
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 text-primary hover:bg-primary/10"
                                  data-testid={`button-save-margin-${provider.slug}`}
                                  onClick={() => saveProviderMargin(provider)}
                                  disabled={updateProviderMutation.isPending}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 hover:bg-white/10"
                                  data-testid={`button-move-up-${provider.slug}`}
                                  onClick={() => moveProviderUp(index)}
                                  disabled={index === 0 || updateProviderPriorityMutation.isPending}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 hover:bg-white/10"
                                  data-testid={`button-move-down-${provider.slug}`}
                                  onClick={() => moveProviderDown(index)}
                                  disabled={
                                    index === sortedProviders.length - 1 ||
                                    updateProviderPriorityMutation.isPending
                                  }
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-6 p-4 rounded-xl bg-muted/30 border border-white/5 flex items-center gap-4 text-sm text-muted-foreground">
                    <AlertTriangle className="h-5 w-5 text-primary shrink-0" />
                    <p>
                      The order above determines the fallback sequence. If your primary provider fails, the system will attempt to fulfill the order with the next provider in the list that meets your margin requirements.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="lg:col-span-3 border-none shadow-xl bg-card/50 backdrop-blur-sm border border-white/10 overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-transparent" />
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-2xl flex items-center gap-2">
                        <Lock className="h-5 w-5 text-primary" />
                        {t("adminPanel.admin.failover.apiKeys.title", "API Infrastructure")}
                      </CardTitle>
                      <CardDescription>
                        Secure access points for your external integrations and mobile applications.
                      </CardDescription>
                    </div>
                    <Dialog open={showApiKeyModal} onOpenChange={(open) => {
                      setShowApiKeyModal(open);
                      if (!open) setGeneratedKey(null);
                    }}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-create-api-key" className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                          <Plus className="h-4 w-4 mr-2" />
                          {t("adminPanel.admin.failover.apiKeys.issueNewKey", "Issue New Key")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md border-none bg-card/95 backdrop-blur-xl shadow-2xl">
                        <DialogHeader>
                          <DialogTitle className="text-2xl font-bold">{t("adminPanel.admin.failover.apiKeys.newCredential.title", "New Security Credential")}</DialogTitle>
                          <DialogDescription>
                            {t("adminPanel.admin.failover.apiKeys.newCredential.description", "Configure the access level and rate limits for this API key.")}
                          </DialogDescription>
                        </DialogHeader>
                        {generatedKey ? (
                          <div className="space-y-6 py-4">
                            <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-start gap-4">
                              <AlertTriangle className="h-6 w-6 text-primary shrink-0" />
                              <div className="space-y-1">
                                <p className="font-bold text-primary">{t("adminPanel.admin.failover.apiKeys.newCredential.securityProtocol", "Security Protocol")}</p>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {t("adminPanel.admin.failover.apiKeys.newCredential.secretWarning", "Your secret key is only displayed once. If you lose it, you will need to re-issue the credential.")}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider font-bold opacity-70">{t("adminPanel.admin.failover.apiKeys.newCredential.clientId", "Client ID / API Key")}</Label>
                                <div className="flex gap-2">
                                  <Input value={generatedKey.key} readOnly className="font-mono text-sm bg-muted/50 border-white/10 h-11" />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-11 w-11 shrink-0"
                                    onClick={() => copyToClipboard(generatedKey.key)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider font-bold opacity-70">{t("adminPanel.admin.failover.apiKeys.newCredential.clientSecret", "Client Secret")}</Label>
                                <div className="flex gap-2">
                                  <Input
                                    value={generatedKey.secret}
                                    readOnly
                                    type="text"
                                    className="font-mono text-sm bg-muted/50 border-white/10 h-11"
                                  />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-11 w-11 shrink-0"
                                    onClick={() => copyToClipboard(generatedKey.secret)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <Button
                              className="w-full h-11"
                              onClick={() => {
                                setGeneratedKey(null);
                                setShowApiKeyModal(false);
                              }}
                            >
                              {t("adminPanel.admin.failover.apiKeys.newCredential.secured", "I Have Secured These Credentials")}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-6 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="apiKeyName">{t("adminPanel.admin.failover.apiKeys.newCredential.friendlyName", "Friendly Name")}</Label>
                              <Input
                                id="apiKeyName"
                                placeholder={t("adminPanel.admin.failover.apiKeys.newCredential.friendlyNamePlaceholder", "e.g., iPhone App v2")}
                                value={newApiKeyName}
                                onChange={(e) => setNewApiKeyName(e.target.value)}
                                className="h-11 bg-muted/50 border-white/10"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="apiKeyRateLimit">{t("adminPanel.admin.failover.apiKeys.newCredential.rateLimit", "Burst Rate Limit (req/day)")}</Label>
                              <Input
                                id="apiKeyRateLimit"
                                type="number"
                                value={newApiKeyRateLimit}
                                onChange={(e) => setNewApiKeyRateLimit(e.target.value)}
                                className="h-11 bg-muted/50 border-white/10 font-mono"
                              />
                            </div>
                            <div className="flex gap-3 pt-2">
                              <Button variant="outline" className="flex-1 h-11" onClick={() => setShowApiKeyModal(false)}>
                                {t("adminPanel.admin.failover.apiKeys.newCredential.cancel", "Cancel")}
                              </Button>
                              <Button
                                className="flex-2 h-11 px-8"
                                onClick={() =>
                                  createApiKeyMutation.mutate({
                                    name: newApiKeyName,
                                    rateLimit: parseInt(newApiKeyRateLimit) || 1000,
                                  })
                                }
                                disabled={!newApiKeyName || createApiKeyMutation.isPending}
                              >
                                {createApiKeyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                {t("adminPanel.admin.failover.apiKeys.newCredential.generate", "Generate Credential")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent>
                    {apiKeysLoading ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
                        <p className="text-sm font-medium animate-pulse">Syncing keys...</p>
                      </div>
                    ) : (apiKeys?.length || 0) === 0 ? (
                      <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed border-white/10">
                        <Lock className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                        <h3 className="text-lg font-bold">No API access active</h3>
                        <p className="text-sm text-muted-foreground mt-1">Issue your first API key to start integrating your services.</p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/5 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-muted/30">
                            <TableRow className="border-white/5 hover:bg-transparent">
                              <TableHead>{t("adminPanel.admin.failover.apiKeys.table.identity", "IDENTITY")}</TableHead>
                              <TableHead>{t("adminPanel.admin.failover.apiKeys.table.prefix", "PREFIX")}</TableHead>
                              <TableHead>{t("adminPanel.admin.failover.apiKeys.table.status", "STATUS")}</TableHead>
                              <TableHead className="text-right">{t("adminPanel.admin.failover.apiKeys.table.quota", "QUOTA")}</TableHead>
                              <TableHead className="text-right">{t("adminPanel.admin.failover.apiKeys.table.traffic", "TRAFFIC")}</TableHead>
                              <TableHead className="w-20"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {apiKeys?.map((key) => (
                              <TableRow key={key.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                <TableCell>
                                  <div className="font-bold text-foreground">{key.name}</div>
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                                    {t("adminPanel.admin.failover.apiKeys.table.created", "Created")} {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <code className="text-[11px] bg-primary/10 text-primary px-2 py-1 rounded font-mono">
                                    {(key as any).apiKeyPrefix || "SK_..."}
                                  </code>
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={key.isActive}
                                    onCheckedChange={(checked) =>
                                      toggleApiKeyMutation.mutate({ id: key.id, isActive: checked })
                                    }
                                    className="data-[state=checked]:bg-primary"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  {key.rateLimit.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold text-xs">{key.requestCount.toLocaleString()}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {key.lastUsedAt ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true }) : t("adminPanel.admin.failover.apiKeys.table.idle", "Idle")}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive/50 hover:text-destructive hover:bg-destructive/10">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-none shadow-2xl">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>{t("adminPanel.admin.failover.apiKeys.revoke.title", "Revoke API Credential?")}</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {t("adminPanel.admin.failover.apiKeys.revoke.description", "This will immediately terminate all active sessions and integrations using this key. This action is irreversible.")}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>{t("adminPanel.admin.failover.apiKeys.revoke.cancel", "Keep Key")}</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-destructive hover:bg-destructive/90"
                                          onClick={() => deleteApiKeyMutation.mutate(key.id)}
                                        >
                                          {t("adminPanel.admin.failover.apiKeys.revoke.confirm", "Revoke Access")}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-none shadow-xl bg-primary/10 border border-primary/20 overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-primary" />
                        {t("adminPanel.admin.failover.apiKeys.testKey.title", "Verify Key")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        {t("adminPanel.admin.failover.apiKeys.testKey.description", "Instantly validate any API credential against our security layer.")}
                      </p>
                      <div className="space-y-3">
                        <Input
                          placeholder={t("adminPanel.admin.failover.apiKeys.testKey.keyPlaceholder", "API Key")}
                          className="h-9 text-xs bg-background/50 border-white/10"
                          value={testApiKey}
                          onChange={(e) => setTestApiKey(e.target.value)}
                        />
                        <Input
                          placeholder={t("adminPanel.admin.failover.apiKeys.testKey.secretPlaceholder", "API Secret")}
                          type="password"
                          className="h-9 text-xs bg-background/50 border-white/10"
                          value={testApiSecret}
                          onChange={(e) => setTestApiSecret(e.target.value)}
                        />
                        <Button
                          className="w-full h-9 text-xs shadow-lg shadow-primary/10"
                          onClick={() => handleTestConnection()}
                          disabled={isTesting}
                        >
                          {isTesting ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Activity className="h-3 w-3 mr-2" />}
                          {t("adminPanel.admin.failover.apiKeys.testKey.button", "Test Connection")}
                        </Button>
                      </div>

                      {testResult && (
                        <div className={`mt-2 p-3 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                          {testResult.success ? <Check className="h-3 w-3 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                          <div>
                            <p className="font-bold">{testResult.success ? t("adminPanel.admin.failover.apiKeys.testKey.authenticated", "Authenticated") : t("adminPanel.admin.failover.apiKeys.testKey.unauthorized", "Unauthorized")}</p>
                            <p className="opacity-80">{testResult.message}</p>
                            {testResult.keyName && <p className="mt-1 font-mono">{t("adminPanel.admin.failover.apiKeys.testKey.owner", "Owner")}: {testResult.keyName}</p>}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-xl bg-card/30 backdrop-blur-sm border border-white/5 overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        {t("adminPanel.admin.failover.resources.title", "Resources")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button variant="outline" className="w-full h-9 justify-start text-xs border-white/10" asChild>
                        <a href="/api/docs" target="_blank">
                          <Terminal className="h-3 w-3 mr-2" />
                          {t("adminPanel.admin.failover.resources.docs", "API Documentation")}
                        </a>
                      </Button>
                      <Button variant="outline" className="w-full h-9 justify-start text-xs border-white/10">
                        <Server className="h-3 w-3 mr-2" />
                        {t("adminPanel.admin.failover.resources.status", "Status Dashboard")}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </motion.div>
  );
}
