import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslation } from "@/contexts/TranslationContext";

interface FAQSectionProps {
  limit?: number;
  showTitle?: boolean;
}

export function FAQSection({ limit, showTitle = true }: FAQSectionProps) {
  const { t } = useTranslation();

  const faqs = [
    {
      question: t("FAQSection.faq1Question"),
      answer: t("FAQSection.faq1Answer"),
    },
    {
      question: t("FAQSection.faq2Question"),
      answer: t("FAQSection.faq2Answer"),
    },
    {
      question: t("FAQSection.faq3Question"),
      answer: t("FAQSection.faq3Answer"),
    },
    {
      question: t("FAQSection.faq4Question"),
      answer: t("FAQSection.faq4Answer"),
    },
    {
      question: t("FAQSection.faq5Question"),
      answer: t("FAQSection.faq5Answer"),
    },
    {
      question: t("FAQSection.faq6Question"),
      answer: t("FAQSection.faq6Answer"),
    },
  ];

  const displayFaqs = limit ? faqs.slice(0, limit) : faqs;

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {showTitle && (
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t("FAQSection.title")}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("FAQSection.subtitle")}
            </p>
          </div>
        )}

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {displayFaqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border rounded-xl px-6 bg-card"
                data-testid={`faq-item-${index}`}
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
