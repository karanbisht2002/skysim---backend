// pages/DynamicPage.tsx
import { useRoute, Redirect } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PageData {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function DynamicPage() {
  // Match route: /:slug
  const [match, params] = useRoute<{ slug: string }>('/pages/:slug');
  console.log('params', params, match);
  const slug = params?.slug;

  const { data, isLoading, error } = useQuery({
    queryKey: ['page-by-slug', slug],
    queryFn: async () => {
      const response = await fetch(`/api/pages/slug/${slug}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Page not found');
        }
        throw new Error('Failed to fetch page');
      }

      const result = await response.json();
      return result.data as PageData;
    },
    enabled: !!slug,
  });

  const formattedContent = data?.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br />');

  // If route doesn't match
  if (!match) {
    return <Redirect to="/404" />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* <SiteHeader /> */}
        <main className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        {/* <SiteFooter /> */}
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* <SiteHeader /> */}
        <main className="flex-1 py-16 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {error instanceof Error ? error.message : 'Failed to load page'}
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </main>
        {/* <SiteFooter /> */}
      </div>
    );
  }

  if (!data) {
    return <Redirect to="/404" />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>{data.metaTitle || data.title}</title>
        {data.metaDescription && <meta name="description" content={data.metaDescription} />}
      </Helmet>

      {/* <SiteHeader /> */}

      <main className="flex-1 py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold mb-8 text-foreground">{data.title}</h1>

            <p className="text-muted-foreground mb-8">
              Last updated:{' '}
              {new Date(data.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>

            <div
              className="prose prose-lg dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: `<p>${formattedContent}</p>`,
              }}
            />
          </div>
        </div>
      </main>

      {/* <SiteFooter /> */}
    </div>
  );
}
