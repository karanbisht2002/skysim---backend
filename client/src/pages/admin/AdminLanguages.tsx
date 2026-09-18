import { useTranslation } from '@/contexts/TranslationContext';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Globe, Plus, Star, Edit, Trash2, Check, Languages } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';

const POPULAR_LANGUAGES = [
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', flag: 'ZA', isRTL: false },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', flag: 'ET', isRTL: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: 'SA', isRTL: true },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', flag: 'AZ', isRTL: false },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: 'BD', isRTL: false },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', flag: 'BG', isRTL: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: 'CN', isRTL: false },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', flag: 'HR', isRTL: false },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: 'CZ', isRTL: false },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: 'DK', isRTL: false },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: 'NL', isRTL: false },
  { code: 'en', name: 'English', nativeName: 'English', flag: 'US', isRTL: false },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: 'FI', isRTL: false },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: 'FR', isRTL: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: 'DE', isRTL: false },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: 'GR', isRTL: false },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: 'IL', isRTL: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: 'IN', isRTL: false },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: 'HU', isRTL: false },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: 'ID', isRTL: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: 'IT', isRTL: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: 'JP', isRTL: false },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: 'KR', isRTL: false },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: 'MY', isRTL: false },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: 'NO', isRTL: false },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: 'IR', isRTL: true },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: 'PL', isRTL: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: 'PT', isRTL: false },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: 'RO', isRTL: false },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: 'RU', isRTL: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: 'ES', isRTL: false },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: 'SE', isRTL: false },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: 'TH', isRTL: false },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: 'TR', isRTL: false },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: 'UA', isRTL: false },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: 'PK', isRTL: true },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: 'VN', isRTL: false },
];

const COMMON_FLAGS = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AT', name: 'Austria' },
  { code: 'AU', name: 'Australia' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DE', name: 'Germany' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ES', name: 'Spain' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HR', name: 'Croatia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IN', name: 'India' },
  { code: 'IR', name: 'Iran' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'RS', name: 'Serbia' },
  { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'US', name: 'United States' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'ZA', name: 'South Africa' }
];

interface Language {
  id: string;
  code: string;
  name: string;
  nativeName: string;
  flagCode: string;
  isRTL: boolean;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
}

export default function AdminLanguages() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState<Language | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    nativeName: '',
    flagCode: '',
    isRTL: false,
    isEnabled: true,
    sortOrder: 1,
  });

  const { data: languages = [], isLoading } = useQuery<Language[]>({
    queryKey: ['/api/admin/languages'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('POST', '/api/admin/languages', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/languages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/languages'] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: 'Success', description: 'Language created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return apiRequest('PUT', `/api/admin/languages/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/languages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/languages'] });
      setEditingLanguage(null);
      resetForm();
      toast({ title: 'Success', description: 'Language updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/admin/languages/${id}/set-default`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/languages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/languages'] });
      toast({ title: 'Success', description: 'Default language updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/admin/languages/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/languages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/languages'] });
      toast({ title: 'Success', description: 'Language deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      nativeName: '',
      flagCode: '',
      isRTL: false,
      isEnabled: true,
      sortOrder: languages.length + 1,
    });
  };

  const handleEdit = (language: Language) => {
    setEditingLanguage(language);
    setFormData({
      code: language.code,
      name: language.name,
      nativeName: language.nativeName,
      flagCode: language.flagCode,
      isRTL: language.isRTL,
      isEnabled: language.isEnabled,
      sortOrder: language.sortOrder,
    });
  };

  const handleSubmit = () => {
    if (editingLanguage) {
      updateMutation.mutate({ id: editingLanguage.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleToggleEnabled = (language: Language) => {
    updateMutation.mutate({
      id: language.id,
      data: { isEnabled: !language.isEnabled },
    });
  };

  return (
    <>
      <div className="space-y-6 dark:text-white">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Languages className="h-5 w-5 md:h-6 md:w-6" />
              {t('adminPanel.admin.languageManagement.title', 'Language Management')}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              {t('adminPanel.admin.languageManagement.subtitle', 'Manage supported languages for your platform')}
            </p>
          </div>

          <Dialog
            open={isAddDialogOpen || !!editingLanguage}
            onOpenChange={(open) => {
              if (!open) {
                setIsAddDialogOpen(false);
                setEditingLanguage(null);
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                data-testid="button-add-language"
                className="w-full md:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('adminPanel.admin.languageManagement.addLanguage', 'Add Language')}
              </Button>
            </DialogTrigger>

            {/* Dialog Content */}
            <DialogContent className="max-w-[95vw] md:max-w-lg rounded-lg overflow-y-auto max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>
                  {editingLanguage
                    ? t('adminPanel.admin.languageManagement.editLanguage', 'Edit Language')
                    : t('adminPanel.admin.languageManagement.addNewLanguage', 'Add New Language')}
                </DialogTitle>
                <DialogDescription>
                  {editingLanguage
                    ? t('adminPanel.admin.languageManagement.updateLanguageDetails', 'Update language details')
                    : t('adminPanel.admin.languageManagement.addNewLanguageDescription', 'Add a new language to your platform')}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">
                      {t('adminPanel.admin.languageManagement.languageCode', 'Language Code')}
                    </Label>
                    <Select
                      value={formData.code}
                      onValueChange={(val) => {
                        const lang = POPULAR_LANGUAGES.find((l) => l.code === val);
                        if (lang) {
                          setFormData({
                            ...formData,
                            code: lang.code,
                            name: lang.name,
                            nativeName: lang.nativeName,
                            flagCode: lang.flag,
                            isRTL: lang.isRTL,
                          });
                        } else {
                          setFormData({ ...formData, code: val });
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-language-code">
                        <SelectValue placeholder={t('adminPanel.admin.languageManagement.selectLanguage', 'Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {POPULAR_LANGUAGES.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            {lang.name} ({lang.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flagCode">
                      {t('adminPanel.admin.languageManagement.flagCode', 'Flag Code')}
                    </Label>
                    <Select
                      value={formData.flagCode}
                      onValueChange={(val) => setFormData({ ...formData, flagCode: val })}
                    >
                      <SelectTrigger data-testid="select-flag-code">
                        <SelectValue placeholder={t('adminPanel.admin.languageManagement.selectFlag', 'Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_FLAGS.map((flag) => (
                          <SelectItem key={flag.code} value={flag.code}>
                            <div className="flex items-center gap-2">
                              <ReactCountryFlag countryCode={flag.code} svg />
                              {flag.name} ({flag.code})
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      {t('adminPanel.admin.languageManagement.nameEnglish', 'Name (English)')}
                    </Label>
                    <Input
                      id="name"
                      placeholder={t('adminPanel.admin.languageManagement.nameEnglish', 'English')}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      data-testid="input-language-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nativeName">
                      {t('adminPanel.admin.languageManagement.nativeName', 'Native Name')}
                    </Label>
                    <Input
                      id="nativeName"
                      placeholder={t('adminPanel.admin.languageManagement.nativeName', 'Native Name')}
                      value={formData.nativeName}
                      onChange={(e) => setFormData({ ...formData, nativeName: e.target.value })}
                      data-testid="input-native-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <Label htmlFor="sortOrder">
                      {t('adminPanel.admin.languageManagement.sortOrder', 'Sort Order')}
                    </Label>
                    <Input
                      id="sortOrder"
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) =>
                        setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 1 })
                      }
                      data-testid="input-sort-order"
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-2 md:pt-0 pb-2">
                    <Switch
                      id="isRTL"
                      checked={formData.isRTL}
                      onCheckedChange={(checked) => setFormData({ ...formData, isRTL: checked })}
                    />
                    <Label htmlFor="isRTL">
                      {t('adminPanel.admin.languageManagement.rtlLanguage', 'RTL Language')}
                    </Label>
                  </div>
                </div>

                <div className="flex items-center space-x-2 border-t pt-4">
                  <Switch
                    id="isEnabled"
                    checked={formData.isEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                  />
                  <Label htmlFor="isEnabled" className="font-semibold">
                    {t('adminPanel.admin.languageManagement.enabled', 'Enabled')}
                  </Label>
                </div>
              </div>

              {/* Footer */}
              <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setEditingLanguage(null);
                    resetForm();
                  }}
                >
                  {t('adminPanel.admin.languageManagement.cancel', 'Cancel')}
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-language"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? t('adminPanel.admin.languageManagement.saving', 'Saving...')
                    : editingLanguage
                      ? t('adminPanel.admin.languageManagement.update', 'Update')
                      : t('adminPanel.admin.languageManagement.create', 'Create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('adminPanel.admin.languageManagement.totalLanguages', 'Total Languages')}
              </CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{languages.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('adminPanel.admin.languageManagement.enabled', 'Enabled')}
              </CardTitle>
              <Check className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {languages.filter((l) => l.isEnabled).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('adminPanel.admin.languageManagement.rtlLanguages', 'RTL Languages')}
              </CardTitle>
              <Languages className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{languages.filter((l) => l.isRTL).length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Language Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('adminPanel.admin.languageManagement.languages', 'Languages')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                {t('adminPanel.admin.languageManagement.loading', 'Loading languages...')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      {t('adminPanel.admin.languageManagement.order', 'Order')}
                    </TableHead>
                    <TableHead>{t('adminPanel.admin.languageManagement.flag', 'Flag')}</TableHead>
                    <TableHead>{t('adminPanel.admin.languageManagement.code', 'Code')}</TableHead>
                    <TableHead>{t('adminPanel.admin.languageManagement.name', 'Name')}</TableHead>
                    <TableHead>
                      {t('adminPanel.admin.languageManagement.nativeName', 'Native Name')}
                    </TableHead>
                    <TableHead>{t('adminPanel.admin.languageManagement.rtl', 'RTL')}</TableHead>
                    <TableHead>{t('adminPanel.admin.languageManagement.status', 'Status')}</TableHead>
                    <TableHead className="text-right">
                      {t('adminPanel.admin.languageManagement.actions', 'Actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {languages
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((language) => (
                      <TableRow key={language.id} data-testid={`row-language-${language.code}`}>
                        <TableCell>{language.sortOrder}</TableCell>
                        <TableCell>
                          <ReactCountryFlag
                            countryCode={language.flagCode}
                            svg
                            style={{ width: '24px', height: '18px' }}
                          />
                        </TableCell>
                        <TableCell className="font-mono">{language.code}</TableCell>
                        <TableCell>{language.name}</TableCell>
                        <TableCell>{language.nativeName}</TableCell>
                        <TableCell>
                          {language.isRTL ? (
                            <Badge variant="secondary">
                              {t('adminPanel.admin.languageManagement.rtlBadge', 'RTL')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              {t('adminPanel.admin.languageManagement.ltr', 'LTR')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={language.isEnabled}
                              onCheckedChange={() => handleToggleEnabled(language)}
                              disabled={language.isDefault}
                            />
                            {language.isDefault && (
                              <Badge className="bg-amber-500">
                                <Star className="h-3 w-3 mr-1" />
                                {t('adminPanel.admin.languageManagement.default', 'Default')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!language.isDefault && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDefaultMutation.mutate(language.id)}
                                disabled={setDefaultMutation.isPending}
                                data-testid={`button-set-default-${language.code}`}
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(language)}
                              data-testid={`button-edit-${language.code}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!language.isDefault && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(t('adminPanel.admin.languageManagement.deleteConfirmation', 'Are you sure you want to delete this language?'))) {
                                    deleteMutation.mutate(language.id);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-${language.code}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
