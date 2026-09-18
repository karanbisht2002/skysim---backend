import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";

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
}

interface TranslationContextType {
  language: Language | null;
  languages: Language[];
  languageCode: string;
  isRTL: boolean;
  isLoading: boolean;
  setLanguage: (code: string) => void;
  t: (
    key: string,
    fallbackOrParams?: string | Record<string, string | number>,
    params?: Record<string, string | number>
  ) => string;
}

const TranslationContext = createContext<TranslationContextType | undefined>(
  undefined
);

type TranslationData = Record<string, Record<string, string>>;

const STORAGE_KEY = "esim_language";

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [languageCode, setLanguageCode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved || "en";
    }
    return "en";
  });

  const [translations, setTranslations] = useState<TranslationData>({});

  const { data: languages = [], isLoading: languagesLoading } = useQuery<Language[]>({
    queryKey: ["/api/languages"],
    staleTime: 5 * 60 * 1000,
  });
  const currentLanguage = languages.find((l) => l.code === languageCode) || null;
  const isRTL = currentLanguage?.isRTL || false;

  const { data: translationsData, isLoading: translationsLoading } = useQuery<{
    language: Language;
    translations: TranslationData;
  }>({
    queryKey: [`/api/translations/${languageCode}`],
    enabled: !!languageCode,
    staleTime: 0,
    cacheTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (translationsData?.translations) {
      setTranslations(translationsData.translations);
    }
  }, [translationsData]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = isRTL ? "rtl" : "ltr";
      document.documentElement.lang = languageCode;
    }
  }, [isRTL, languageCode]);

  const setLanguageOLD = useCallback((code: string) => {
    setLanguageCode(code);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, code);
    }
  }, []);


  const setLanguage = useCallback((code: string) => {
    console.log("Language changed to:", code);
    setLanguageCode(code);
    setTranslations({}); // ✅ CLEAR OLD TRANSLATIONS
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, code);
    }
  }, []);


  const t = useCallback(
    (
      key: string,
      fallbackOrParams?: string | Record<string, string | number>,
      params?: Record<string, string | number>
    ): string => {
      let fallback: string | undefined;
      let actualParams: Record<string, string | number> | undefined;

      if (typeof fallbackOrParams === "string") {
        fallback = fallbackOrParams;
        actualParams = params;
      } else {
        fallback = undefined;
        actualParams = fallbackOrParams;
      }

      const keyParts = key.split(".");
      const namespace = keyParts[0];
      const translationKey = keyParts.slice(1).join(".");

      let value: string | undefined;

      if (translations[namespace] && translationKey) {
        value = translations[namespace][translationKey];
      } else if (!translationKey) {
        for (const ns of Object.values(translations)) {
          if (ns[key]) {
            value = ns[key];
            break;
          }
        }
      }

      if (!value) {
        const result = fallback || key;
        if (actualParams) {
          return result.replace(/\{(\w+)\}/g, (match, paramKey) => {
            return actualParams[paramKey]?.toString() || match;
          });
        }
        return result;
      }

      if (actualParams) {
        return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
          return actualParams[paramKey]?.toString() || match;
        });
      }

      return value;
    },
    [translations, languageCode]
  );

  const isLoading = languagesLoading || translationsLoading;

  return (
    <TranslationContext.Provider
      value={{
        language: currentLanguage,
        languages,
        languageCode,
        isRTL,
        isLoading,
        setLanguage,
        t,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within TranslationProvider");
  }
  return context;
}
