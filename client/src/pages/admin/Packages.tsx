import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import {
  Package as PackageIcon,
  Search,
  Filter,
  Star,
  DollarSign,
  MapPin,
  Clock,
  Database,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Server,
  Smartphone,
  MessageSquare,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTranslation } from '@/contexts/TranslationContext';

interface UnifiedPackage {
  id: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  providerPackageId: string;
  destinationId: string | null;
  destinationName: string | null;
  destinationFlag: string | null;
  destinationCountryCode: string | null;
  regionId: string | null;
  regionName: string | null;
  slug: string;
  title: string;
  dataAmount: string;
  validity: number;
  providerPrice: string;
  price: string;
  currency: string;
  type: string;
  operator: string | null;
  operatorImage: string | null;
  coverage: string[];
  voiceCredits: number | null;
  smsCredits: number | null;
  isBestPrice: boolean;
  isPopular: boolean;
  isTrending: boolean;
  isRecommended: boolean;
  isBestValue: boolean;
  isUnlimited: boolean;
  isEnabled: boolean;
  manualOverride: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Provider {
  id: string;
  name: string;
  slug: string;
}

interface PaginatedResponse {
  data: UnifiedPackage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    total: number;
    enabled: number;
    bestPrice: number;
    manualOverride: number;
  };
}

export default function Packages() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [bestPriceFilter, setBestPriceFilter] = useState<boolean | null>(null);
  const [sortFilter, setSortFilter] = useState<string>('default');

  // New filters from public API
  const [filterUnlimited, setFilterUnlimited] = useState(false);
  const [filterPopular, setFilterPopular] = useState(false);
  const [filterDataPack, setFilterDataPack] = useState(false);
  const [filterVoicePack, setFilterVoicePack] = useState(false);
  const [filterSmsPack, setFilterSmsPack] = useState(false);
  const [filterVoiceAndDataPack, setFilterVoiceAndDataPack] = useState(false);
  const [filterVoiceAndSmsPack, setFilterVoiceAndSmsPack] = useState(false);
  const [filterDataAndSmsPack, setFilterDataAndSmsPack] = useState(false);
  const [filterVoiceAndDataAndSmsPack, setFilterVoiceAndDataAndSmsPack] = useState(false);
  const { t } = useTranslation();

  // Debounce search input - wait 300ms after typing stops
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Get page from URL or default to 1, and listen for URL changes
  const [currentPage, setCurrentPage] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return parseInt(searchParams.get('page') || '1', 10);
  });

  // Listen for URL changes (back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const searchParams = new URLSearchParams(window.location.search);
      setCurrentPage(parseInt(searchParams.get('page') || '1', 10));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Helper to update page in both state and URL
  const goToPage = (page: number, options?: { replace?: boolean }) => {
    setCurrentPage(page);
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('page', page.toString());
    const newUrl = `${window.location.pathname}?${searchParams.toString()}`;

    if (options?.replace) {
      window.history.replaceState({}, '', newUrl);
    } else {
      window.history.pushState({}, '', newUrl);
    }
  };

  const { data: response, isLoading, isFetching } = useQuery<PaginatedResponse>({
    queryKey: [
      '/api/admin/unified-packages',
      currentPage,
      providerFilter,
      typeFilter,
      bestPriceFilter,
      sortFilter,
      filterUnlimited,
      filterPopular,
      filterDataPack,
      filterVoicePack,
      filterSmsPack,
      filterVoiceAndDataPack,
      filterVoiceAndSmsPack,
      filterDataAndSmsPack,
      filterVoiceAndDataAndSmsPack,
      debouncedSearch,
    ],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
      });

      if (providerFilter !== 'all') params.append('provider', providerFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (bestPriceFilter !== null) params.append('isBestPrice', bestPriceFilter.toString());
      if (sortFilter !== 'default') params.append('sort', sortFilter);
      if (filterUnlimited) params.append('isUnlimited', 'true');
      if (filterPopular) params.append('isPopular', 'true');
      if (filterDataPack) params.append('dataPack', 'true');
      if (filterVoicePack) params.append('voicePack', 'true');
      if (filterSmsPack) params.append('smsPack', 'true');
      if (filterVoiceAndDataPack) params.append('voiceAndDataPack', 'true');
      if (filterVoiceAndSmsPack) params.append('voiceAndSmsPack', 'true');
      if (filterDataAndSmsPack) params.append('dataAndSmsPack', 'true');
      if (filterVoiceAndDataAndSmsPack) params.append('voiceAndDataAndSmsPack', 'true');
      if (debouncedSearch) params.append('search', debouncedSearch);

      const res = await fetch(`/api/admin/unified-packages?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch packages');
      return res.json();
    },
  });

  const packages = response?.data;

  const { data: providers } = useQuery<Provider[]>({
    queryKey: ['/api/admin/providers'],
  });

  const updatePackageMutation = useMutation({
    mutationFn: async ({
      packageId,
      data,
    }: {
      packageId: string;
      data: Partial<UnifiedPackage>;
    }) => {
      return await apiRequest('PATCH', `/api/admin/unified-packages/${packageId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/unified-packages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      toast({
        title: 'Package Updated',
        description: 'Package settings have been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update package settings.',
        variant: 'destructive',
      });
    },
  });

  const handleToggleEnabled = (pkg: UnifiedPackage) => {
    updatePackageMutation.mutate({
      packageId: pkg.id,
      data: { isEnabled: !pkg.isEnabled, manualOverride: true },
    });
  };

  const handleTogglePopular = (pkg: UnifiedPackage) => {
    updatePackageMutation.mutate({
      packageId: pkg.id,
      data: { isPopular: !pkg.isPopular },
    });
  };

  const handleToggleRecommended = (pkg: UnifiedPackage) => {
    updatePackageMutation.mutate({
      packageId: pkg.id,
      data: { isRecommended: !pkg.isRecommended },
    });
  };

  const handleToggleBestValue = (pkg: UnifiedPackage) => {
    updatePackageMutation.mutate({
      packageId: pkg.id,
      data: { isBestValue: !pkg.isBestValue },
    });
  };

  const resetAllFilters = () => {
    setProviderFilter('all');
    setTypeFilter('all');
    setBestPriceFilter(null);
    setSortFilter('default');
    setFilterUnlimited(false);
    setFilterPopular(false);
    setFilterDataPack(false);
    setFilterVoicePack(false);
    setFilterSmsPack(false);
    setFilterVoiceAndDataPack(false);
    setFilterVoiceAndSmsPack(false);
    setFilterDataAndSmsPack(false);
    setFilterVoiceAndDataAndSmsPack(false);
    setSearch('');
    if (currentPage !== 1) goToPage(1, { replace: true });
  };

  const activeFiltersCount = [
    providerFilter !== 'all',
    typeFilter !== 'all',
    bestPriceFilter !== null,
    sortFilter !== 'default',
    filterUnlimited,
    filterPopular,
    filterDataPack,
    filterVoicePack,
    filterSmsPack,
    filterVoiceAndDataPack,
    filterVoiceAndSmsPack,
    filterDataAndSmsPack,
    filterVoiceAndDataAndSmsPack,
    search.length > 0,
  ].filter(Boolean).length;

  const stats = response?.stats || {
    total: 0,
    enabled: 0,
    bestPrice: 0,
    manualOverride: 0,
  };



  return (
    <div className="space-y-6 p-6 dark:text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("adminPanel.admin.packages.title", "Package Management")}</h1>
          <p className="text-muted-foreground">
            {t("adminPanel.admin.packages.description", "Manage unified packages from all providers with pricing and visibility controls")}

          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.packages.stats.total", "Total Packages")}</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-packages">
              {stats.total}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.packages.stats.enabled", "Enabled")}</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-enabled-packages">
              {stats.enabled}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.packages.stats.bestPrice", "Best Price")}</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-best-price-packages">
              {stats.bestPrice}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.packages.stats.manualOverride", "Manual Override")}</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-manual-override-packages">
              {stats.manualOverride}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>{t("adminPanel.admin.packages.table.title", "Unified Packages")}</CardTitle>
              <CardDescription>
                {t("adminPanel.admin.packages.table.description", "Filter and manage package visibility across providers")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 md:w-64">
                {isFetching ? (
                  <RefreshCw className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
                ) : (
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  placeholder={t("adminPanel.admin.packages.searchPlaceholder", "Search packages...")}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (currentPage !== 1) goToPage(1, { replace: true });
                  }}
                  className="pl-8"
                  data-testid="input-search-packages"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            <Select
              value={providerFilter}
              onValueChange={(value) => {
                setProviderFilter(value);
                if (currentPage !== 1) goToPage(1, { replace: true });
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-provider-filter">
                <SelectValue placeholder={t("adminPanel.admin.packages.filters.allProviders", "All Providers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminPanel.admin.packages.filters.allProviders", "All Providers")}</SelectItem>
                {providers?.map((provider) => (
                  <SelectItem key={provider.id} value={provider.slug}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value);
                if (currentPage !== 1) goToPage(1, { replace: true });
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-type-filter">
                <SelectValue placeholder={t("adminPanel.admin.packages.filters.allTypes", "All Types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminPanel.admin.packages.filters.allTypes", "All Types")}</SelectItem>
                <SelectItem value="local">{t("adminPanel.admin.packages.filters.local", "Local")}</SelectItem>
                <SelectItem value="regional">{t("adminPanel.admin.packages.filters.regional", "Regional")}</SelectItem>
                <SelectItem value="global">{t("adminPanel.admin.packages.filters.global", "Global")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={bestPriceFilter === null ? 'all' : bestPriceFilter ? 'yes' : 'no'}
              onValueChange={(value) => {
                setBestPriceFilter(value === 'all' ? null : value === 'yes');
                if (currentPage !== 1) goToPage(1, { replace: true });
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-best-price-filter">
                <SelectValue placeholder={t("adminPanel.admin.packages.filters.allPrices", "All Prices")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminPanel.admin.packages.filters.allPrices", "All Prices")}</SelectItem>
                <SelectItem value="yes">{t("adminPanel.admin.packages.filters.bestPriceOnly", "Best Price Only")}</SelectItem>
                <SelectItem value="no">{t("adminPanel.admin.packages.filters.notBestPrice", "Not Best Price")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortFilter}
              onValueChange={(value) => {
                setSortFilter(value);
                if (currentPage !== 1) goToPage(1, { replace: true });
              }}
            >
              <SelectTrigger className="w-48" data-testid="select-sort-filter">
                <SelectValue placeholder={t("adminPanel.admin.packages.filters.defaultSort", "Default Sort")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t("adminPanel.admin.packages.filters.defaultSort", "Default Sort")}</SelectItem>
                <SelectItem value="priceLowToHigh">{t("adminPanel.admin.packages.filters.priceLowToHigh", "Price: Low to High")}</SelectItem>
                <SelectItem value="priceHighToLow">{t("adminPanel.admin.packages.filters.priceHighToLow", "Price: High to Low")}</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-advanced-filters">
                  <Filter className="h-4 w-4" />
                  {t("adminPanel.admin.packages.filters.advanced", "Advanced Filters")}
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{t("adminPanel.admin.packages.filters.advanced", "Advanced Filters")}</h4>
                    {activeFiltersCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetAllFilters}
                        className="h-8 text-xs"
                      >
                        {t("adminPanel.admin.packages.filters.resetAll", "Reset All")}
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="filter-unlimited"
                        checked={filterUnlimited}
                        onCheckedChange={(checked) => {
                          setFilterUnlimited(checked as boolean);
                          if (currentPage !== 1) goToPage(1, { replace: true });
                        }}
                      />
                      <Label
                        htmlFor="filter-unlimited"
                        className="text-sm font-normal cursor-pointer"
                      >
                        {t("adminPanel.admin.packages.filters.unlimitedData", "Unlimited Data")}
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="filter-popular"
                        checked={filterPopular}
                        onCheckedChange={(checked) => {
                          setFilterPopular(checked as boolean);
                          if (currentPage !== 1) goToPage(1, { replace: true });
                        }}
                      />
                      <Label
                        htmlFor="filter-popular"
                        className="text-sm font-normal cursor-pointer"
                      >
                        {t("adminPanel.admin.packages.filters.popularPackages", "Popular Packages")}
                      </Label>
                    </div>

                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        {t("adminPanel.admin.packages.filters.packageType", "Package Type")}
                      </p>

                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="filter-data-pack"
                            checked={filterDataPack}
                            onCheckedChange={(checked) => {
                              setFilterDataPack(checked as boolean);
                              if (currentPage !== 1) goToPage(1, { replace: true });
                            }}
                          />
                          <Label
                            htmlFor="filter-data-pack"
                            className="text-sm font-normal cursor-pointer flex items-center gap-1.5"
                          >
                            <Smartphone className="h-3.5 w-3.5" />

                            {t("adminPanel.admin.packages.filters.dataOnly", "Data Only")}

                          </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="filter-voice-pack"
                            checked={filterVoicePack}
                            onCheckedChange={(checked) => {
                              setFilterVoicePack(checked as boolean);
                              if (currentPage !== 1) goToPage(1, { replace: true });
                            }}
                          />
                          <Label
                            htmlFor="filter-voice-pack"
                            className="text-sm font-normal cursor-pointer flex items-center gap-1.5"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {t("adminPanel.admin.packages.filters.voiceOnly", "Voice Only")}

                          </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="filter-sms-pack"
                            checked={filterSmsPack}
                            onCheckedChange={(checked) => {
                              setFilterSmsPack(checked as boolean);
                              if (currentPage !== 1) goToPage(1, { replace: true });
                            }}
                          />
                          <Label
                            htmlFor="filter-sms-pack"
                            className="text-sm font-normal cursor-pointer flex items-center gap-1.5"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {t("adminPanel.admin.packages.filters.smsOnly", "SMS Only")}

                          </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="filter-voice-data"
                            checked={filterVoiceAndDataPack}
                            onCheckedChange={(checked) => {
                              setFilterVoiceAndDataPack(checked as boolean);
                              if (currentPage !== 1) goToPage(1, { replace: true });
                            }}
                          />
                          <Label
                            htmlFor="filter-voice-data"
                            className="text-sm font-normal cursor-pointer"
                          >
                            {t("adminPanel.admin.packages.filters.voiceData", "Voice + Data")}

                          </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="filter-voice-sms"
                            checked={filterVoiceAndSmsPack}
                            onCheckedChange={(checked) => {
                              setFilterVoiceAndSmsPack(checked as boolean);
                              if (currentPage !== 1) goToPage(1, { replace: true });
                            }}
                          />
                          <Label
                            htmlFor="filter-voice-sms"
                            className="text-sm font-normal cursor-pointer"
                          >
                            {t("adminPanel.admin.packages.filters.voiceSms", "Voice + SMS")}

                          </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="filter-data-sms"
                            checked={filterDataAndSmsPack}
                            onCheckedChange={(checked) => {
                              setFilterDataAndSmsPack(checked as boolean);
                              if (currentPage !== 1) goToPage(1, { replace: true });
                            }}
                          />
                          <Label
                            htmlFor="filter-data-sms"
                            className="text-sm font-normal cursor-pointer"
                          >
                            {t("adminPanel.admin.packages.filters.dataSms", "Data + SMS")}

                          </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="filter-all-three"
                            checked={filterVoiceAndDataAndSmsPack}
                            onCheckedChange={(checked) => {
                              setFilterVoiceAndDataAndSmsPack(checked as boolean);
                              if (currentPage !== 1) goToPage(1, { replace: true });
                            }}
                          />
                          <Label
                            htmlFor="filter-all-three"
                            className="text-sm font-normal cursor-pointer"
                          >
                            {t("adminPanel.admin.packages.filters.allThree", "Voice + Data + SMS")}
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !packages ? (
            <div className="flex items-center justify-center min-h-96">
              <div className="text-center">
                <PackageIcon className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Loading packages...</p>
              </div>
            </div>
          ) : !packages || packages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PackageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No packages found matching your filters</p>
            </div>
          ) : (
            <Table data-testid="table-packages" className={isFetching ? "opacity-50 transition-opacity" : "transition-opacity"}>
              <TableHeader>
                <TableRow>

                  <TableHead className="w-12">{t("admin.packages.table.index", "#")}</TableHead>
                  <TableHead>{t("adminPanel.admin.packages.table.package", "Package")}</TableHead>
                  <TableHead>{t("adminPanel.admin.packages.table.provider", "Provider")}</TableHead>
                  <TableHead>{t("adminPanel.admin.packages.table.location", "Location")}</TableHead>
                  <TableHead>{t("adminPanel.admin.packages.table.type", "Type")}</TableHead>
                  <TableHead>{t("adminPanel.admin.packages.table.packageDetails", "Package Details")}</TableHead>
                  <TableHead>{t("adminPanel.admin.packages.table.pricing", "Pricing")}</TableHead>
                  <TableHead>{t("adminPanel.admin.packages.table.status", "Status")}</TableHead>
                  <TableHead className="text-center">{t("adminPanel.admin.packages.table.popular", "Popular")}</TableHead>
                  <TableHead className="text-center">{t("adminPanel.admin.packages.table.recommend", "Recommend")}</TableHead>
                  <TableHead className="text-center">{t("adminPanel.admin.packages.table.bestValue", "Best Value")}</TableHead>
                  <TableHead className="text-center">{t("adminPanel.admin.packages.table.enabled", "Enabled")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg, index) => {
                  const rowNumber = (currentPage - 1) * 50 + index + 1;
                  return (
                    <TableRow key={pkg.id} data-testid={`row-package-${pkg.id}`}>
                      <TableCell
                        className="font-medium text-muted-foreground"
                        data-testid={`text-row-number-${pkg.id}`}
                      >
                        {rowNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{pkg.title}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {pkg.isPopular && (
                            <Badge
                              variant="default"
                              className="text-xs bg-orange-500"
                              data-testid={`badge-popular-${pkg.id}`}
                            >
                              {t("adminPanel.admin.packages.badges.popular", "Popular")}

                            </Badge>
                          )}
                          {pkg.isRecommended && (
                            <Badge
                              variant="default"
                              className="text-xs bg-teal-500"
                              data-testid={`badge-recommended-${pkg.id}`}
                            >
                              {t("adminPanel.admin.packages.badges.recommended", "Recommend")}

                            </Badge>
                          )}
                          {pkg.isBestValue && (
                            <Badge
                              variant="default"
                              className="text-xs bg-green-500"
                              data-testid={`badge-best-value-${pkg.id}`}
                            >
                              {t("adminPanel.admin.packages.badges.bestValue", "Best Value")}

                            </Badge>
                          )}
                          {pkg.isUnlimited && (
                            <Badge
                              variant="default"
                              className="text-xs bg-purple-500"
                              data-testid={`badge-unlimited-${pkg.id}`}
                            >
                              {t("adminPanel.admin.packages.badges.unlimited", "Unlimited")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{pkg.slug}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-provider-${pkg.id}`}>
                          {pkg.providerName}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-1.5 text-sm"
                          data-testid={`text-location-${pkg.id}`}
                        >
                          {pkg.destinationFlag && (
                            <span className="text-lg" data-testid={`flag-${pkg.id}`}>
                              {pkg.destinationFlag}
                            </span>
                          )}
                          {!pkg.destinationFlag && <MapPin className="h-3.5 w-3.5" />}
                          <span>{pkg.destinationName || pkg.regionName || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            pkg.type === 'local'
                              ? 'default'
                              : pkg.type === 'regional'
                                ? 'secondary'
                                : 'outline'
                          }
                          className={`capitalize ${pkg.type === 'local'
                            ? 'bg-teal-500 hover:bg-teal-600'
                            : pkg.type === 'regional'
                              ? 'bg-teal-500 hover:bg-teal-600'
                              : 'bg-orange-500 hover:bg-orange-600 text-white'
                            }`}
                          data-testid={`badge-type-${pkg.id}`}
                        >
                          {pkg.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Database className="h-3.5 w-3.5 text-teal-500" />
                            <span className="font-medium">{pkg.dataAmount}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{pkg.validity} days</span>
                          </div>
                          {pkg.voiceCredits && pkg.voiceCredits > 0 && (
                            <div
                              className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              data-testid={`text-voice-credits-${pkg.id}`}
                            >
                              <Phone className="h-3 w-3" />
                              <span>{pkg.voiceCredits} mins</span>
                            </div>
                          )}
                          {pkg.smsCredits && pkg.smsCredits > 0 && (
                            <div
                              className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              data-testid={`text-sms-credits-${pkg.id}`}
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span>{pkg.smsCredits} SMS</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Provider:</span>
                            <span
                              className="text-sm font-medium"
                              data-testid={`text-provider-price-${pkg.id}`}
                            >
                              ${parseFloat(pkg.providerPrice).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Selling:</span>
                            <span
                              className="text-sm font-semibold text-teal-600 dark:text-teal-400"
                              data-testid={`text-selling-price-${pkg.id}`}
                            >
                              ${parseFloat(pkg.price).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1 border-t">
                            <span className="text-xs text-muted-foreground">Margin:</span>
                            <span
                              className="text-xs font-medium text-green-600 dark:text-green-400"
                              data-testid={`text-margin-${pkg.id}`}
                            >
                              {(() => {
                                const providerPrice = parseFloat(pkg.providerPrice);
                                const sellingPrice = parseFloat(pkg.price);
                                const marginAmount = sellingPrice - providerPrice;
                                const marginPercent =
                                  providerPrice > 0 ? (marginAmount / providerPrice) * 100 : 0;
                                return `$${marginAmount.toFixed(2)} (${marginPercent.toFixed(1)}%)`;
                              })()}
                            </span>
                          </div>
                          {pkg.isBestPrice && (
                            <Badge
                              variant="default"
                              className="w-fit mt-1 text-xs"
                              data-testid={`badge-best-price-${pkg.id}`}
                            >
                              <Star className="h-3 w-3 mr-1" />
                              Best Price
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={pkg.isEnabled ? 'default' : 'secondary'}
                            data-testid={`badge-status-${pkg.id}`}
                          >
                            {pkg.isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          {pkg.manualOverride && (
                            <Badge
                              variant="outline"
                              className="w-fit text-xs"
                              data-testid={`badge-manual-override-${pkg.id}`}
                            >
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Manual
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={pkg.isPopular}
                          onCheckedChange={() => handleTogglePopular(pkg)}
                          disabled={updatePackageMutation.isPending}
                          className="data-[state=checked]:bg-orange-500"
                          data-testid={`switch-popular-${pkg.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={pkg.isRecommended}
                          onCheckedChange={() => handleToggleRecommended(pkg)}
                          disabled={updatePackageMutation.isPending}
                          className="data-[state=checked]:bg-teal-500"
                          data-testid={`switch-recommended-${pkg.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={pkg.isBestValue}
                          onCheckedChange={() => handleToggleBestValue(pkg)}
                          disabled={updatePackageMutation.isPending}
                          className="data-[state=checked]:bg-green-500"
                          data-testid={`switch-best-value-${pkg.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={pkg.isEnabled}
                          onCheckedChange={() => handleToggleEnabled(pkg)}
                          disabled={updatePackageMutation.isPending}
                          className="data-[state=checked]:bg-teal-500"
                          data-testid={`switch-enabled-${pkg.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {/* Pagination Controls */}
        {response && response.pagination && (
          <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-t gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {(response.pagination.page - 1) * response.pagination.limit + 1} to{' '}
              {Math.min(
                response.pagination.page * response.pagination.limit,
                response.pagination.total,
              )}{' '}
              of {response.pagination.total} packages
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                data-testid="button-pagination-prev"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              {/* Page Number Buttons */}
              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = response.pagination.totalPages;
                  const pageButtons: JSX.Element[] = [];
                  const maxVisiblePages = 7;

                  if (totalPages <= maxVisiblePages) {
                    for (let i = 1; i <= totalPages; i++) {
                      pageButtons.push(
                        <Button
                          key={i}
                          variant={currentPage === i ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => goToPage(i)}
                          className="min-w-[2.5rem]"
                          data-testid={`button-page-${i}`}
                        >
                          {i}
                        </Button>,
                      );
                    }
                  } else {
                    pageButtons.push(
                      <Button
                        key={1}
                        variant={currentPage === 1 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => goToPage(1)}
                        className="min-w-[2.5rem]"
                        data-testid="button-page-1"
                      >
                        1
                      </Button>,
                    );

                    if (currentPage > 3) {
                      pageButtons.push(
                        <span key="ellipsis-1" className="px-2 text-muted-foreground">
                          ...
                        </span>,
                      );
                    }

                    const startPage = Math.max(2, currentPage - 1);
                    const endPage = Math.min(totalPages - 1, currentPage + 1);

                    for (let i = startPage; i <= endPage; i++) {
                      pageButtons.push(
                        <Button
                          key={i}
                          variant={currentPage === i ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => goToPage(i)}
                          className="min-w-[2.5rem]"
                          data-testid={`button-page-${i}`}
                        >
                          {i}
                        </Button>,
                      );
                    }

                    if (currentPage < totalPages - 2) {
                      pageButtons.push(
                        <span key="ellipsis-2" className="px-2 text-muted-foreground">
                          ...
                        </span>,
                      );
                    }

                    pageButtons.push(
                      <Button
                        key={totalPages}
                        variant={currentPage === totalPages ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => goToPage(totalPages)}
                        className="min-w-[2.5rem]"
                        data-testid={`button-page-${totalPages}`}
                      >
                        {totalPages}
                      </Button>,
                    );
                  }

                  return pageButtons;
                })()}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === response.pagination.totalPages}
                data-testid="button-pagination-next"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
