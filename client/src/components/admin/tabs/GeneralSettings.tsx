// components/admin/tabs/GeneralSettings.tsx - Complete with internal state management
import { useState, useEffect, useMemo } from 'react';
import {
  Save,
  Building2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Brain,
  Zap,
  TrendingUp,
  Settings2,
  Play,
  RefreshCw,
  Globe,
  MessageCircle,
  DollarSign,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useTranslation } from '@/contexts/TranslationContext';
import type { CurrencyRate } from '@shared/schema';

import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { SettingsResponse } from '@/types/types';
import { useAppDispatch } from '@/redux/store/store';
import { setSettings } from '@/redux/slice/settingsSlice';

interface AIStatus {
  isConfigured: boolean;
  isReady: boolean;
  maskedKey: string | null;
  aiEnabled: boolean;
  weights: {
    price: number;
    quality: number;
    provider: number;
  };
  usage: {
    totalRequests: number;
    totalTokens: number;
    estimatedCost: number;
    errors: number;
    lastRequestAt: string | null;
  };
}

function AISettingsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [aiEnabled, setAiEnabled] = useState(false);
  const [priceWeight, setPriceWeight] = useState(50);
  const [qualityWeight, setQualityWeight] = useState(30);
  const [providerWeight, setProviderWeight] = useState(20);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  const { data: aiStatus, refetch: refetchStatus } = useQuery<AIStatus>({
    queryKey: ['/api/admin/ai-settings/status'],
  });

  useEffect(() => {
    if (aiStatus) {
      setAiEnabled(aiStatus.aiEnabled);
      setPriceWeight(aiStatus.weights.price);
      setQualityWeight(aiStatus.weights.quality);
      setProviderWeight(aiStatus.weights.provider);
    }
  }, [aiStatus]);

  const saveAISettings = useMutation({
    mutationFn: async (data: {
      enabled?: boolean;
      priceWeight?: number;
      qualityWeight?: number;
      providerWeight?: number;
    }) => {
      return await apiRequest('POST', '/api/admin/ai-settings/update', data);
    },
    onSuccess: () => {
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-settings'] });
      toast({ title: 'Success', description: 'AI settings updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await apiRequest('POST', '/api/admin/ai-settings/test');
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Connection Successful',
          description: `Latency: ${data.data?.latencyMs}ms`,
        });
      } else {
        toast({ title: 'Connection Failed', description: data.message, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const runAISelection = async () => {
    setRunning(true);
    try {
      const res = await apiRequest('POST', '/api/admin/ai-settings/run-selection');
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'AI Selection Complete',
          description: `Enabled: ${data.data?.packagesEnabled}, Disabled: ${data.data?.packagesDisabled}`,
        });
        refetchStatus();
      } else {
        toast({ title: 'Failed', description: data.message, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const handleSaveWeights = () => {
    const total = priceWeight + qualityWeight + providerWeight;
    if (total !== 100) {
      toast({
        title: 'Invalid Weights',
        description: 'Weights must sum to 100%',
        variant: 'destructive',
      });
      return;
    }
    saveAISettings.mutate({ priceWeight, qualityWeight, providerWeight });
  };

  const handleToggleAI = (enabled: boolean) => {
    setAiEnabled(enabled);
    saveAISettings.mutate({ enabled });
  };

  return (
    <Card className="border-0 shadow-xl hover:shadow-[0_25px_50px_-12px_color-mix(in_srgb,var(--primary-hex)_30%,transparent)] transition-all duration-500">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] bg-clip-text text-transparent flex items-center gap-2">
          <Brain className="h-6 w-6 text-[var(--primary-hex)]" />
          {t('adminPanel.admin.settings.ai.title', 'AI-Enhanced Package Selection')}
        </CardTitle>
        <CardDescription className="text-lg text-[var(--primary-hex)]/70">
          {t(
            'adminPanel.admin.settings.ai.description',
            'Use AI to intelligently select the best packages considering price, quality, and provider reliability',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-8">
        {/* Connection Status */}
        <div className="p-4 md:p-6 rounded-2xl border-2 border-border bg-gradient-to-br from-muted/30 to-transparent">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 md:gap-3">
              <Zap className="h-4 w-4 md:h-5 md:w-5 text-[var(--primary-hex)]" />
              <span className="text-lg md:text-xl font-bold">{t('adminPanel.admin.settings.ai.openaiConnection', 'OpenAI Connection')}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={aiStatus?.isReady ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}>
                {aiStatus?.isReady ? t('adminPanel.admin.settings.ai.connected', 'Connected') : t('adminPanel.admin.settings.ai.notConnected', 'Not Connected')}
              </Badge>
              {aiStatus?.maskedKey && (
                <span className="text-[10px] md:text-xs text-muted-foreground font-mono">
                  {aiStatus.maskedKey}
                </span>
              )}
            </div>
          </div>

          {!aiStatus?.isConfigured && (
            <div className="p-3 md:p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
              <p className="text-xs md:text-sm text-amber-600 dark:text-amber-400">

                {t('adminPanel.admin.settings.ai.addOpenAIKey', 'Add OPENAI_API_KEY to enable features.')}
              </p>
            </div>
          )}

          <Button
            variant="outline"
            onClick={testConnection}
            disabled={testing || !aiStatus?.isConfigured}
            className="w-full sm:w-auto text-sm h-10"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {t('adminPanel.admin.settings.ai.testConnection', 'Test Connection')}
          </Button>
        </div>

        {/* AI Toggle */}
        <div className="p-6 rounded-2xl border-2 border-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xl font-bold mb-1 flex items-center gap-2">
                <Brain className="h-5 w-5 text-[var(--primary-hex)]" />
                {t('adminPanel.admin.settings.ai.enableAISelection', 'Enable AI Selection')}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('adminPanel.admin.settings.ai.enableAIDescription', 'When enabled, AI analyzes packages and scores them based on value, not just price')}
              </p>
            </div>
            <Switch
              checked={aiEnabled}
              onCheckedChange={handleToggleAI}
              disabled={!aiStatus?.isReady || saveAISettings.isPending}
              data-testid="switch-ai-enabled"
            />
          </div>
        </div>

        {/* Scoring Weights */}
        {aiEnabled && (
          <div className="p-6 rounded-2xl border-2 border-[var(--primary-hex)]/30 bg-gradient-to-br from-[var(--primary-light-hex)]/10 to-transparent">
            <div className="flex items-center gap-2 mb-6">
              <Settings2 className="h-5 w-5 text-[var(--primary-hex)]" />
              <span className="text-xl font-bold">{t('adminPanel.admin.settings.ai.scoringWeights', 'Scoring Weights')}</span>
              <Badge variant="outline" className="ml-auto">
                Total: {priceWeight + qualityWeight + providerWeight}%
              </Badge>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">{t('adminPanel.admin.settings.ai.priceWeight', 'Price Weight')}</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {priceWeight}%
                  </span>
                </div>
                <Slider
                  value={[priceWeight]}
                  onValueChange={([v]) => setPriceWeight(v)}
                  max={100}
                  step={5}
                  data-testid="slider-price-weight"
                />
                <p className="text-xs text-muted-foreground">{t('adminPanel.admin.settings.ai.priceWeightDescription', 'How much to prioritize lower prices')}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">{t('adminPanel.admin.settings.ai.qualityWeight', 'Quality Weight')}</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {qualityWeight}%
                  </span>
                </div>
                <Slider
                  value={[qualityWeight]}
                  onValueChange={([v]) => setQualityWeight(v)}
                  max={100}
                  step={5}
                  data-testid="slider-quality-weight"
                />
                <p className="text-xs text-muted-foreground">
                  {t('adminPanel.admin.settings.ai.qualityWeightDescription', 'AI-analyzed value (data/price ratio, validity, features)')}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">{t('adminPanel.admin.settings.ai.providerWeight', 'Provider Weight')}</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {providerWeight}%
                  </span>
                </div>
                <Slider
                  value={[providerWeight]}
                  onValueChange={([v]) => setProviderWeight(v)}
                  max={100}
                  step={5}
                  data-testid="slider-provider-weight"
                />
                <p className="text-xs text-muted-foreground">
                  {t('adminPanel.admin.settings.ai.providerWeightDescription', 'Provider reliability and reputation score')}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                onClick={handleSaveWeights}
                disabled={saveAISettings.isPending}
                className="bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)]"
                data-testid="button-save-weights"
              >
                {saveAISettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t('adminPanel.admin.settings.ai.saveWeights', 'Save Weights')}
              </Button>
              <Button
                variant="outline"
                onClick={runAISelection}
                disabled={running}
                data-testid="button-run-ai"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('adminPanel.admin.settings.ai.runAISelectionNow', 'Run AI Selection Now')}
              </Button>
            </div>
          </div>
        )}

        {/* Usage Stats */}
        {aiStatus?.usage && aiStatus.usage.totalRequests > 0 && (
          <div className="p-6 rounded-xl bg-gradient-to-r from-[var(--primary-light-hex)]/20 to-transparent border border-[var(--primary-hex)]/30">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-[var(--primary-hex)]" />
              <span className="text-lg font-bold text-[var(--primary-hex)]">
                {t('adminPanel.admin.settings.ai.usageStatistics', 'AI Usage Statistics')}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{aiStatus.usage.totalRequests}</div>
                <div className="text-xs text-muted-foreground">{t('adminPanel.admin.settings.ai.requests', 'Requests')}</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">
                  {(aiStatus.usage.totalTokens / 1000).toFixed(1)}k
                </div>
                <div className="text-xs text-muted-foreground">{t('adminPanel.admin.settings.ai.tokens', 'Tokens')}</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">${aiStatus.usage.estimatedCost.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">{t('adminPanel.admin.settings.ai.estimatedCost', 'Est. Cost')}</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{aiStatus.usage.errors}</div>
                <div className="text-xs text-muted-foreground">{t('adminPanel.admin.settings.ai.errors', 'Errors')}</div>
              </div>
            </div>
          </div>
        )}

        {/* AI Features List */}
        <div className="p-6 rounded-xl bg-gradient-to-r from-[var(--primary-light-hex)]/20 to-transparent border border-[var(--primary-hex)]/30">
          <p className="text-lg font-bold mb-3 text-[var(--primary-hex)]">{t('adminPanel.admin.settings.ai.featuresTitle', 'AI-Powered Features')}</p>
          <ul className="text-sm text-muted-foreground leading-relaxed space-y-2">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              {t('adminPanel.admin.settings.ai.feature1', 'Composite scoring combining price, quality, and provider reliability')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              {t('adminPanel.admin.settings.ai.feature2', 'Intelligent package analysis with value assessments')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              {t('adminPanel.admin.settings.ai.feature3', 'Automatic fallback to price-only mode if AI unavailable')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              {t('adminPanel.admin.settings.ai.feature4', '24-hour result caching to minimize API costs')}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function GeneralSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const dispatch = useAppDispatch();

  // Internal state management
  const [platformName, setPlatformName] = useState('');
  const [platformTagline, setPlatformTagline] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [darkLogo, setDarkLogo] = useState<string | null>(null);
  const [favicon, setFavicon] = useState<string | null>(null);
  const [copyrightText, setCopyrightText] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [email, setEmail] = useState('');
  const [packageSelectionMode, setPackageSelectionMode] = useState<'auto' | 'manual'>('auto');
  const [showDemoLogin, setShowDemoLogin] = useState(false);
  const [whatsappShow, setWhatsappShow] = useState<boolean>(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('0.50');
  const [maxRoundupAmount, setMaxRoundupAmount] = useState('0.20');
  const [logoHeight, setLogoHeight] = useState('28');
  const [logoWidth, setLogoWidth] = useState('');

  // Fetch settings from API
  const { data: settingsResponse } = useQuery<SettingsResponse>({
    queryKey: ['/api/admin/settings'],
  });



  // console.log('settingsResponse', settingsResponse);

  // Fetch available currencies
  const { data: currencies = [] } = useQuery<CurrencyRate[]>({
    queryKey: ['/api/admin/currencies'],
  });

  // Transform settings array to object
  const settings = useMemo(() => {
    if (!settingsResponse) return {};
    if (!Array.isArray(settingsResponse)) {
      return (settingsResponse as any)?.data || settingsResponse || {};
    }

    return settingsResponse.reduce((acc: Record<string, string>, setting: any) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
  }, [settingsResponse]);

  // Load settings into state
  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      setPlatformName(settings.platform_name || '');
      setPlatformTagline(settings.platform_tagline || '');
      setLogo(settings.logo || null);
      setDarkLogo(settings.dark_logo || null);
      setFavicon(settings.favicon || null);
      setCopyrightText(settings.copyright_text || '');
      setCurrency(settings.currency || 'USD');
      setEmail(settings.email || '')
      setPackageSelectionMode((settings.package_selection_mode as 'auto' | 'manual') || 'auto');
      setShowDemoLogin(settings.show_demo_login === 'true');
      setWhatsappShow(settings.whatsapp_show === 'true' || settings.whatsapp_show === true);
      setWhatsappNumber(settings.whatsapp_number || '');
      setMinOrderAmount(settings.min_order_amount || '0.50');
      setMaxRoundupAmount(settings.max_roundup_amount || '0.20');
      setLogoHeight(settings.logo_height || '28');
      setLogoWidth(settings.logo_width || '');
    }
  }, [settings]);

  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({
      key,
      value,
      category,
    }: {
      key: string;
      value: string;
      category: string;
    }) => {
      return await apiRequest('PUT', `/api/admin/settings/${key}`, {
        value,
        category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/public/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/packages'] });
      toast({
        title: t('adminPanel.admin.settings.success', 'Success'),
        description: t('adminPanel.admin.settings.settingsUpdatedSuccess', 'Settings updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('adminPanel.admin.settings.error', 'Error'),
        description:
          error.message || t('adminPanel.admin.settings.failedToUpdateSettings', 'Failed to update settings'),
        variant: 'destructive',
      });
    },
  });

  // Save single setting
  const saveSetting = async (key: string, value: string, category: string = 'general') => {
    await updateSettingMutation.mutateAsync({ key, value, category });
  };

  // Handle general settings save
  const handleSaveGeneral = async () => {
    if (!platformName.trim()) {
      toast({
        title: t('adminPanel.admin.settings.validationError', 'Validation Error'),
        description: t('adminPanel.admin.settings.platformNameRequired', 'Platform name is required'),
        variant: 'destructive',
      });
      return;
    }
    await saveSetting('platform_name', platformName, 'general');
    await saveSetting('platform_tagline', platformTagline, 'general');
    await saveSetting('copyright_text', copyrightText, 'general');
    await saveSetting('currency', currency, 'general');
    await saveSetting('email', email, 'general');
    await saveSetting('show_demo_login', String(showDemoLogin), 'general');
    await saveSetting('package_selection_mode', packageSelectionMode, 'general');
    if (logo) {
      await saveSetting('logo', logo, 'general');
    }
    if (darkLogo) {
      await saveSetting('dark_logo', darkLogo, 'general');
    }
    if (favicon) {
      await saveSetting('favicon', favicon, 'general');
    }
    await saveSetting('whatsapp_show', whatsappShow.toString(), 'general');
    await saveSetting('whatsapp_number', whatsappNumber, 'general');
    await saveSetting('min_order_amount', minOrderAmount, 'pricing');
    await saveSetting('max_roundup_amount', maxRoundupAmount, 'pricing');
    await saveSetting('logo_height', logoHeight, 'general');
    await saveSetting('logo_width', logoWidth, 'general');
  };

  // Upload image helper
  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);

    const res = await apiRequest('POST', '/api/upload', formData);

    if (!res.ok) {
      throw new Error('Image upload failed');
    }

    const data = await res.json();
    // console.log('data', data);
    return data?.data?.fileUrl;
  };

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const path = await uploadImage(file);
      // console.log('path', path);
      setLogo(path);
      toast({
        title: 'Success',
        description: 'Logo uploaded successfully',
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'Failed to upload logo',
        variant: 'destructive',
      });
    }
  };

  // Handle dark logo upload
  const handleDarkLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const path = await uploadImage(file);
      setDarkLogo(path);
      toast({
        title: 'Success',
        description: 'Dark logo uploaded successfully',
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'Failed to upload dark logo',
        variant: 'destructive',
      });
    }
  };

  // Handle favicon upload
  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const path = await uploadImage(file);
      // console.log('path', path);
      setFavicon(path);
      toast({
        title: 'Success',
        description: 'Favicon uploaded successfully',
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'Failed to upload favicon',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Information Card */}
      <Card className="border-0 shadow-xl hover:shadow-[0_25px_50px_-12px_color-mix(in_srgb,var(--primary-hex)_30%,transparent)] transition-all duration-500">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Icon Container: Responsive sizing and brand gradient */}
            <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-xl bg-gradient-to-br from-[var(--primary-hex)] to-[var(--primary-second-hex)] flex items-center justify-center shadow-lg">
              <Globe className="h-5 w-5 sm:h-6 sm:w-6 text-black" />
            </div>

            <div className="space-y-1">
              {/* Title: Gradient text with responsive sizing */}
              <CardTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[var(--primary-hex)] via-[var(--primary-second-hex)] to-[var(--primary-light-hex)] bg-clip-text text-transparent">
                {t('adminPanel.admin.settings.general.platformInfoTitle', 'Platform Information')}
              </CardTitle>

              {/* Description: Clean typography with primary-hex opacity */}
              <CardDescription className="text-sm sm:text-base md:text-lg text-[var(--primary-hex)]/70 leading-relaxed">
                {t(
                  'adminPanel.admin.settings.general.platformInfoDescription',
                  "Configure your platform's basic information and branding"
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>


        <CardContent className="p-4 sm:p-8 space-y-6 sm:space-y-8">
          <div className="flex flex-col gap-8">
            {/* Form Section */}
            <div className="space-y-5">
              {/* Platform Name */}
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[var(--primary-hex)]" />
                  {t('adminPanel.admin.settings.general.platformName', 'Platform Name')}
                </Label>
                <Input
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  placeholder={t('adminPanel.admin.settings.general.platformNamePlaceholder', 'My eSIM Store')}
                  className="h-12 text-base ring-1 ring-[var(--primary-hex)]/20 focus:ring-2"
                />
              </div>

              {/* Tagline */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">
                  {t('adminPanel.admin.settings.general.tagline', 'Tagline')}
                </Label>
                <Input
                  value={platformTagline}
                  onChange={(e) => setPlatformTagline(e.target.value)}
                  placeholder={t('adminPanel.admin.settings.general.taglinePlaceholder', 'Global connectivity made easy')}
                  className="h-12"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[var(--primary-hex)]" />
                  {t('adminPanel.admin.settings.general.email', 'Email')}
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="h-12"
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">
                  {t('adminPanel.admin.settings.general.currency', 'Default Currency')}
                </Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder={t('adminPanel.admin.settings.general.selectCurrency', 'Select currency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((curr) => (
                      <SelectItem key={curr.id} value={curr.code}>
                        <span className="flex items-center gap-2 text-sm">
                          <span className="font-mono">{curr.symbol}</span>
                          <span>{curr.code}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs font-medium p-3 bg-[var(--primary-light-hex)]/10 rounded-lg border border-[var(--primary-hex)]/10">
                  {t('adminPanel.admin.settings.general.currencyHelp', 'Manage currencies in Platform Setup.')}
                </p>
              </div>

              {/* Minimum Order Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-[var(--primary-hex)]" />
                    {t('adminPanel.admin.settings.general.minOrderAmount', 'Small Order Threshold (USD)')}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    placeholder="0.50"
                    className="h-12"
                  />
                  <p className="text-[10px] text-muted-foreground italic leading-tight">
                    {t('adminPanel.admin.settings.general.minOrderAmountHelp', 'Orders below this amount will be adjusted.')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[var(--primary-hex)]" />
                    {t('adminPanel.admin.settings.general.maxRoundupAmount', 'Small Order Target (USD)')}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={maxRoundupAmount}
                    onChange={(e) => setMaxRoundupAmount(e.target.value)}
                    placeholder="1.00"
                    className="h-12"
                  />
                  <p className="text-[10px] text-muted-foreground italic leading-tight">
                    {t('adminPanel.admin.settings.general.maxRoundupAmountHelp', 'Orders below the threshold will be rounded up to this value.')}
                  </p>
                </div>
              </div>

              {/* Logo Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">
                    {t('adminPanel.admin.settings.general.logoHeight', 'Logo Height (px)')}
                  </Label>
                  <Input
                    type="number"
                    value={logoHeight}
                    onChange={(e) => setLogoHeight(e.target.value)}
                    placeholder="28"
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-base font-semibold">
                    {t('adminPanel.admin.settings.general.logoWidth', 'Logo Width (px)')}
                  </Label>
                  <Input
                    type="number"
                    value={logoWidth}
                    onChange={(e) => setLogoWidth(e.target.value)}
                    placeholder="Auto"
                    className="h-12"
                  />
                </div>
              </div>
            </div>

            {/* Assets Section (Logo Uploads) */}
            <div className="space-y-4">
              {/* Light Logo */}
              <div className="p-4 bg-gradient-to-br from-[var(--primary-light-hex)]/10 to-transparent border border-[var(--primary-hex)]/20 rounded-xl">
                <Label className="text-sm font-bold text-[var(--primary-hex)] flex items-center gap-2 mb-3">
                  <ImageIcon className="h-4 w-4" />
                  {t('adminPanel.admin.settings.general.logo', 'Platform Logo')}
                </Label>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="h-20 w-20 shrink-0 rounded-lg overflow-hidden dark:bg-slate-900 dark:text-white bg-white shadow-sm border border-[var(--primary-hex)]/20 flex items-center justify-center">
                    {logo ? (
                      <img src={logo} alt="Preview" className="max-h-16 max-w-16 object-contain" loading="lazy" />
                    ) : (
                      <Building2 className="h-6 w-6 opacity-30" />
                    )}
                  </div>
                  <Input
                    type="file"
                    onChange={handleLogoUpload}
                    className="h-10 text-xs file:text-xs file:px-3"
                  />
                </div>
              </div>

              {/* Dark Logo */}
              <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl">
                <Label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                  <ImageIcon className="h-4 w-4" />
                  {t('adminPanel.admin.settings.general.darkLogo', 'Platform Dark Logo')}
                </Label>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-slate-800 border border-slate-600 flex items-center justify-center">
                    {darkLogo ? (
                      <img src={darkLogo} alt="Dark Preview" className="max-h-16 max-w-16 object-contain" loading="lazy" />
                    ) : (
                      <Building2 className="h-6 w-6 text-slate-500 opacity-50" />
                    )}
                  </div>
                  <Input
                    type="file"
                    onChange={handleDarkLogoUpload}
                    className="h-10 text-xs text-slate-300 file:text-xs file:px-3"
                  />
                </div>
              </div>

              {/* Favicon Upload */}
              <div className="space-y-4 p-6 bg-gradient-to-br from-[var(--primary-light-hex)]/10 to-transparent border border-[var(--primary-hex)]/20 rounded-2xl">
                <Label className="text-lg font-bold text-[var(--primary-hex)]">
                  {t('admin.settings.general.favicon', 'Favicon')}
                </Label>

                <div className="flex items-center gap-4">
                  {favicon ? (
                    <div className="h-16 w-16 rounded-lg overflow-hidden bg-white dark:bg-black/20 shadow-lg border-2 border-[var(--primary-hex)]/30 flex items-center justify-center hover:scale-105 transition-all duration-300">
                      <img src={favicon}
                        alt="Favicon Preview"
                        className="h-10 w-10 object-contain" loading="lazy" />
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-lg border-2 border-dashed border-[var(--primary-hex)]/50 flex items-center justify-center text-[var(--primary-hex)] bg-[var(--primary-light-hex)]/20 text-xs font-semibold hover:scale-105 transition-all duration-300">
                      {t('adminPanel.admin.settings.general.noFavicon', 'No Favicon')}
                    </div>
                  )}

                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/png,image/x-icon,image/svg+xml"
                      onChange={handleFaviconUpload}
                      className="h-12 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-[var(--primary-hex)] file:to-[var(--primary-second-hex)] file:text-black hover:file:brightness-110 cursor-pointer"
                    />
                  </div>
                </div>

                <p className="text-xs text-[var(--primary-hex)]/70 px-3 py-1.5 bg-[var(--primary-light-hex)]/30 rounded-lg">
                  {t('admin.settings.general.faviconHelp', 'Recommended: 32×32 or 48×48 PNG/ICO')}
                </p>
              </div>
            </div>
          </div>

          {/* Copyright Text */}
          <div className="space-y-3">
            <Label className="text-lg font-semibold">
              {t('admin.settings.general.copyright', 'Copyright Text')}
            </Label>
            <Textarea
              value={copyrightText}
              onChange={(e) => setCopyrightText(e.target.value)}
              placeholder={t(
                'admin.settings.general.copyrightPlaceholder',
                '© 2024 My Company. All rights reserved.',
              )}
              rows={3}
              className="ring-2 ring-[var(--primary-hex)]/20 focus:ring-[var(--primary-hex)] focus:border-[var(--primary-hex)] resize-none"
              data-testid="textarea-copyright"
            />
          </div>
          <Button
            onClick={handleSaveGeneral}
            disabled={updateSettingMutation.isPending}
            className="gap-2 h-12 px-8 text-lg bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] hover:from-[var(--primary-dark-hex)] hover:to-[var(--primary-hex)] shadow-lg hover:shadow-glow transition-all duration-300"
            data-testid="button-save-general"
          >
            {updateSettingMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('admin.settings.general.saving', 'Saving...')}
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                {t('admin.settings.general.saveGeneralSettings', 'Save General Settings')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Admin Login Settings Card */}
      <Card className="border-0 shadow-xl hover:shadow-[0_25px_50px_-12px_color-mix(in_srgb,var(--primary-hex)_30%,transparent)] transition-all duration-500">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-xl bg-gradient-to-br from-[var(--primary-hex)] to-[var(--primary-second-hex)] flex items-center justify-center shadow-lg">
              <Settings2 className="h-5 w-5 sm:h-6 sm:w-6 text-black" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[var(--primary-hex)] via-[var(--primary-second-hex)] to-[var(--primary-light-hex)] bg-clip-text text-transparent">
                {t('adminPanel.admin.settings.general.adminSettingsTitle', 'Admin Panel Settings')}
              </CardTitle>
              <CardDescription className="text-sm sm:text-base md:text-lg text-[var(--primary-hex)]/70 leading-relaxed">
                {t(
                  'adminPanel.admin.settings.general.adminSettingsDescription',
                  'Configure settings for the administrative interface'
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-8 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-2xl border-2 border-border bg-gradient-to-br from-muted/30 to-transparent">
            <div className="space-y-0.5">
              <Label className="text-base font-bold flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[var(--primary-hex)]" />
                {t('adminPanel.admin.settings.general.showDemoLogin', 'Show Demo Login Details')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('adminPanel.admin.settings.general.showDemoLoginDesc', 'Toggle display of demo credentials on the admin login page')}
              </p>
            </div>
            <Switch
              checked={showDemoLogin}
              onCheckedChange={setShowDemoLogin}
              data-testid="switch-show-demo-login"
            />
          </div>

          <Button
            onClick={async () => {
              await saveSetting('show_demo_login', String(showDemoLogin), 'general');
            }}
            disabled={updateSettingMutation.isPending}
            className="gap-2 h-12 px-8 text-lg bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] hover:from-[var(--primary-dark-hex)] hover:to-[var(--primary-hex)] shadow-lg hover:shadow-glow transition-all duration-300"
          >
            {updateSettingMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('admin.settings.general.saving', 'Saving...')}
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                {t('adminPanel.admin.settings.general.saveAdminSettings', 'Save Admin Settings')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Package Selection Mode Card */}
      <Card className="border-0 shadow-xl hover:shadow-[0_25px_50px_-12px_color-mix(in_srgb,var(--primary-hex)_30%,transparent)] transition-all duration-500">
        <CardHeader>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] bg-clip-text text-transparent">
            {t('admin.settings.general.packageModeTitle', 'Package Selection Mode')}
          </CardTitle>
          <CardDescription className="text-lg text-[var(--primary-hex)]/70">
            {t(
              'admin.settings.general.packageModeDescription',
              'Configure how packages are automatically enabled from multiple providers',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-8">
          <div className="space-y-4">
            {/* Auto Mode */}
            <div
              className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:shadow-lg ${packageSelectionMode === 'auto'
                ? 'border-[var(--primary-hex)] bg-gradient-to-br from-[var(--primary-light-hex)]/20 to-[var(--primary-hex)]/10 shadow-[0_10px_30px_-10px_color-mix(in_srgb,var(--primary-hex)_40%,transparent)]'
                : 'border-border hover:border-[var(--primary-hex)]/50 hover-elevate'
                }`}
              onClick={() => setPackageSelectionMode('auto')}
              data-testid="option-auto-mode"
            >
              <div className="flex items-start gap-4">
                <div className="flex items-center h-6">
                  <div
                    className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${packageSelectionMode === 'auto'
                      ? 'border-[var(--primary-hex)] shadow-[0_0_10px_color-mix(in_srgb,var(--primary-hex)_50%,transparent)]'
                      : 'border-muted-foreground'
                      }`}
                  >
                    {packageSelectionMode === 'auto' && (
                      <div className="h-3 w-3 rounded-full bg-gradient-to-br from-[var(--primary-hex)] to-[var(--primary-second-hex)] shadow-glow-sm"></div>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-xl font-bold mb-2 flex items-center gap-2">
                    {t('admin.settings.general.autoMode', 'Auto (Best Price)')}
                    {packageSelectionMode === 'auto' && (
                      <Badge className="bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] text-black font-semibold shadow-md">
                        {t('admin.settings.general.active', 'Active')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {t(
                      'admin.settings.general.autoModeDescription',
                      'Automatically enable packages with the best price across all providers. When multiple providers offer the same best price, packages from the preferred provider are enabled.',
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className="text-xs border-[var(--primary-hex)]/40 bg-[var(--primary-light-hex)]/20 text-[var(--primary-hex)]"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('admin.settings.general.priceComparison', 'Price Comparison')}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs border-[var(--primary-hex)]/40 bg-[var(--primary-light-hex)]/20 text-[var(--primary-hex)]"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t(
                        'admin.settings.general.preferredProviderFallback',
                        'Preferred Provider Fallback',
                      )}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs border-[var(--primary-hex)]/40 bg-[var(--primary-light-hex)]/20 text-[var(--primary-hex)]"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('admin.settings.general.automaticUpdates', 'Automatic Updates')}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Mode */}
            <div
              className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:shadow-lg ${packageSelectionMode === 'manual'
                ? 'border-[var(--primary-hex)] bg-gradient-to-br from-[var(--primary-light-hex)]/20 to-[var(--primary-hex)]/10 shadow-[0_10px_30px_-10px_color-mix(in_srgb,var(--primary-hex)_40%,transparent)]'
                : 'border-border hover:border-[var(--primary-hex)]/50 hover-elevate'
                }`}
              onClick={() => setPackageSelectionMode('manual')}
              data-testid="option-manual-mode"
            >
              <div className="flex items-start gap-4">
                <div className="flex items-center h-6">
                  <div
                    className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${packageSelectionMode === 'manual'
                      ? 'border-[var(--primary-hex)] shadow-[0_0_10px_color-mix(in_srgb,var(--primary-hex)_50%,transparent)]'
                      : 'border-muted-foreground'
                      }`}
                  >
                    {packageSelectionMode === 'manual' && (
                      <div className="h-3 w-3 rounded-full bg-gradient-to-br from-[var(--primary-hex)] to-[var(--primary-second-hex)] shadow-glow-sm"></div>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-xl font-bold mb-2 flex items-center gap-2">
                    {t('admin.settings.general.manualMode', 'Manual Selection')}
                    {packageSelectionMode === 'manual' && (
                      <Badge className="bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] text-black font-semibold shadow-md">
                        {t('admin.settings.general.active', 'Active')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {t(
                      'admin.settings.general.manualModeDescription',
                      'Full control over which packages are enabled. You manually choose which packages from which providers are visible to customers. Price comparison still runs but packages are not auto-enabled.',
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className="text-xs border-[var(--primary-hex)]/40 bg-[var(--primary-light-hex)]/20 text-[var(--primary-hex)]"
                    >
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {t('admin.settings.general.manualControl', 'Manual Control')}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs border-[var(--primary-hex)]/40 bg-[var(--primary-light-hex)]/20 text-[var(--primary-hex)]"
                    >
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {t('admin.settings.general.noAutoUpdates', 'No Auto Updates')}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Current Mode Info */}
          <div className="p-6 rounded-xl bg-gradient-to-r from-[var(--primary-light-hex)]/20 to-transparent border border-[var(--primary-hex)]/30 backdrop-blur-sm">
            <p className="text-lg font-bold mb-3 text-[var(--primary-hex)]">
              {t('admin.settings.general.currentMode', 'Current Mode')}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {packageSelectionMode === 'auto'
                ? t(
                  'admin.settings.general.autoModeActive',
                  'Auto mode is active. Packages are automatically enabled based on best price. Configure your preferred provider in the Providers page to set the fallback when multiple providers have the same price.',
                )
                : t(
                  'admin.settings.general.manualModeActive',
                  'Manual mode is active. You have full control over package visibility. Use the Package Management page to enable/disable specific packages.',
                )}
            </p>
          </div>

          <Button
            onClick={() => saveSetting('package_selection_mode', packageSelectionMode, 'general')}
            disabled={updateSettingMutation.isPending}
            className="gap-2 h-12 px-8 text-lg bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] hover:from-[var(--primary-dark-hex)] hover:to-[var(--primary-hex)] shadow-lg hover:shadow-glow transition-all duration-300"
            data-testid="button-save-package-mode"
          >
            {updateSettingMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('admin.settings.general.saving', 'Saving...')}
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                {t('admin.settings.general.savePackageMode', 'Save Package Mode')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* WhatsApp Support Card */}
      <Card className="border-0 shadow-xl hover:shadow-[0_25px_50px_-12px_color-mix(in_srgb,var(--primary-hex)_30%,transparent)] transition-all duration-500">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg">
              <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#25D366] to-[#128C7E] bg-clip-text text-transparent">
                {t('admin.settings.whatsapp.title', 'WhatsApp Support')}
              </CardTitle>
              <CardDescription className="text-sm sm:text-base md:text-lg text-zinc-500 leading-relaxed">
                {t(
                  'admin.settings.whatsapp.description',
                  'Enable global WhatsApp support icon for your customers',
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-8">
          <div className="flex items-center justify-between p-6 rounded-2xl border border-[var(--primary-hex)]/20 bg-[var(--primary-light-hex)]/5">
            <div className="space-y-1">
              <Label className="text-xl font-bold flex items-center gap-2">
                <MessageCircle className="h-6 w-6 text-green-500" />
                {t('admin.settings.whatsapp.showIcon', 'Show WhatsApp Icon')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('admin.settings.whatsapp.showIconHelp', 'Enable or disable the floating WhatsApp support button on the frontend.')}
              </p>
            </div>
            <Switch
              checked={whatsappShow}
              onCheckedChange={setWhatsappShow}
              className="data-[state=checked]:bg-green-500"
            />
          </div>

          {whatsappShow && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="space-y-3">
                <Label className="text-lg font-semibold">
                  {t('admin.settings.whatsapp.number', 'WhatsApp Number')}
                </Label>
                <Input
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder={t('admin.settings.whatsapp.numberPlaceholder', '+1234567890')}
                  className="h-12 text-lg ring-2 ring-[var(--primary-hex)]/20 focus:ring-[var(--primary-hex)] focus:border-[var(--primary-hex)] transition-all duration-300"
                />
                <p className="text-xs text-muted-foreground px-2">
                  {t('admin.settings.whatsapp.numberHelp', 'Include country code without any spaces or special characters (e.g., +15551234567)')}
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handleSaveGeneral}
            disabled={updateSettingMutation.isPending}
            className="gap-2 h-12 px-8 text-lg bg-gradient-to-r from-[var(--primary-hex)] to-[var(--primary-second-hex)] hover:from-[var(--primary-dark-hex)] hover:to-[var(--primary-hex)] shadow-lg hover:shadow-glow transition-all duration-300"
          >
            {updateSettingMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('admin.settings.general.saving', 'Saving...')}
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                {t('admin.settings.whatsapp.save', 'Save WhatsApp Settings')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* AI-Enhanced Package Selection Card */}
      <AISettingsCard />
    </div>
  );
}
