import { useSettingByKey } from '@/hooks/useSettings';
import { apiRequest } from '@/lib/queryClient';
import { SettingsState } from '@/redux/slice/settingsSlice';
import { AdminPlatformSettings, PageApiResponse } from '@/types/types';
import { useQuery } from '@tanstack/react-query';
import {
  FaInstagram,
  FaFacebookF,
  FaYoutube,
  FaLinkedinIn,
  FaAndroid,
  FaAppStore,
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import {
  SiVisa,
  SiMastercard,
  SiApplepay,
  SiGooglepay,
  SiAmericanexpress,
  SiPaypal,
} from 'react-icons/si';
import { Link } from 'wouter';
import { useTranslation } from '@/contexts/TranslationContext';
import { useTheme } from '@/contexts/ThemeContext';

export function NewFooter() {
  const { data: settings } = useQuery<SettingsState>({
    queryKey: ['/api/public/settings'],
  });

  const { data: allDestinations = [] } = useQuery({
    queryKey: ['/api/destinations/with-pricing'],
  });

  const topDestinations = allDestinations.filter((d: any) => d.isTop);
  const destinationPlan = topDestinations.length > 0 ? topDestinations : allDestinations.slice(0, 6);
  const { t } = useTranslation();
  const { theme } = useTheme();
  const siteName = useSettingByKey('platform_name');
  const lightLogo = useSettingByKey('logo');
  const darkLogo = useSettingByKey('dark_logo');
  const logoHeight = useSettingByKey('logo_height');
  const logoWidth = useSettingByKey('logo_width');
  const logo = theme === 'dark' ? (darkLogo || lightLogo) : lightLogo;
  const themePrimaryDark = settings?.theme_primary_dark;

  // console.log("check theme setting", themePrimaryDark)

  const { data: pages } = useQuery<PageApiResponse>({
    queryKey: ['/api/pages'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pages');
      return res.json();
    },
  });

  // Safe social links with array/string handling
  const getSocialUrl = (socialValue?: string | string[]) => {
    if (!socialValue) return '#';
    return Array.isArray(socialValue) ? socialValue[0] || '#' : socialValue;
  };

  const socialLinks = [
    {
      icon: FaInstagram,
      href: getSocialUrl(settings?.social_instagram),
      label: 'Instagram',
      hover: 'group-hover:text-pink-500',
    },
    {
      icon: FaFacebookF,
      href: getSocialUrl(settings?.social_facebook),
      label: 'Facebook',
      hover: 'group-hover:text-blue-600',
    },
    { icon: FaYoutube, href: getSocialUrl(settings?.social_youtube), label: "YouTube", hover: "group-hover:text-red-500" },
    { icon: FaLinkedinIn, href: getSocialUrl(settings?.social_linkedin), label: "LinkedIn", hover: "group-hover:text-sky-600" },
    { icon: FaXTwitter, href: getSocialUrl(settings?.social_twitter), label: "Twitter", hover: "group-hover:text-foreground" }
  ];

  return (
    <footer
      className="py-12 md:py-16 border-t border-border pb-28 md:pb-16"
      style={{ backgroundColor: 'var(--primary-dark)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12 mb-12">
          {/* Logo & Description */}
          <div className="lg:col-span-1">
            <a href="/" className="inline-block mb-4">
              <div className="flex items-center flex-col gap-2">
                <div className="h-16 w-40 rounded-lg flex items-center justify-center bg-card border">
                  {logo ? (
                    <img src={logo}
                      alt="Platform Logo"
                      style={{
                        height: logoHeight ? `${logoHeight}px` : '100%',
                        width: logoWidth ? `${logoWidth}px` : 'auto',
                        maxHeight: '64px',
                        maxWidth: '160px',
                      }}
                      className="object-contain rounded" loading="lazy" />
                  ) : (
                    <span className="text-foreground text-lg font-semibold">
                      {settings?.site_name?.charAt(0) ?? 'E'}
                    </span>
                  )}
                </div>
              </div>
            </a>
            <p className="text-sm text-gray-400 font-base leading-relaxed mb-6">
              {t(
                'website.footer.description',
                'Your ultimate travel connectivity partner that offers secure eSIMs and SIM cards in 175+ countries at affordable rates. Perfect for global tourists, students, and travelers.',
              )}
            </p>

            {/* App Store Badges */}
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={settings?.social_ios || '#'}
                className="inline-block"
                aria-label="Download on App Store"
              >
                <img src="/images/stores/AppStore_new.png"
                  alt="Download on App Store"
                  className="h-10" loading="lazy" />
              </a>
              <a
                href={settings?.social_android || '#'}
                className="inline-block"
                aria-label="Get it on Google Play"
              >
                <img src="/images/stores/PlayStore.png"
                  alt="Get it on Google Play"
                  className="h-10" loading="lazy" />
              </a>
            </div>
          </div>

          {/* Purchase */}
          <div>
            <h3 className="text-base font-semibold text-primary mb-4">
              {' '}
              {siteName} {t('website.footer.global', 'Global')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="/what-is-esim"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.whatIsEsim', 'What is an eSIM')}
                </a>
              </li>
              <li>
                <a
                  href="/about-us"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.aboutUs', 'About Us')}
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.contactUs', 'Contact Us')}
                </a>
              </li>
              <li>
                <a
                  href="/destinations"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.destinations', 'Destinations')}
                </a>
              </li>
            </ul>
          </div>

          {/* Top Destinations */}
          <div>
            <h3 className="text-base font-semibold text-primary mb-4">
              {t('website.footer.topDestinations', 'Top Destinations')}
            </h3>
            <ul className="space-y-2.5">
              {destinationPlan?.map((item) => (
                <li key={item.id}>
                  <a
                    href={`/destination/${item.slug}`}
                    className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                  >
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-base font-semibold text-primary mb-4">
              {' '}
              {t('website.footer.resources', 'Resources')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="/blog"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.blog', 'Blog')}
                </a>
              </li>

              <li>
                <a
                  href="/faq"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.faq', "FAQ's")}
                </a>
              </li>
              <li>
                <a
                  href="/account/support"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.supportTicket', 'Support Ticket')}
                </a>
              </li>
              <li>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="/account/support"
                  className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline"
                >
                  {t('website.footer.helpCenter', 'Help Center')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-base font-semibold text-primary mb-4">
              {t('website.footer.pages', 'Pages')}
            </h3>
            <ul className="space-y-2.5">
              {pages?.data?.map((link) => (
                <li key={link.id}>
                  <Link href={`/pages/${link.slug}`}>
                    <span className="text-sm text-gray-400 hover:text-primary font-base transition hover:underline">
                      {link.title?.charAt(0).toUpperCase() + link.title?.slice(1)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-wrap items-center justify-between gap-6 mb-6 border-t border-border pt-8">
          {/* Payment icons - left */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <SiVisa className="h-8 w-12 text-gray-400" />
            <SiMastercard className="h-8 w-8 text-gray-400" />
            <SiAmericanexpress className="h-6 w-10 text-gray-400" />
            <SiPaypal className="h-6 w-12 text-gray-400" />
          </div>

          {/* Social icons - right */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`footer-social-${social.label.toLowerCase()}`}
                className="
        group
        h-10 w-10
        rounded-xl
        border border-border
        bg-card
        flex items-center justify-center
        text-muted-foreground
        transition-all duration-200
        hover:bg-background
        hover:border-border
        hover:shadow-md
        hover:scale-105
      "
              >
                <social.icon className={`h-5 w-5 transition-colors ${social.hover}`} />
              </a>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className=" pt-6">
          <p className="text-xs text-gray-400">
            {settings?.copyright_text ? (
              settings.copyright_text
            ) : (
              <>
                © 2026 {settings?.platform_name || 'eSIM Connect'}{' '}
                {t('website.footer.copyright', 'All rights reserved.')}
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default NewFooter;
