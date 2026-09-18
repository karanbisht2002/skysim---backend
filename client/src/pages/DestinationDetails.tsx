import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import { Helmet } from 'react-helmet-async';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Shield,
  Zap,
  Smartphone,
  QrCode,
  Wifi,
  Headphones,
  CreditCard,
  Clock,
  Home,
  Star,
  MessageCircle,
  Plane,
  ScanLine,
  Signal,
  Phone,
  Filter,
  X,
  TrendingUp,
  Award,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useTranslation } from '@/contexts/TranslationContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { SiteHeader } from '@/components/layout/SiteHeader';
import ReactCountryFlag from 'react-country-flag';
import type { Destination } from '@shared/schema';
import { useUser } from '@/hooks/use-user';
import { useSettingByKey } from '@/hooks/useSettings';
import { useToast } from '@/hooks/use-toast';

type UnifiedPackage = {
  id: string;
  slug: string;
  title: string;
  dataAmount: string;
  dataMb: number | null;
  validity: number;
  validityDays: number;
  price: string;
  currency: string;
  isUnlimited: boolean;
  isBestPrice: boolean;
  isPopular: boolean;
  isRecommended: boolean;
  isBestValue: boolean;
  isEnabled: boolean;
  providerId: string;
  providerName: string;
  providerSlug: string;
  destinationId: string | null;
  operator: string | null;
  operatorImage: string | null;
  packageGroupKey: string | null;
  countryCode: string | null;
  countryName: string | null;
  voiceMinutes: number | null;
  smsCount: number | null;
};

type DestinationPackagesResponse = {
  data: {
    destination: Destination;
    totalPackages: number;
    packages: UnifiedPackage[];
    pagination: Pagination;
  };
};

type Pagination = {
  page: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
};

// Helper function to format data amount properly
const formatDataAmount = (pkg: UnifiedPackage, t: any): string => {
  if (pkg.isUnlimited || pkg.dataMb === null || pkg.dataMb < 0) {
    return t('planCard.unlimited', 'Unlimited');
  }

  if (pkg.dataMb >= 1000) {
    const gb = pkg.dataMb / 1024;
    if (gb >= 1 && gb === Math.floor(gb)) {
      return `${Math.floor(gb)} GB`;
    }
    return `${gb.toFixed(1)} GB`;
  }

  return `${pkg.dataMb} MB`;
};

const countryImages: Record<string, string> = {
  us: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&h=600&fit=crop',
  jp: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop',
  gb: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&h=600&fit=crop',
  fr: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=600&fit=crop',
  de: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&h=600&fit=crop',
  it: 'https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?w=800&h=600&fit=crop',
  es: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&h=600&fit=crop',
  th: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&h=600&fit=crop',
  kr: 'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=800&h=600&fit=crop',
  au: 'https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=800&h=600&fit=crop',
  default: 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&h=600&fit=crop',
};

export default function DestinationDetails() {
  const { t } = useTranslation();
  const { currency, currencies } = useCurrency();
  const { slug } = useParams();
  const [selectedPackage, setSelectedPackage] = useState<UnifiedPackage | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'coverage'>('details');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { isAuthenticated, user } = useUser();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const siteName = useSettingByKey('platform_name') || 'eSIM Connect';

  // Filter states
  const [page, setPage] = useState(1);
  const limit = 10;
  const [sortBy, setSortBy] = useState<string>('');
  const [filterUnlimited, setFilterUnlimited] = useState(false);
  const [filterBestPrice, setFilterBestPrice] = useState(false);
  const [filterPopular, setFilterPopular] = useState(false);
  const [filterDataPack, setFilterDataPack] = useState(false);
  const [filterDataAndVoice, setFilterDataAndVoice] = useState(false);
  const [filterVoiceAndDataAndSmsPack, setFilterVoiceAndDataAndSmsPack] = useState(false);

  const [showFilters, setShowFilters] = useState(false); // Collapsed by default

  const getCurrencySymbol = (currencyCode: string) => {
    return currencies.find((c) => c.code === currencyCode)?.symbol || '$';
  };

  const isKycComplete = () => {
    return isAuthenticated && (user?.kycStatus === 'verified' || user?.kycStatus === 'approved');
  };

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('currency', currency);

    if (sortBy) params.append('sort', sortBy);
    if (filterUnlimited) params.append('isUnlimited', 'true');
    if (filterBestPrice) params.append('isBestPrice', 'true');
    if (filterPopular) params.append('isPopular', 'true');
    if (filterDataPack) params.append('dataPack', 'true');
    if (filterDataAndVoice) params.append('voiceAndDataPack', 'true');
    if (filterVoiceAndDataAndSmsPack) params.append('voiceAndDataAndSmsPack', 'true');

    return params.toString();
  };

  const { data: packagesResponse, isLoading: isLoadingPackages } =
    useQuery<DestinationPackagesResponse>({
      queryKey: [
        `/api/unified-packages/by-destination/${slug}`,
        {
          currency,
          page,
          limit,
          sortBy,
          filterUnlimited,
          filterBestPrice,
          filterPopular,
          filterDataPack,
          filterDataAndVoice,
          filterVoiceAndDataAndSmsPack
        },
      ],
      queryFn: () =>
        fetch(`/api/unified-packages/by-destination/${slug}?${buildQueryParams()}`).then((res) =>
          res.json(),
        ),
      enabled: !!slug,
    });

  const handleGetPlanClick = (e, selectedPackage) => {
    e.preventDefault();

    if (!selectedPackage) return;

    const hasVoiceOrSms =
      (selectedPackage.voiceMinutes ?? 0) > 0 || (selectedPackage.smsCount ?? 0) > 0;

    if (!hasVoiceOrSms) {
      navigate(`/unified-checkout/${selectedPackage.slug}`);
      return;
    }

    if (!isAuthenticated) {
      toast({
        title: t('planCard.loginTitle', 'Please login first!'),
        description: t('planCard.loginDesc', 'Login is required for Voice & SMS plans.'),
      });
      setTimeout(() => navigate('/login'), 2000);
      return;
    }

    if (!isKycComplete()) {
      toast({
        title: t('planCard.kycTitle', 'KYC verification required!'),
        description: t('planCard.kycDesc', 'Complete your KYC to use Voice & SMS services.'),
      });
      setTimeout(() => navigate('/account/kyc'), 2000);
      return;
    }

    navigate(`/unified-checkout/${selectedPackage.slug}`);
  };

  const clearAllFilters = () => {
    setSortBy('');
    setFilterUnlimited(false);
    setFilterBestPrice(false);
    setFilterPopular(false);
    setFilterDataPack(false);
    setFilterDataAndVoice(false);
    setFilterVoiceAndDataAndSmsPack(false);
    setPage(1);
  };

  const activeFiltersCount = [
    sortBy,
    filterUnlimited,
    filterBestPrice,
    filterPopular,
    filterDataPack,
    filterDataAndVoice,
    filterVoiceAndDataAndSmsPack
  ].filter(Boolean).length;

  const destination = packagesResponse?.data?.destination;
  const pagination = packagesResponse?.data?.pagination;
  const destinationPackages = packagesResponse?.data?.packages || [];

  const groupedPackages = destinationPackages.reduce(
    (acc, pkg) => {
      const key = pkg.dataAmount;
      const pkgBadges =
        (pkg.isPopular ? 1 : 0) + (pkg.isRecommended ? 1 : 0) + (pkg.isBestValue ? 1 : 0);

      if (!acc[key]) {
        acc[key] = pkg;
      } else {
        const existingBadges =
          (acc[key].isPopular ? 1 : 0) +
          (acc[key].isRecommended ? 1 : 0) +
          (acc[key].isBestValue ? 1 : 0);

        if (
          pkgBadges > existingBadges ||
          (pkgBadges === existingBadges && parseFloat(pkg.price) < parseFloat(acc[key].price))
        ) {
          acc[key] = pkg;
        }
      }
      return acc;
    },
    {} as Record<string, UnifiedPackage>,
  );

  const packageOptions = Object.values(groupedPackages).sort((a, b) => {
    const aBadges = (a.isPopular ? 1 : 0) + (a.isRecommended ? 1 : 0) + (a.isBestValue ? 1 : 0);
    const bBadges = (b.isPopular ? 1 : 0) + (b.isRecommended ? 1 : 0) + (b.isBestValue ? 1 : 0);
    if (aBadges !== bBadges) {
      return bBadges - aBadges;
    }
    return (a.dataMb || 0) - (b.dataMb || 0);
  });

  const heroImage = destination?.bannerImage
    ? destination.bannerImage
    : (destination?.countryCode
      ? countryImages[destination.countryCode.toLowerCase()] || countryImages.default
      : countryImages.default);

  const bestChoiceIndex = Math.min(2, packageOptions.length - 1);

  const faqs = [
    {
      question: t('destinationDetails.faq1.question', 'What is an eSIM and how does it work?'),
      answer: t('destinationDetails.faq1.answer', 'An eSIM is a built-in digital SIM that lets you activate a mobile data plan without a physical card. Just choose a plan, scan a QR code, and connect instantly when you travel.'),
    },
    {
      question: t('destinationDetails.faq2.question', 'How do I set up my eSIM on my phone?'),
      answer: t('destinationDetails.faq2.answer', "After purchase, you'll receive an email with a QR code. Open your phone's settings, scan the code, and follow the quick setup guide to start using data."),
    },
    {
      question: t('destinationDetails.faq3.question', 'Can I use my physical SIM and eSIM together?'),
      answer: t('destinationDetails.faq3.answer', 'Yes. You can keep your regular SIM for calls and SMS while using your eSIM for data during international travel.'),
    },
    {
      question: t('destinationDetails.faq4.question', 'Where does {siteName} work?', { siteName }),
      answer: t('destinationDetails.faq4.answer', 'Our data plans cover over 200 destinations across Europe, Asia, the Americas, and more - giving you high-speed internet without roaming fees.'),
    },
    {
      question: t('destinationDetails.faq5.question', 'Can I top up or reuse my plan?'),
      answer: t('destinationDetails.faq5.answer', 'Yes. Some plans let you add more data or extend your validity directly from your account dashboard, so you can stay connected without buying a new QR code.'),
    },
  ];

  const testimonials = [
    {
      name: 'Sarah Chen',
      handle: '@sarahchen_travels',
      review: t('destinationDetails.testimonial1', `I used ${siteName} during my trip to Japan and it worked perfectly from the moment I landed. Setup took less than two minutes and the data speed was amazing!`, { siteName }),
      rating: 5,
    },
    {
      name: 'Marcus Weber',
      handle: '@marcusweber',
      review: t('destinationDetails.testimonial2', 'Super easy to install and no roaming fees. I stayed connected through my entire Europe trip without switching SIM cards. Totally worth it!'),
      rating: 5,
    },
    {
      name: 'Priya Sharma',
      handle: '@priyasharma',
      review: t('destinationDetails.testimonial3', 'I bought my plan online before traveling to Thailand. The QR code arrived instantly, and the connection was fast everywhere I went - beaches, cities, even remote areas.'),
      rating: 4,
    },
  ];

  if (isLoadingPackages) {
    return (
      <div className="min-h-screen bg-background flex flex-col dark:text-white">
        <div className="flex-1 flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-teal-50 border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground dark:text-white">{t('destinationDetails.loading', 'Loading...')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!destination) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center pt-20">
          <p>{t('destinationDetails.regionNotFound', 'Destination not found')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>
          {t('destinationDetails.esimFor', 'eSIM for {name}', { name: destination.name })} - {siteName}
        </title>
        <meta
          name="description"
          content={t('destinationDetails.buyPrepaid', 'Get affordable eSIM data plans for {name}. Instant activation, no roaming fees. Choose from multiple data packages.', { name: destination.name })}
        />
      </Helmet>

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <Breadcrumb className="mb-6">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/" data-testid="breadcrumb-home">
                  <Home className="h-4 w-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/destinations" data-testid="breadcrumb-destinations">
                  {t('destinations.heroTitle', 'Destinations')}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage data-testid="breadcrumb-current">{destination.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Hero Section */}
          <div className="grid lg:grid-cols-[2fr_3fr] gap-8 mb-16">
            {/* Left Column */}
            <div className="space-y-0">
              <div className="aspect-[4/3] rounded-t-2xl lg:rounded-2xl overflow-hidden">
                <img src={heroImage}
                  alt={t('destinationDetails.esimFor', 'Best {name} eSIM for Travelers', { name: destination.name })}
                  className="w-full h-full object-cover" loading="lazy" />
              </div>

              <div className="bg-card rounded-b-2xl lg:rounded-2xl lg:mt-4 border border-border">
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${activeTab === 'details'
                      ? 'text-orange-500 border-b-2 border-orange-500 -mb-px bg-orange-50 dark:bg-orange-500/10'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                    data-testid="tab-esim-details"
                  >
                    {t('destinationDetails.tabDetails', 'eSIM Details')}
                  </button>
                  <button
                    onClick={() => setActiveTab('coverage')}
                    className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${activeTab === 'coverage'
                      ? 'text-orange-500 border-b-2 border-orange-500 -mb-px bg-orange-50 dark:bg-orange-500/10'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                    data-testid="tab-coverage"
                  >
                    {t('destinationDetails.tabCoverage', 'Coverage')}
                  </button>
                </div>

                <div className="p-5">
                  {activeTab === 'details' && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          {t('destinationDetails.selectedPlan', 'Selected Data Plan:')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {selectedPackage
                            ? `${destination.name} ${formatDataAmount(selectedPackage, t)} ${selectedPackage.validity} ${t('planCard.days', 'Days')}`
                            : t('destinationDetails.selectPlanRight', 'Select a plan from the right')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-1">{t('destinationDetails.compatibility', 'Compatibility:')}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('destinationDetails.compatibilityDesc', 'All eSIM-compatible devices are supported.')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          {t('destinationDetails.instantDelivery', 'Instant Delivery:')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('destinationDetails.instantDeliveryDesc', 'Get your eSIM plan ready instantly. Scan the QR code or follow the instructions on the confirmation page to install.')}
                        </p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'coverage' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-sm">
                        <Signal className="w-5 h-5 text-orange-500" />
                        <div>
                          <span className="font-medium text-foreground">{t('destinationDetails.speed', 'Speed:')}</span>
                          <span className="text-muted-foreground ml-2">
                            {t('destinationDetails.speedDesc', '4G LTE & 5G where available')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Globe className="w-5 h-5 text-orange-500" />
                        <div>
                          <span className="font-medium text-foreground">{t('destinationDetails.coverage', 'Coverage:')}</span>
                          <span className="text-muted-foreground ml-2">
                            {t('destinationDetails.coverageDesc', 'Strong in cities; may vary in remote areas')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Wifi className="w-5 h-5 text-orange-500" />
                        <div>
                          <span className="font-medium text-foreground">{t('destinationDetails.networks', 'Networks:')}</span>
                          <span className="text-muted-foreground ml-2">
                            {t('destinationDetails.networksDesc', 'Multiple network operators in {name}', { name: destination.name })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded overflow-hidden border border-border flex-shrink-0 bg-white dark:bg-slate-800 flex items-center justify-center">
                    {destination.image ? (
                      <img src={destination.image}
                        alt={destination.name}
                        className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <ReactCountryFlag
                        countryCode={destination.countryCode}
                        svg
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                    {t('destinationDetails.esimFor', 'eSIM for {name}', { name: destination.name })}
                  </h1>
                </div>
                <p className="text-muted-foreground">
                  {t('destinationDetails.buyPrepaid', 'Buy prepaid eSIM for {name}. Enjoy reliable and fast connections when traveling to {name}.', { name: destination.name })}
                </p>
              </div>

              {/* Filters and Package Header Section */}
              <div className="space-y-4">
                {/* Top Bar: Filters Toggle + Choose Plan Heading */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">


                  {/* Choose Plan Section */}
                  <div className="flex-1 w-full sm:w-auto">
                    <h2 className="text-xl font-bold text-foreground">{t('destinationDetails.choosePlan', 'Choose your data plan')}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-muted-foreground">
                        {t('destinationDetails.plansAvailable', { count: packageOptions.length, defaultValue: `${packageOptions.length} plans available` })}
                      </p>
                      {activeFiltersCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearAllFilters}
                          className="text-xs h-6 px-2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3 mr-1" />
                          {t('destinationDetails.clearFilters', 'Clear filters')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Filter Toggle Button */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl hover:bg-accent/50 hover:border-teal-500/50 transition-all cursor-pointer group w-full sm:w-auto"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-500/20 dark:to-teal-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Filter className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{t('destinationDetails.filters', 'Filters & Sorting')}</h3>
                        {activeFiltersCount > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-teal-500 text-white rounded-full">
                            {activeFiltersCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {activeFiltersCount > 0
                          ? t('destinationDetails.activeFilters', { count: activeFiltersCount })
                          : t('destinationDetails.clickToFilter', 'Click to filter plans')
                        }
                      </p>
                    </div>
                    <div className={`transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`}>
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </button>


                </div>

                {/* Collapsible Filter Panel */}
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${showFilters ? 'max-h-96 opacity-100 mb-4' : 'max-h-0 opacity-0'
                    }`}
                >
                  <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-4 space-y-4 shadow-sm">
                    {/* Sort By */}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-500/20 dark:to-orange-500/10 flex items-center justify-center">
                          <TrendingUp className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                        </div>
                        {t('destinationDetails.sortBy', 'Sort By')}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant={sortBy === 'priceLowToHigh' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setSortBy(sortBy === 'priceLowToHigh' ? '' : 'priceLowToHigh');
                            setPage(1);
                          }}
                          className="w-full text-xs h-9 font-medium"
                        >
                          💰 {t('destinationDetails.lowToHigh', 'Low to High')}
                        </Button>
                        <Button
                          variant={sortBy === 'priceHighToLow' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setSortBy(sortBy === 'priceHighToLow' ? '' : 'priceHighToLow');
                            setPage(1);
                          }}
                          className="w-full text-xs h-9 font-medium"
                        >
                          💎 {t('destinationDetails.highToLow', 'High to Low')}
                        </Button>
                      </div>
                    </div>

                    {/* Filter Options */}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-500/20 dark:to-teal-500/10 flex items-center justify-center">
                          <Filter className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        </div>
                        {t('destinationDetails.filterBy', 'Filter By')}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant={filterUnlimited ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setFilterUnlimited(!filterUnlimited);
                            setPage(1);
                          }}
                          className="w-full justify-start text-xs h-9 font-medium"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-2" />
                          {t('planCard.unlimited', 'Unlimited')}
                        </Button>
                        <Button
                          variant={filterBestPrice ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setFilterBestPrice(!filterBestPrice);
                            setPage(1);
                          }}
                          className="w-full justify-start text-xs h-9 font-medium"
                        >
                          <Award className="w-3.5 h-3.5 mr-2" />
                          {t('destinationDetails.bestPrice', 'Best Price')}
                        </Button>
                        <Button
                          variant={filterPopular ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setFilterPopular(!filterPopular);
                            setPage(1);
                          }}
                          className="w-full justify-start text-xs h-9 font-medium"
                        >
                          <Star className="w-3.5 h-3.5 mr-2" />
                          {t('destinationDetails.popular', 'Popular')}
                        </Button>
                        <Button
                          variant={filterDataPack ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setFilterDataPack(!filterDataPack);
                            setPage(1);
                          }}
                          className="w-full justify-start text-xs h-9 font-medium"
                        >
                          <Wifi className="w-3.5 h-3.5 mr-2" />
                          {t('destinationDetails.dataOnly', 'Data Only')}
                        </Button>
                        <Button
                          variant={filterDataAndVoice ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setFilterDataAndVoice(!filterDataAndVoice);
                            setPage(1);
                          }}
                          className="w-full justify-start text-xs h-9 font-medium"
                        >
                          <Wifi className="w-3.5 h-3.5 mr-2" />
                          {t('destinationDetails.dataVoice', 'Data + Voice')}
                        </Button>
                        <Button
                          variant={filterVoiceAndDataAndSmsPack ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setFilterVoiceAndDataAndSmsPack(!filterVoiceAndDataAndSmsPack);
                            setPage(1);
                          }}
                          className="w-full justify-start text-xs h-9 font-medium"
                        >
                          <Wifi className="w-3.5 h-3.5 mr-2" />
                          {t('destinationDetails.dataVoiceSms', 'Data + Voice + SMS')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Package Selection Grid */}
              <div>
                <div
                  className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${packageOptions.length > 9 ? 'max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-teal-500/20 scrollbar-track-transparent hover:scrollbar-thumb-teal-500/40' : ''}`}
                >
                  {packageOptions.map((pkg, index) => {
                    const isBestChoice = index === bestChoiceIndex;
                    const isSelected = selectedPackage?.id === pkg.id;
                    const hasBadges =
                      pkg.isPopular || pkg.isRecommended || pkg.isBestValue || isBestChoice;

                    return (
                      <button
                        key={pkg.id}
                        onClick={() => setSelectedPackage(pkg)}
                        className={`relative p-4 rounded-xl border-2 transition-all text-left overflow-visible group ${isSelected
                          ? 'border-teal-500 bg-gradient-to-br from-teal-50/50 to-teal-100/30 dark:from-teal-500/10 dark:to-teal-500/20 shadow-lg shadow-teal-500/20 scale-[1.02]'
                          : 'border-border bg-card hover:border-teal-500/30 hover:shadow-md hover:scale-[1.01]'
                          }`}
                        data-testid={`button-package-${pkg.dataAmount}`}
                      >
                        {/* Badge row */}
                        {hasBadges && (
                          <div className="absolute -top-2.5 left-2 right-2 flex flex-wrap gap-1 justify-center z-10">
                            {pkg.isPopular && (
                              <span
                                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-md"
                                data-testid={`badge-popular-${pkg.id}`}
                              >
                                🔥 {t('destinationDetails.popular', 'Popular')}
                              </span>
                            )}
                            {pkg.isRecommended && (
                              <span
                                className="bg-gradient-to-r from-teal-500 to-teal-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-md"
                                data-testid={`badge-recommended-${pkg.id}`}
                              >
                                ⭐ {t('destinationDetails.recommended', 'Recommended')}
                              </span>
                            )}
                            {pkg.isBestValue && (
                              <span
                                className="bg-gradient-to-r from-green-500 to-green-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-md"
                                data-testid={`badge-best-value-${pkg.id}`}
                              >
                                💎 {t('destinationDetails.bestValue', 'Best Value')}
                              </span>
                            )}
                            {isBestChoice &&
                              !pkg.isPopular &&
                              !pkg.isRecommended &&
                              !pkg.isBestValue && (
                                <span className="bg-gradient-to-r from-purple-500 to-purple-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-md">
                                  ✨ {t('destinationDetails.bestChoice', 'Best Choice')}
                                </span>
                              )}
                          </div>
                        )}

                        {/* Data Amount with icon */}
                        <div className="flex items-center gap-2 mb-2 mt-1">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected
                            ? 'bg-teal-500 text-white'
                            : 'bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-500/20 dark:to-teal-500/10 text-teal-600 dark:text-teal-400'
                            }`}>
                            <Wifi className="w-4 h-4" />
                          </div>
                          <p className="text-xl font-bold text-foreground">
                            {formatDataAmount(pkg, t)}
                          </p>
                        </div>

                        {/* Validity with clock icon */}
                        <div className="flex items-center gap-1.5 mb-3">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="text-sm font-medium text-muted-foreground">
                            {pkg.validity} {t('planCard.days', 'Days')}
                          </p>
                        </div>

                        {/* Voice & SMS info */}
                        {((pkg.voiceMinutes !== null && pkg.voiceMinutes > 0) ||
                          (pkg.smsCount !== null && pkg.smsCount > 0)) && (
                            <div className="flex flex-wrap gap-2 mb-3 p-2 bg-accent/50 rounded-lg">
                              {pkg.voiceMinutes !== null && pkg.voiceMinutes > 0 && (
                                <span
                                  className="flex items-center gap-1 text-xs font-medium text-foreground"
                                  data-testid={`voice-${pkg.id}`}
                                >
                                  <Phone className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                  {pkg.voiceMinutes === -1 ? t('planCard.unlimited', 'Unlimited') : `${pkg.voiceMinutes}m`}
                                </span>
                              )}
                              {pkg.smsCount !== null && pkg.smsCount > 0 && (
                                <span
                                  className="flex items-center gap-1 text-xs font-medium text-foreground"
                                  data-testid={`sms-${pkg.id}`}
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                  {pkg.smsCount === -1 ? t('planCard.unlimited', 'Unlimited') : `${pkg.smsCount} SMS`}
                                </span>
                              )}
                            </div>
                          )}

                        {/* Price and Radio */}
                        <div className="flex items-center justify-between pt-3 border-t border-border">
                          <div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl font-bold text-foreground">
                                {getCurrencySymbol(pkg.currency)}
                                {pkg.price}
                              </span>
                              <span className="text-xs text-muted-foreground font-medium">
                                {pkg.currency}
                              </span>
                            </div>
                          </div>

                          {/* Radio indicator with checkmark */}
                          <div
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
                              ? 'border-teal-500 bg-teal-500 scale-110'
                              : 'border-muted-foreground/30 group-hover:border-teal-500/50'
                              }`}
                          >
                            {isSelected && <CheckCircle className="h-4 w-4 text-white font-bold" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pagination.hasPrevPage}
                        onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                        className="gap-2"
                      >
                        <ChevronUp className="w-4 h-4 rotate-[-90deg]" />
                        {t('common.previous', 'Previous')}
                      </Button>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {t('common.pageOf', 'Page {page} of {totalPages}', { page: pagination.page, totalPages: pagination.totalPages })}
                        </span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pagination.hasNextPage}
                        onClick={() => setPage((prev) => prev + 1)}
                        className="gap-2"
                      >
                        {t('common.next', 'Next')}
                        <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Checkout Card */}
              <div className="lg:sticky lg:top-24">
                <Card className="shadow-lg border-0 bg-gradient-to-br from-teal-50 to-teal-50 dark:from-teal-500/10 dark:to-teal-500/10">
                  <CardContent className="p-4">
                    {selectedPackage ? (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">{t('destinationDetails.selectedPlan', 'Selected Plan')}</p>
                            <p className="font-semibold text-foreground">
                              {formatDataAmount(selectedPackage, t)} - {selectedPackage.validity} {t('planCard.days', 'Days')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-foreground">
                              {getCurrencySymbol(selectedPackage.currency)}
                              {selectedPackage.price}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {selectedPackage.currency}
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={(e) => handleGetPlanClick(e, selectedPackage)}
                          className="w-full bg-primary-gradient hover:bg-primary-gradient-hover text-white"
                          data-testid="button-checkout"
                        >
                          {t('destinationDetails.buyNow', 'Buy Now')}
                        </Button>
                        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Smartphone className="w-3 h-3" />
                            <span>{t('destinationDetails.checkCompatibility', 'Check compatibility')}</span>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <Shield className="w-4 h-4 text-green-500" />
                          <span>{t('destinationDetails.securePayment', 'Secure payment guaranteed')}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <Smartphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="font-medium text-foreground">{t('destinationDetails.selectPlanRight', 'Select a data plan above')}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('destinationDetails.chooseBest', 'Choose the best option for your trip')}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* How to Setup Section */}
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-4">
              {t('destinationDetails.howToSetup', 'How to setup your {name} eSIM', { name: destination.name })}
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              {t('experienceHassleFree', 'Get connected in just 3 simple steps')}
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <Card className="text-center border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-100 to-teal-100 dark:from-teal-500/20 dark:to-teal-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-teal-600 dark:text-teal-400" />
                  </div>
                  <Badge variant="outline" className="mb-3">
                    {t('destinationDetails.step1', 'Step 1')}
                  </Badge>
                  <h3 className="font-semibold text-foreground mb-2">
                    {t('destinationDetails.step1Title', 'Choose a data plan for your trip')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('destinationDetails.step1Desc', 'Find the best eSIM plan tailored to your destination.')}
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-500/20 dark:to-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <ScanLine className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                  </div>
                  <Badge variant="outline" className="mb-3">
                    {t('destinationDetails.step2', 'Step 2')}
                  </Badge>
                  <h3 className="font-semibold text-foreground mb-2">
                    {t('destinationDetails.step2Title', 'Scan the QR code to activate')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('destinationDetails.step2Desc', 'Instantly install and set up your eSIM in seconds.')}
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-500/20 dark:to-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Signal className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <Badge variant="outline" className="mb-3">
                    {t('destinationDetails.step3', 'Step 3')}
                  </Badge>
                  <h3 className="font-semibold text-foreground mb-2">
                    {t('destinationDetails.step3Title', 'Enjoy fast 4G/5G data abroad')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('destinationDetails.step3Desc', 'Stay connected anywhere with reliable high-speed internet.')}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="text-center mt-8">
              <Button
                className="bg-primary-gradient text-white px-8"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                {t('destinationDetails.getStarted', 'Get started now')}
              </Button>
            </div>
          </section>

          {/* Why Choose Us Section */}
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-4">
              {t('destinationDetails.whyChooseUs', 'Why choose {siteName} for your {name} trip', { siteName, name: destination.name })}
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              {t('destinationDetails.experienceHassleFree', 'Experience hassle-free connectivity with our premium eSIM service')}
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-0 shadow-lg text-center">
                <CardContent className="p-6">
                  <div className="w-14 h-14 bg-teal-100 dark:bg-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Wifi className="w-7 h-7 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{t('website.home.features.unlimited.title', 'Unlimited data plans')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('website.home.features.unlimited.description', 'Stay connected with fast data worldwide.')}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg text-center">
                <CardContent className="p-6">
                  <div className="w-14 h-14 bg-orange-100 dark:bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-7 h-7 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{t('website.home.features.noRoaming.title', 'No roaming charges')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('website.home.features.noRoaming.description', 'Travel freely without extra charges.')}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg text-center">
                <CardContent className="p-6">
                  <div className="w-14 h-14 bg-green-100 dark:bg-green-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Phone className="w-7 h-7 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{t('website.home.features.keepSim.title', 'Keep physical SIM')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('website.home.features.keepSim.description', 'Keep your local SIM for calls and texts.')}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg text-center">
                <CardContent className="p-6">
                  <div className="w-14 h-14 bg-teal-100 dark:bg-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-7 h-7 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{t('website.home.features.quickSetup.title', 'Quick eSIM setup')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('website.home.features.quickSetup.description', 'Activate online and connect in minutes.')}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* FAQ Section */}
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-4">
              {t('destinationDetails.faqsTitle', 'FAQs about eSIM {name}', { name: destination.name })}
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              {t('destinationDetails.faqsSubtitle', 'Everything you need to know about using eSIM in {name}', { name: destination.name })}
            </p>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-3">
                {faqs.map((faq, index) => (
                  <Card key={index} className="border shadow-sm overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(openFaq === index ? null : index)}
                      className="w-full p-4 flex items-center justify-between text-left"
                      data-testid={`faq-toggle-${index}`}
                    >
                      <span className="font-medium text-foreground pr-4">{faq.question}</span>
                      {openFaq === index ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                    {openFaq === index && (
                      <div className="px-4 pb-4">
                        <p className="text-sm text-muted-foreground">{faq.answer}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              <div>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-teal-50 to-teal-50 dark:from-teal-500/10 dark:to-teal-500/10">
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 bg-white dark:bg-card rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                      <Headphones className="w-8 h-8 text-teal-600 dark:text-teal-400" />
                    </div>
                    <Badge variant="outline" className="mb-3 bg-white dark:bg-card">
                      {t('website.support.badge', 'support')}
                    </Badge>
                    <h3 className="font-semibold text-foreground mb-2">{t('destinationDetails.needMoreHelp', 'Need more help?')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('destinationDetails.supportDesc', "Can't find what you're looking for? Our support team is available 24/7 by email or chat.")}
                    </p>
                    <Link href="/account/support">
                      <Button variant="outline" className="w-full">
                        {t('destinationDetails.visitHelpCenter', 'Visit Help Center')}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Testimonials Section */}
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-4">
              {t('destinationDetails.testimonialsTitle', 'What travelers say about {siteName}', { siteName })}
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              {t('destinationDetails.testimonialsSubtitle', 'Join thousands of happy travelers who stay connected with us')}
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, index) => (
                <Card key={index} className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-500 rounded-full flex items-center justify-center text-white font-semibold">
                        {testimonial.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">{testimonial.name}</p>
                        <p className="text-xs text-muted-foreground">{testimonial.handle}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < testimonial.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
                        />
                      ))}
                    </div>

                    <p className="text-sm text-muted-foreground">{testimonial.review}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center mt-8">
              <Link href="/destinations">
                <Button variant="outline" className="px-8">
                  {t('destinationDetails.viewAll', 'View all destinations')}
                </Button>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}