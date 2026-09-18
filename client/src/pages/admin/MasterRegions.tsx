import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Globe, Search, Package, Edit2, Check, X, Image, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTranslation } from '@/contexts/TranslationContext';

interface Region {
  id: string;
  name: string;
  slug: string;
  airaloId: string | null;
  countries: string[] | null;
  image: string | null;
  bannerImage: string | null;
  active: boolean;
  isTop: boolean;
  createdAt: string;
  updatedAt: string;
  packageCounts: {
    airalo: number;
    esimAccess: number;
    esimGo: number;
    total: number;
  };
}

export default function MasterRegions() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: regionsData, isLoading } = useQuery<{
    success: boolean;
    data: Region[];
  }>({
    queryKey: ['/api/admin/master-regions', { search: debouncedSearch }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      const res = await fetch(`/api/admin/master-regions?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch regions');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest('PATCH', `/api/admin/master-regions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Region updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/master-regions'] });
      setEditingRegion(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update region',
        variant: 'destructive',
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/master-regions/sync', {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Sync Complete',
        description: `Created ${data.data?.regionsCreated || 0} regions, updated ${data.data?.regionsUpdated || 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/master-regions'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync regions',
        variant: 'destructive',
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ id, file, type }: { id: string; file: File; type: 'image' | 'banner' }) => {
      const formData = new FormData();
      formData.append('image', file);

      const endpoint = type === 'banner'
        ? `/api/admin/master-regions/${id}/upload-banner`
        : `/api/admin/master-regions/${id}/upload-image`;

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Upload failed');
      }

      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'File uploaded successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/master-regions'] });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
    },
  });

  const regions = regionsData?.data || [];
  const totalPackages = regions.reduce((sum, r) => sum + r.packageCounts.total, 0);

  const handleEditClick = (region: Region) => {
    setEditingRegion(region);
    setSelectedFile(null);
    setSelectedBannerFile(null);
    setPreviewUrl(region.image || null);
    setBannerPreviewUrl(region.bannerImage || null);
  };

  const handleCloseDialog = () => {
    setEditingRegion(null);
    setSelectedFile(null);
    setSelectedBannerFile(null);
    setPreviewUrl(null);
    setBannerPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (bannerInputRef.current) {
      bannerInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === 'image') {
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setSelectedBannerFile(file);
        setBannerPreviewUrl(URL.createObjectURL(file));
      }
    }
  };

  const handleUploadFiles = () => {
    if (!editingRegion) return;

    if (selectedFile) {
      uploadMutation.mutate({ id: editingRegion.id, file: selectedFile, type: 'image' });
    }

    if (selectedBannerFile) {
      uploadMutation.mutate({ id: editingRegion.id, file: selectedBannerFile, type: 'banner' });
    }
  };

  const handleToggleActive = (region: Region) => {
    updateMutation.mutate({ id: region.id, data: { active: !region.active } });
  };

  const handleToggleTop = (region: Region) => {
    updateMutation.mutate({ id: region.id, data: { isTop: !region.isTop } });
  };

  return (
    <div className="space-y-6 dark:text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="h-6 w-6" />
            {t('adminPanel.admin.regions.title', 'Regions')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t(
              'adminPanel.admin.regions.description',
              'Manage multi-country regional packages',
            )}{' '}
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-regions"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending
            ? t('adminPanel.admin.regions.syncing', 'Syncing...')
            : t('adminPanel.admin.regions.syncRegions', 'Sync Regions')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              {t('adminPanel.admin.regions.totalRegions', 'Total Regions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{regions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              {t('adminPanel.admin.regions.activeRegions', 'Active Regions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{regions.filter((r) => r.active).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              {t('adminPanel.admin.regions.totalPackages', 'Total Packages')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPackages.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle>{t('adminPanel.admin.regions.allRegions', 'All Regions')}</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={t('adminPanel.admin.regions.searchPlaceholder', 'Search regions...')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 w-full sm:w-[250px]"
                data-testid="input-search-regions"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Globe className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : regions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Globe className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>{t('adminPanel.admin.regions.noRegions', 'No regions found.')}</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('adminPanel.admin.regions.table.icon', 'Icon')}</TableHead>
                    <TableHead>{t('adminPanel.admin.regions.table.banner', 'Banner')}</TableHead>
                    <TableHead>{t('adminPanel.admin.regions.table.name', 'Name')}</TableHead>
                    <TableHead>{t('adminPanel.admin.regions.table.slug', 'Slug')}</TableHead>
                    <TableHead>
                      {t('adminPanel.admin.regions.table.countries', 'Countries')}
                    </TableHead>
                    <TableHead>
                      {t('adminPanel.admin.regions.table.packages', 'Packages')}
                    </TableHead>
                    <TableHead>{t('adminPanel.admin.regions.table.top', 'Top')}</TableHead>
                    <TableHead>{t('adminPanel.admin.regions.table.status', 'Status')}</TableHead>
                    <TableHead>{t('adminPanel.admin.regions.table.actions', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regions.map((region) => (
                    <TableRow key={region.id}>
                      <TableCell>
                        {region.image ? (
                          <img src={region.image}
                            alt={region.name}
                            className="w-10 h-10 rounded object-cover" loading="lazy" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Globe className="h-5 w-5 text-slate-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {region.bannerImage ? (
                          <img src={region.bannerImage}
                            alt={`${region.name} banner`}
                            className="w-16 h-10 rounded object-cover border" loading="lazy" />
                        ) : (
                          <div className="w-16 h-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center border text-[10px] text-slate-400">
                            No Banner
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{region.name}</span>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          {region.slug}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{region.countries?.length || 0} countries</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-medium">{region.packageCounts.total} total</span>
                          <span className="text-slate-500">
                            A:{region.packageCounts.airalo} E:{region.packageCounts.esimAccess} G:
                            {region.packageCounts.esimGo}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={region.isTop}
                          onCheckedChange={() => handleToggleTop(region)}
                          data-testid={`switch-top-${region.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={region.active}
                          onCheckedChange={() => handleToggleActive(region)}
                          data-testid={`switch-active-${region.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEditClick(region)}
                          data-testid={`button-edit-${region.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingRegion} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('adminPanel.admin.regions.dialog.title', 'Edit Region Image')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Region Icon */}
            <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
              <Label className="text-sm font-semibold self-start">
                {t('adminPanel.admin.regions.iconLabel', 'Region Icon')}
              </Label>
              {previewUrl ? (
                <img src={previewUrl}
                  alt="Icon Preview"
                  className="w-20 h-20 rounded object-cover border" loading="lazy" />
              ) : (
                <div className="w-20 h-20 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center border">
                  <Image className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <div className="w-full">
                <Input
                  ref={fileInputRef}
                  id="image-file"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e, 'image')}
                  className="w-full"
                  data-testid="input-region-image-file"
                />
              </div>
            </div>

            {/* Region Banner */}
            <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
              <Label className="text-sm font-semibold self-start">
                {t('adminPanel.admin.regions.bannerLabel', 'Region Banner')}
              </Label>
              {bannerPreviewUrl ? (
                <img src={bannerPreviewUrl}
                  alt="Banner Preview"
                  className="w-full aspect-[21/9] rounded object-cover border" loading="lazy" />
              ) : (
                <div className="w-full aspect-[21/9] rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center border">
                  <Image className="h-10 w-10 text-slate-400" />
                </div>
              )}
              <div className="w-full">
                <Input
                  ref={bannerInputRef}
                  id="banner-file"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e, 'banner')}
                  className="w-full"
                  data-testid="input-region-banner-file"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-500 text-center">
              {t(
                'adminPanel.admin.regions.imageFormats',
                'Accepted formats: JPG, PNG, GIF, WebP, SVG (max 5MB)',
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              {t('adminPanel.common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleUploadFiles}
              disabled={uploadMutation.isPending || (!selectedFile && !selectedBannerFile)}
              data-testid="button-upload-region-assets"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadMutation.isPending
                ? t('adminPanel.admin.regions.uploading', 'Uploading...')
                : t('adminPanel.admin.regions.saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
