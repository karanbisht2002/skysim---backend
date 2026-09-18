import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Globe } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import { useTranslation } from '@/contexts/TranslationContext';

interface CoverageCountriesModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  countryCodes: string[];
  title?: string;
}

export function CoverageCountriesModal({
  isOpen,
  onOpenChange,
  countryCodes,
  title,
}: Readonly<CoverageCountriesModalProps>) {
  const { t, languageCode } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  // Map country codes to name
  const getCountryName = (code: string) => {
    try {
      const regionNames = new Intl.DisplayNames([languageCode], { type: 'region' });
      return regionNames.of(code) || code;
    } catch (e) {
      return code;
    }
  };

  const countries = countryCodes.map((code) => ({
    code,
    name: getCountryName(code),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95%] max-h-[85vh] p-6 rounded-2xl flex flex-col gap-4 overflow-hidden border border-border shadow-xl">
        <DialogHeader className="flex flex-col pb-2 border-b border-border">
          <DialogTitle className="text-xl font-bold text-foreground">
            {t('destinationDetails.supportedCountries', 'Supported Countries')}
          </DialogTitle>
          {title && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {title}
            </p>
          )}
        </DialogHeader>

        {/* Search destination */}
        <div className="relative">
          <Input
            placeholder={t('destinationDetails.searchDestination', 'Search your destination')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>

        {/* List of Countries */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 mt-2 min-h-[300px] max-h-[50vh] scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
          {filteredCountries.length > 0 ? (
            filteredCountries.map((country) => (
              <div
                key={country.code}
                className="flex items-center gap-3.5 py-2 px-3 rounded-xl hover:bg-accent/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-muted border border-border flex-shrink-0">
                  <ReactCountryFlag
                    countryCode={country.code}
                    svg
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
                <span className="font-semibold text-foreground text-sm">
                  {country.name}
                </span>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Globe className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">
                {t('destinationDetails.noCountriesFound', 'No countries found')}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
