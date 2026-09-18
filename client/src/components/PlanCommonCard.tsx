// components/PlanCommonCard.tsx - COMPLETE CODE WITH REDIRECT LOGIC ONLY
import { Link } from 'wouter';
import { ArrowRight, Wifi, Phone, MessageSquare, Calendar, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ReactCountryFlag from 'react-country-flag';
import { PlanCommonCardProps } from '@/types/types';
import { useUser } from '@/hooks/use-user';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/contexts/TranslationContext';

export function PlanCommonCard({
  id,
  countryCode,
  slug,
  countryName = 'Global',
  dataAmount,
  validity,
  price,
  pricePerDay,
  currencySymbol,
  voiceMinutes,
  smsCount,
  destinationSlug,
  regionSlug,
  badgeText = 'Plan',
  badgeClassName = 'bg-gradient-to-r from-primary to-primary-dark text-white text-xs px-2 py-0.5',
  primaryButtonText = 'Get Plann',
  primaryButtonClassName = 'w-full bg-primary-gradient text-white text-sm rounded-lg',
  isComplete = false,
}: Readonly<PlanCommonCardProps>) {
  const { t } = useTranslation();
  const destinationUrl = slug ? `/unified-checkout/${slug}` : `/destination/${destinationSlug}`;
  const { isAuthenticated, user } = useUser();
  const [, navigate] = useLocation();

  const { toast } = useToast();

  const countryNameDisplay = countryName === 'Global' ? t('PlanCommonCard.defaultCountry', 'Global') : countryName;
  const badgeTextDisplay = badgeText === 'Plan' ? t('PlanCommonCard.defaultBadge', 'Plan') : badgeText;
  const primaryButtonTextDisplay = primaryButtonText === 'Get Plann' ? t('PlanCommonCard.getPlan', 'Get Plan') : primaryButtonText;

  /* =======================
     HELPERS
  ======================= */
  const hasVoiceOrSms = () => {
    return (voiceMinutes && voiceMinutes > 0) || (smsCount && smsCount > 0);
  };

  const isKycComplete = () => {
    return isAuthenticated && user?.kycStatus === 'approved';
  };

  const isUnlimited = (value?: string | number) => {
    if (value === undefined) return false;
    if (typeof value === 'string') {
      return value.toLowerCase().includes('unlimited') || value === '-1MB';
    }
    return value >= 9999;
  };

  const formatDataAmount = (amount: string) => (isUnlimited(amount) ? t('PlanCommonCard.unlimitedUpper', 'UNLIMITED') : amount);
  const formatVoice = (minutes?: number) => (isUnlimited(minutes) ? t('PlanCommonCard.unlimited', 'Unlimited') : t('PlanCommonCard.min', '{count} min', { count: minutes ?? 0 }));
  const formatSms = (count?: number) => (isUnlimited(count) ? t('PlanCommonCard.unlimited', 'Unlimited') : t('PlanCommonCard.sms', '{count} SMS', { count: count ?? 0 }));

  /* =======================
     REDIRECT LOGIC - Only on Get Plan click
  ======================= */
  const handleGetPlanClick = async (e: React.MouseEvent) => {
    e.preventDefault();

    // KYC required check
    if (isComplete && hasVoiceOrSms() && !isKycComplete()) {
      // Check if user is authenticated
      if (!isAuthenticated) {
        toast({
          title: t('planCard.loginTitle', 'Please login first!'),
          description: t('planCard.loginDesc', 'Login to complete KYC verification.'),
        });

        // Wait 2 seconds then redirect to login
        setTimeout(() => {
          navigate('/login');
        }, 2000);

        return;
      }

      // User authenticated but KYC incomplete
      toast({
        title: t('planCard.kycTitle', 'KYC verification required!'),
        description: t('planCard.kycDesc', 'Complete your KYC to access voice & SMS plans.'),
      });

      // Wait 2 seconds then redirect to KYC
      setTimeout(() => {
        navigate('/account/kyc');
      }, 2000);

      return;
    }

    // Normal navigation if no KYC required
    navigate(destinationUrl);
  };

  /* =======================
     RENDER - NO VISUAL CHANGES
  ======================= */
  return (
    <Card className="w-full max-w-[320px] min-w-[280px] border-border/50 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative">
      {/* Badge */}
      <div className="absolute top-3 right-3 z-10">
        <Badge className={badgeClassName}>{badgeTextDisplay}</Badge>
      </div>

      <CardContent className="p-0">
        <div className="p-5 pt-10">
          {/* Country */}
          <div className="flex items-center gap-2 mb-3">
            {countryCode && (
              <ReactCountryFlag
                countryCode={countryCode}
                svg
                style={{ width: '24px', height: '18px' }}
                className="rounded-sm"
              />
            )}
            <h3 className="font-bold text-foreground text-base truncate">{countryNameDisplay}</h3>
          </div>

          {/* Data Summary */}
          <div className="flex items-center gap-2 mb-4">
            <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center flex-shrink-0">
              <Wifi className="h-2.5 w-2.5 text-white" />
            </div>
            <p className="text-muted-foreground text-sm truncate">
              {formatDataAmount(dataAmount)} – {t('PlanCommonCard.days', '{count} Days', { count: validity })}
            </p>
          </div>

          {/* Services - NO CHANGES */}
          <div className="flex gap-4 mb-4 text-center">
            <div className="flex-1 min-w-0">
              <Wifi className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs font-semibold truncate">{formatDataAmount(dataAmount)}</p>
            </div>

            {isComplete && voiceMinutes !== undefined && (
              <div className="flex-1 min-w-0">
                <Phone className="h-4 w-4 mx-auto text-primary mb-1" />
                <p className="text-xs font-semibold truncate">{formatVoice(voiceMinutes)}</p>
              </div>
            )}

            {isComplete && smsCount !== undefined && (
              <div className="flex-1 min-w-0">
                <MessageSquare className="h-4 w-4 mx-auto text-primary mb-1" />
                <p className="text-xs font-semibold truncate">{formatSms(smsCount)}</p>
              </div>
            )}
          </div>

          {/* Validity */}
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{t('PlanCommonCard.days', '{count} Days', { count: validity })}</span>
          </div>

          {/* Price */}
          <div className="mb-4">
            <span className="text-2xl font-bold text-primary">
              {currencySymbol}
              {price}
            </span>
            <p className="text-xs text-muted-foreground">
              {t('PlanCommonCard.perDay', '{currencySymbol}{amount} per day', { currencySymbol, amount: pricePerDay })}
            </p>
          </div>

          {/* Features - NO CHANGES */}
          <div className="space-y-1.5 mb-5 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
              <span className="truncate">{t('PlanCommonCard.dataLabel', '{amount} Data', { amount: formatDataAmount(dataAmount) })}</span>
            </div>

            {isComplete && voiceMinutes !== undefined && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                <span className="truncate">{t('PlanCommonCard.voiceLabel', '{amount} Voice Calls', { amount: formatVoice(voiceMinutes) })}</span>
              </div>
            )}

            {isComplete && smsCount !== undefined && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                <span className="truncate">{t('PlanCommonCard.smsLabel', '{amount} Text Messages', { amount: formatSms(smsCount) })}</span>
              </div>
            )}
          </div>

          {/* Actions - REDIRECT LOGIC HERE ONLY */}
          <div className="space-y-2 flex flex-col">
            <Link href={destinationSlug ? `/destination/${destinationSlug}` : regionSlug ? `/region/${regionSlug}` : `/global`}>
              <Button
                variant="outline"
                className="w-full text-sm rounded-lg"
                data-testid={`button-view-details-${id}`}
              >
                <Wifi className="h-4 w-4 mr-2" />
                {t('planCard.viewDetails')}
              </Button>
            </Link>

            <Link
              href={destinationUrl}
              onClick={handleGetPlanClick}
              data-testid={`button-get-plan-${id}`}
            >
              <Button className={primaryButtonClassName}>
                {primaryButtonTextDisplay}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
