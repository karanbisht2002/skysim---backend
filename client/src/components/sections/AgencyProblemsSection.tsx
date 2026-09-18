import { ArrowUpRight } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '../ui/button';
import { LinkPreview } from '../ui/link-preview';
import { useTranslation } from '@/contexts/TranslationContext';




export function AgencyProblemsSection() {
  const { t } = useTranslation();

  return (
    <section className="w-full py-16 md:py-24 bg-background">
      <div className="containers">

        {/* ROW 1 */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">

          <div className="flex items-start gap-6 flex-1">
            <div className="w-16 md:w-20 h-1.5 bg-primary mt-5 flex-shrink-0"></div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight max-w-xl">
              {t("website.agency.title", "Stay Connected Worldwide with Instant eSIM Activation")}
            </h2>
          </div>

          <div className="flex-shrink-0">
            <Link href="/destinations">
              <a>
                <Button
                  size="lg"
                  className="bg-primary-gradient text-white px-8 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300 group"
                >
                  {t("website.agency.button", "Explore Plans")}
                  <ArrowUpRight className="w-5 h-5 ml-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </Button>
              </a>
            </Link>
          </div>
        </div>

        {/* ROW 2 */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* LEFT IMAGE */}
          <div className="w-full lg:w-[45%] flex-shrink-0">
            <div className="relative rounded-3xl overflow-hidden border-2 border-border shadow-2xl">
              <img src="/images/business-worldwide-coverage.webp"
                alt={t("website.agency.imageAlt1", "Global eSIM connectivity across multiple devices")}
                className="w-full h-[400px] md:h-[500px] object-cover" loading="lazy" />
            </div>
          </div>

          {/* RIGHT CONTENT */}
          <div className="flex-1 flex flex-col gap-8">

            <div className="w-full p-6 md:p-8 border-2 border-border rounded-2xl bg-card">
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                {t("website.agency.description1", "Experience seamless")}{" "}
                <LinkPreview url="/account/support" className="font-bold">
                  {t("website.agency.globalConnectivity", "global connectivity")}
                </LinkPreview>{" "}
                {t("website.agency.description2", "with our instant eSIM solutions. No physical SIM cards, no waiting – just scan a QR code and you're connected in seconds. Travel across 190+ countries with affordable data plans, customer support, and the freedom to stay online wherever your journey takes you.")}
              </p>
            </div>

            {/* Circle Badge + Image */}
            <div className="flex flex-col sm:flex-row items-center gap-6">

              <div className="relative w-40 h-40 flex-shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-muted-foreground/40 animate-spin-slow"></div>

                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160">
                  <defs>
                    <path
                      id="textPath"
                      d="M 80, 80 m -65, 0 a 65,65 0 1,1 130,0 a 65,65 0 1,1 -130,0"
                    />
                  </defs>
                  <text className="text-[9px] fill-muted-foreground uppercase tracking-widest font-medium">
                    <textPath href="#textPath">
                      {t("website.agency.circleText", "INSTANT • ACTIVATION • 190+ • COUNTRIES • SUPPORT •")}
                    </textPath>
                  </text>
                </svg>

                <div className="absolute inset-0 flex items-center justify-center">
                  <Link href="/destinations">
                    <a>
                      <button className="w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all duration-300">
                        <ArrowUpRight className="w-10 h-10 text-white" strokeWidth={2.5} />
                      </button>
                    </a>
                  </Link>
                </div>
              </div>

              <div className="flex-1 w-full">
                <div className="relative rounded-2xl overflow-hidden border-2 border-border shadow-xl">
                  <img src="/images/Growth Opportunities.webp"
                    alt={t("website.agency.imageAlt2", "Mobile device showing eSIM activation process")}
                    className="w-full h-[240px] object-cover" loading="lazy" />
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
