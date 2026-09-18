import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Smartphone, Check, Search } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/contexts/TranslationContext';

/* =========================
   TYPES
========================= */
type ApiDevice = {
  os: 'android' | 'ios';
  brand: string;
  name: string;
};

type DeviceCategory = {
  brand: string;
  models: string[];
};

/* =========================
   API CALL
========================= */
async function fetchDevices(): Promise<ApiDevice[]> {
  const res = await fetch('/api/devices');

  if (!res.ok) {
    throw new Error('Failed to fetch devices');
  }

  const json = await res.json();
  return json.data;
}

/* =========================
   GROUP + DEDUPE DEVICES
========================= */
function groupDevices(
  devices: ApiDevice[],
  os?: 'android' | 'ios',
): DeviceCategory[] {
  const map = new Map<string, Set<string>>();

  devices
    .filter(d => (os ? d.os === os : true))
    .forEach(d => {
      const brand = d.brand.trim().toUpperCase();
      const model = d.name.trim();

      if (!map.has(brand)) {
        map.set(brand, new Set());
      }

      map.get(brand)!.add(model);
    });

  return Array.from(map.entries())
    .map(([brand, models]) => ({
      brand,
      models: Array.from(models).sort(),
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
}

/* =========================
   SEARCH FILTER
========================= */
function filterDevices(
  devices: DeviceCategory[],
  query: string,
): DeviceCategory[] {
  if (!query.trim()) return devices;

  const q = query.toLowerCase();

  return devices
    .map(category => {
      const brandMatch = category.brand.toLowerCase().includes(q);

      const matchedModels = category.models.filter(model =>
        model.toLowerCase().includes(q),
      );

      if (brandMatch) return category;
      if (matchedModels.length > 0) {
        return { ...category, models: matchedModels };
      }

      return null;
    })
    .filter(Boolean) as DeviceCategory[];
}

/* =========================
   PAGE
========================= */
export default function CompatibleDevices() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading compatible devices…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">Failed to load devices</p>
      </div>
    );
  }

  const iosDevices = filterDevices(groupDevices(data, 'ios'), search);
  const androidDevices = filterDevices(groupDevices(data, 'android'), search);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4  pt-[70px] sm:pt-[150px] max-w-5xl dark:bg-dark dark:text-white">
        {/* Header */}
        <div className="text-center flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center mb-12">
          <Smartphone className="sm:h-16 sm:w-16 h-10 w-10 text-primary mx-auto mb-4" />
          <h1 className="sm:text-4xl font-bold mb-4">{t('website.compatibleDevices.title', 'Compatible Devices')}</h1>
          <p className="text-lg text-muted-foreground">
            {t('website.compatibleDevices.description', 'Check if your device supports eSIM technology')}
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('website.compatibleDevices.howToCheck', '	How to Check eSIM Support')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                1
              </div>
              <div>
                <h3 className="font-medium mb-1">{t('website.compatibleDevices.iphoneUsers', '	iPhone Users')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('website.compatibleDevices.iphoneInstructions', 'Go to Settings > Cellular/Mobile Data > Add Cellular Plan. If you see this option, your iPhone supports eSIM.')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                2
              </div>
              <div>
                <h3 className="font-medium mb-1">
                  {t('website.compatibleDevices.androidUsers', 'Android Users')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('website.compatibleDevices.androidInstructions', 'Dial *#06# to see your IMEI. If you see an EID number, your device supports eSIM.')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="max-w-xl mx-auto mb-12">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by brand or model (e.g. iPhone, Galaxy S24)"
              className="pl-9"
            />
          </div>
        </div>

        {/* iOS */}
        {iosDevices.length > 0 && (
          <Section title="Apple (iOS)" devices={iosDevices} />
        )}

        {/* Android */}
        {androidDevices.length > 0 && (
          <Section title="Android Devices" devices={androidDevices} />
        )}

        {/* Empty State */}
        {iosDevices.length === 0 && androidDevices.length === 0 && (
          <p className="text-center text-muted-foreground mt-10">
            No devices found for "{search}"
          </p>
        )}

        {/* Footer */}
        <Card className="mt-12 bg-primary/5 border-primary/20">
          <CardContent className="pt-6 text-center text-sm">
            {t(
              'website.compatibleDevices.notListed',
              "Don't see your device? Contact our support team to verify eSIM compatibility.",
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* =========================
   SECTION COMPONENT
========================= */
function Section({
  title,
  devices,
}: {
  title: string;
  devices: DeviceCategory[];
}) {
  return (
    <>
      <h2 className="text-2xl font-semibold mb-6">{title}</h2>

      <div className="space-y-6 mb-12">
        {devices.map(category => (
          <Card key={category.brand}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-primary" />
                {category.brand}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {category.models.map(model => (
                  <div
                    key={model}
                    className="text-sm p-2 rounded-md bg-muted/50"
                  >
                    {model}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
