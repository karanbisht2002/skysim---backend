import {
  Infinity,
  Smartphone,
  Phone,
  Headphones,
  Wifi,
  Zap,
  Globe,
  Shield,
  Clock,
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';

interface TickerItem {
  icon: React.ReactNode;
  text: string;
}

interface InfiniteScrollTickerProps {
  items?: TickerItem[];
  className?: string;
}

export function InfiniteScrollTicker({
  items,
  className = '',
}: InfiniteScrollTickerProps) {
  const { t } = useTranslation();

  const defaultItems: TickerItem[] = [
    { icon: <Infinity className="h-5 w-5" />, text: t('website.ticker.lifetime', 'One eSIM for lifetime') },
    { icon: <Smartphone className="h-5 w-5" />, text: t('website.ticker.magicSim', 'Magic SIM Available') },
    { icon: <Phone className="h-5 w-5" />, text: t('website.ticker.dataVoice', 'Data + Voice + SMS') },
    { icon: <Headphones className="h-5 w-5" />, text: t('website.ticker.customerService', 'Customer Service') },
    { icon: <Wifi className="h-5 w-5" />, text: t('website.ticker.hotspot', 'Hotspot Sharing') },
    { icon: <Globe className="h-5 w-5" />, text: t('website.ticker.countries', '190+ Countries') },
    { icon: <Zap className="h-5 w-5" />, text: t('website.ticker.activation', 'Instant Activation') },
    { icon: <Shield className="h-5 w-5" />, text: t('website.ticker.secure', 'Secure & Reliable') },
    { icon: <Clock className="h-5 w-5" />, text: t('website.ticker.noExpiry', 'No Expiry Hassle') },
  ];

  const displayItems = items || defaultItems;

  // Triple the items for smoother infinite scroll
  const duplicatedItems = [...displayItems, ...displayItems, ...displayItems];

  return (
    <div
      className={`w-full overflow-hidden py-4 ${className}`}
      style={{ backgroundColor: '#c6ff00' }}
      data-testid="ticker-features"
    >
      <div className="animate-scroll-ticker flex items-center whitespace-nowrap">
        {duplicatedItems.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-3 px-8 text-base font-semibold text-gray-900"
            data-testid={`ticker-item-${index}`}
          >
            <span className="flex-shrink-0 text-gray-800">{item.icon}</span>
            <span data-testid={`ticker-text-${index}`}>{item.text}</span>
            {/* Separator dot */}
            <span className="mx-2 text-gray-700">•</span>
          </div>
        ))}
      </div>
    </div>
  );
}
