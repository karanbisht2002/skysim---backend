import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Save,
  Building2,
  Mail,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Plus,
  Trash2,
  CreditCard,
  Wallet,
  Loader2,
  Palette,
  User,
  Flame,
  Bot,
  ImageIcon,
  Globe
} from 'lucide-react';
import { SiPaypal, SiApplepay, SiGooglepay } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { CurrencyRate } from '@shared/schema';
import { useTranslation } from '@/contexts/TranslationContext';
import { CurrencyManagement } from '@/components/admin/tabs/CurrencyManagement';
import { GeneralSettings } from '@/components/admin/tabs/GeneralSettings';
import { SMTPSettings } from '@/components/admin/tabs/SMTPSettings';
import { FirebaseSettings } from '@/components/admin/tabs/FirebaseSettings';
import { ReCaptchaSettings } from '@/components/admin/tabs/ReCaptchaSettings';
import { ThemeSettings } from './tabs/ThemeSettings';
import { useSettingByKey } from '@/hooks/useSettings';
import { SocialMediaSettings } from '@/components/admin/tabs/SocialMediaSettings';
import { AdminAccountSettings } from '@/components/admin/tabs/AdminAccountSettings';
import { HomepagePopupSettings } from '@/components/admin/tabs/HomepagePopupSettings';
import { AppStoreSettings } from '@/components/admin/tabs/AppStoreSettings';
import { SEOSettings } from '@/components/admin/tabs/SEOSettings';

function PaymentMethodsManagement() {
  const { toast } = useToast();
  const [paymentSettings, setPaymentSettings] = useState<any[]>([
    {
      method: 'card',
      enabled: true,
      minimumAmount: '0',
      settings: { instructions: 'Credit/Debit cards accepted' },
    },
    {
      method: 'paypal',
      enabled: true,
      minimumAmount: '0',
      settings: { instructions: 'Pay with your PayPal account' },
    },
    {
      method: 'apple_pay',
      enabled: true,
      minimumAmount: '0',
      settings: { instructions: 'Available on Safari and iOS devices' },
    },
    {
      method: 'google_pay',
      enabled: true,
      minimumAmount: '0',
      settings: { instructions: 'Available on Chrome and Android devices' },
    },
  ]);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/payment-settings'],
    onSuccess: (data: any) => {
      if (data && data.length > 0) {
        setPaymentSettings(data);
      }
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: any[]) => {
      return await apiRequest('PUT', '/api/admin/payment-settings', {
        settings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/admin/payment-settings'],
      });
      toast({
        title: 'Success',
        description: 'Payment methods settings saved successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save payment settings',
        variant: 'destructive',
      });
    },
  });

  const handleToggle = (method: string) => {
    setPaymentSettings((prev) =>
      prev.map((setting) =>
        setting.method === method ? { ...setting, enabled: !setting.enabled } : setting,
      ),
    );
  };

  const handleMinAmountChange = (method: string, value: string) => {
    setPaymentSettings((prev) =>
      prev.map((setting) =>
        setting.method === method ? { ...setting, minimumAmount: value } : setting,
      ),
    );
  };

  const handleInstructionsChange = (method: string, value: string) => {
    setPaymentSettings((prev) =>
      prev.map((setting) =>
        setting.method === method
          ? {
            ...setting,
            settings: { ...setting.settings, instructions: value },
          }
          : setting,
      ),
    );
  };

  const handleSave = () => {
    saveSettingsMutation.mutate(paymentSettings);
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'card':
        return <CreditCard className="h-5 w-5" />;
      case 'paypal':
        return <SiPaypal className="h-5 w-5 text-[#00457C]" />;
      case 'apple_pay':
        return <SiApplepay className="h-5 w-5" />;
      case 'google_pay':
        return <SiGooglepay className="h-5 w-5" />;
      default:
        return <Wallet className="h-5 w-5" />;
    }
  };

  const getMethodName = (method: string) => {
    switch (method) {
      case 'card':
        return 'Credit/Debit Cards';
      case 'paypal':
        return 'PayPal';
      case 'apple_pay':
        return 'Apple Pay';
      case 'google_pay':
        return 'Google Pay';
      default:
        return method;
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>Payment Methods</CardTitle>
        <CardDescription>Configure available payment methods for customers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {paymentSettings.map((setting) => (
          <Card key={setting.method} className="bg-muted/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getMethodIcon(setting.method)}
                  <div>
                    <div className="font-medium">{getMethodName(setting.method)}</div>
                    <div className="text-xs text-muted-foreground">
                      {setting.method === 'card'
                        ? 'Always enabled (primary payment method)'
                        : 'Can be enabled or disabled'}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={setting.enabled}
                  onCheckedChange={() => handleToggle(setting.method)}
                  disabled={setting.method === 'card'}
                  data-testid={`switch-${setting.method}`}
                />
              </div>

              {setting.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`min-${setting.method}`}>Minimum Amount ($)</Label>
                      <Input
                        id={`min-${setting.method}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={setting.minimumAmount}
                        onChange={(e) => handleMinAmountChange(setting.method, e.target.value)}
                        data-testid={`input-min-${setting.method}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('common.status', 'Status')}</Label>
                      <Badge variant={setting.enabled ? 'default' : 'secondary'}>
                        {setting.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`instructions-${setting.method}`}>
                      Instructions for Customers
                    </Label>
                    <Textarea
                      id={`instructions-${setting.method}`}
                      value={setting.settings?.instructions || ''}
                      onChange={(e) => handleInstructionsChange(setting.method, e.target.value)}
                      placeholder="Enter instructions displayed to customers"
                      rows={2}
                      data-testid={`textarea-instructions-${setting.method}`}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}

        <Button
          onClick={handleSave}
          disabled={saveSettingsMutation.isPending}
          className="w-full"
          data-testid="button-save-payment-settings"
        >
          {saveSettingsMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Payment Settings
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [platformName, setPlatformName] = useState('');
  const [platformTagline, setPlatformTagline] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [favicon, setFavicon] = useState<string | null>(null);
  const [copyrightText, setCopyrightText] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('noreply@gmail.com');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');

  // Package selection mode
  const [packageSelectionMode, setPackageSelectionMode] = useState('auto');

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['/api/admin/settings'],
  });

  const siteName = useSettingByKey('platform_name');

  // console.log('siteName', siteName);

  useEffect(() => {
    if (settings) {
      setPlatformName(settings.platform_name || '');
      setPlatformTagline(settings.platform_tagline || '');
      setLogo(settings.logo || null);
      setFavicon(settings.favicon || null);
      setCopyrightText(settings.copyright_text || '');
      setCurrency(settings.currency || 'USD');
      setSmtpHost(settings.smtp_host || '');
      setSmtpPort(settings.smtp_port || '');
      setSmtpUser(settings.smtp_user || '');
      setSmtpFromEmail(settings.smtp_from_email);
      setSmtpPass(settings.smtp_pass || '');
      setPackageSelectionMode(settings.package_selection_mode || 'auto');
    }
  }, [settings]);

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

  const saveSetting = async (key: string, value: string, category: string = 'general') => {
    await updateSettingMutation.mutateAsync({ key, value, category });
  };

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
    if (logo) {
      await saveSetting('logo', logo, 'general');
    }
    if (favicon) {
      await saveSetting('favicon', favicon, 'general');
    }
  };

  const handleSaveSmtp = async () => {
    await saveSetting('smtp_host', smtpHost, 'smtp');
    await saveSetting('smtp_port', smtpPort, 'smtp');
    await saveSetting('smtp_user', smtpUser, 'smtp');
    await saveSetting('smtp_pass', smtpPass, 'smtp');
    await saveSetting('smtp_from_email', smtpFromEmail, 'smtp');
  };

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);

    const res = await apiRequest('POST', '/api/upload', formData);

    if (!res.ok) {
      throw new Error('Image upload failed');
    }

    const data = await res.json();
    return data.fileUrl; // 👈 saved path
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const path = await uploadImage(file);
      console.log('Uploaded logo path:', path);
      setLogo(path); // 👈 store path, not base64
    } catch (err) {
      console.error(err);
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const path = await uploadImage(file);
      console.log('Uploaded favicon path:', path);
      setFavicon(path);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    console.log('LOGO STATE:', logo);
    console.log('FAVICON STATE:', favicon);
  }, [logo, favicon]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
          {t('adminPanel.admin.settings.title', 'Global Settings')}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          {t('adminPanel.admin.settings.description', 'Configure system-wide settings')}
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <div className="relative">
          <div className="overflow-x-auto scrollbar-hide pb-2">
            <TabsList className="flex min-w-max gap-2 p-1 bg-muted/50" data-testid="tabs-settings">
              <TabsTrigger
                value="general"
                className="gap-1 whitespace-nowrap"
                data-testid="tab-general"
              >
                <Building2 className="h-4 shrink-0" />
                <span className="hidden sm:inline">{t('adminPanel.admin.settings.generalTab', 'General')}</span>
                <span className="sm:hidden">{t('adminPanel.admin.settings.generalTab', 'General')}</span>
              </TabsTrigger>
              {/* <TabsTrigger
                value="currency"
                className="gap-1 whitespace-nowrap"
                data-testid="tab-currency"
              >
                <DollarSign className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t('adminPanel.admin.settings.currencyTab', 'Currency')}</span>
                <span className="sm:hidden">Currency</span>
              </TabsTrigger> */}
              <TabsTrigger value="smtp" className="gap-1 whitespace-nowrap" data-testid="tab-smtp">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t('adminPanel.admin.settings.smtpTab', 'SMTP')}</span>
                <span className="sm:hidden">SMTP</span>
              </TabsTrigger>
              <TabsTrigger
                value="firebase"
                className="gap-2 whitespace-nowrap"
                data-testid="tab-firebase"
              >
                <Flame className="h-4 w-4 shrink-0" />
                {t('adminPanel.admin.settings.firebaseTab', 'Firebase')}
              </TabsTrigger>

              <TabsTrigger
                value="recaptcha"
                className="gap-2 whitespace-nowrap"
                data-testid="tab-recaptcha"
              >
                <Bot className="h-4 w-4 shrink-0" />
                {t("adminPanel.admin.settings.recaptchaTab","reCAPTCHA")}
              </TabsTrigger>

              <TabsTrigger
                value="app-store"
                className="gap-2 whitespace-nowrap"
                data-testid="tab-app-store"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t("adminPanel.admin.settings.appStoresTab", "App Stores")}</span>
                <span className="sm:hidden">Apps</span>
              </TabsTrigger>

              <TabsTrigger
                value="theme"
                className="gap-1 whitespace-nowrap"
                data-testid="tab-theme"
              >
                <Palette className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t("adminPanel.admin.settings.appearanceTab", "Appearance")}</span>
                <span className="sm:hidden">Theme</span>
              </TabsTrigger>
              <TabsTrigger
                value="social-media"
                className="gap-1 whitespace-nowrap"
                data-testid="social-media"
              >
                <Palette className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t("adminPanel.admin.settings.socialMediaTab","Social Media")}</span>
                <span className="sm:hidden">Social</span>
              </TabsTrigger>
              <TabsTrigger
                value="seo"
                className="gap-1 whitespace-nowrap"
                data-testid="tab-seo"
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t("adminPanel.admin.settings.seoTab","SEO & Meta")}</span>
                <span className="sm:hidden">SEO</span>
              </TabsTrigger>
              <TabsTrigger
                value="account"
                className="gap-1 whitespace-nowrap"
                data-testid="tab-account"
              >
                <User className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t("adminPanel.admin.settings.accountTab","Account & Security")}</span>
                <span className="sm:hidden">Account</span>
              </TabsTrigger>
              <TabsTrigger
                value="popup"
                className="gap-1 whitespace-nowrap"
                data-testid="tab-popup"
              >
                <ImageIcon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t("adminPanel.admin.settings.popupTab","Homepage Popup")}</span>
                <span className="sm:hidden">Popup</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="general" className="space-y-4">
          <GeneralSettings />
        </TabsContent>

        {/* Currency Management Tab */}
        <TabsContent value="currency" className="space-y-4">
          <CurrencyManagement />
        </TabsContent>

        {/* Payment Methods Tab */}
        {/* <TabsContent value="payment-methods" className="space-y-4">
          <PaymentMethodsManagement />
        </TabsContent> */}

        <TabsContent value="smtp" className="space-y-4">
          <SMTPSettings />
        </TabsContent>

        <TabsContent value="firebase" className="space-y-4">
          <FirebaseSettings />
        </TabsContent>

        <TabsContent value="recaptcha" className="space-y-4">
          <ReCaptchaSettings />
        </TabsContent>

        <TabsContent value="app-store" className="space-y-4">
          <AppStoreSettings />
        </TabsContent>

        <TabsContent value="theme" className="space-y-4">
          <ThemeSettings />
        </TabsContent>

        <TabsContent value="social-media" className="space-y-4">
          <SocialMediaSettings />
        </TabsContent>
        <TabsContent value="seo" className="space-y-4">
          <SEOSettings />
        </TabsContent>
        <TabsContent value="account" className="space-y-4">
          <AdminAccountSettings />
        </TabsContent>
        <TabsContent value="popup" className="space-y-4">
          <HomepagePopupSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
