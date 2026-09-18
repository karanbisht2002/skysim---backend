// Timeline/Features Section Types
export interface FeatureImage {
  src: string;
  alt: string;
}

export interface FeatureButtonInfo {
  title: string;
  herf: string;
}

export interface FeatureRightSection {
  image: FeatureImage;
  detils: string[];
  buttonInfo: FeatureButtonInfo;
}

export interface FeatureItem {
  title: string;
  subtitle: string;
  rightSec: FeatureRightSection[];
}

export interface FeatureSecDataType {
  secTitle: string;
  secData: FeatureItem[];
}

export interface AdminPlatformSettings {
  package_selection_mode: 'auto' | 'manual';
  platform_name: string;
  platform_tagline: string;
  site_name: string;
  site_description: string;
  timezone: string;
  preferred_provider_id: string;
  copyright_text: string;
  currency: string;
  logo: string;
  dark_logo?: string;
  favicon: string;
  last_airalo_sync_timestamp: string; // stored as string timestamp
  whatsapp_show: string | boolean;
  whatsapp_number: string;
  homepage_popup_enabled: string;
  homepage_popup_image?: string;
  homepage_popup_code?: string;
  homepage_popup_text?: string;
}

// Single setting item
export interface SettingItemType {
  id: string;
  key: string;
  value: string;
  category: 'general' | 'seo' | 'system' | string;
  updatedAt: string;
}

export interface SettingsResponse {
  success: boolean;
  message: string;
  data: SettingItemType[];
}

export type SettingsKey =
  | 'site_name'
  | 'site_description'
  | 'timezone'
  | 'platform_name'
  | 'platform_tagline'
  | 'copyright_text'
  | 'currency'
  | 'last_airalo_sync_timestamp';

export interface CompletePackageType {
  id: string;
  title: string;
  slug: string;
  dataAmount: string;
  validity: number;
  retailPrice: string;
  voiceMinutes: number;
  smsCount: number;
  destinationId?: string;
  regionId?: string;
  destination?: {
    id: string;
    name: string;
    countryCode: string;
    slug: string;
  };
}

export interface PlanCommonCardProps {
  id: string;

  countryCode?: string;
  countryName?: string;
  slug?: string;

  dataAmount: string;
  validity: number;

  price: string;
  pricePerDay: string;
  currencySymbol: string;

  voiceMinutes?: number;
  smsCount?: number;

  destinationSlug?: string;

  badgeText?: string;
  badgeClassName?: string;

  primaryButtonText?: string;
  primaryButtonClassName?: string;

  isComplete?: boolean;
}

export interface PageApiData {
  id: string;
  slug: string;
  title: string;
  content: string;

  metaTitle?: string;
  metaDescription?: string;

  isPublished: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface PageApiResponse {
  success: boolean;
  data: PageApiData[];
}
