import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Globe, Lock } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTranslation } from '@/contexts/TranslationContext';
import { SEOHead } from '@/components/SEOHead';
import { useSettingByKey } from '@/hooks/useSettings';

export default function AdminLogin() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await apiRequest('POST', '/api/admin/login', {
        email,
        password,
      });

      const response: any = await res.json();

      const admin = response?.data?.admin;

      if (!admin) {
        throw new Error('Invalid login response');
      }

      toast({
        title: t('admin.login.loginSuccessTitle', 'Login Successful'),
        description: t('admin.login.loginSuccessDesc', 'Welcome back, {{name}}!').replace(
          '{{name}}',
          admin.name,
        ),
      });

      // refresh admin auth state
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/me'] });

      setLocation('/admin/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('admin.login.loginFailedTitle', 'Login Failed'),
        description: error.message || t('admin.login.loginFailedDesc', 'Invalid email or password'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginOLD = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await apiRequest('POST', '/api/admin/login', {
        email,
        password,
      });
      const response: any = await res.json();

      toast({
        title: t('admin.login.loginSuccessTitle', 'Login Successful'),
        description: t('admin.login.loginSuccessDesc', 'Welcome back, {{name}}!').replace(
          '{{name}}',
          response.admin.name,
        ),
      });

      // Invalidate admin auth cache so AdminGuard gets fresh data
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/me'] });

      setLocation('/admin/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('admin.login.loginFailedTitle', 'Login Failed'),
        description: error.message || t('admin.login.loginFailedDesc', 'Invalid email or password'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const showDemoLogin = useSettingByKey('show_demo_login');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SEOHead
        title={String(t('admin.login.pageTitle', 'Admin Login'))}
        description={String(t('admin.login.description', 'Enter your credentials to access the admin panel'))}
        noIndex={true}
        noFollow={true}
      />

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="flex items-center gap-2">
              <Globe className="h-8 w-8 text-primary" />
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center" data-testid="text-admin-login-title">
            {t('admin.login.title', 'Admin Login')}
          </CardTitle>
          <CardDescription className="text-center">
            {t('admin.login.description', 'Enter your credentials to access the admin panel')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('admin.login.emailLabel', 'Email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('admin.login.emailPlaceholder', 'admin@example.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-admin-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('admin.login.passwordLabel', 'Password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('admin.login.passwordPlaceholder', 'Enter your password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-admin-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary-gradient"
              disabled={isLoading}
              data-testid="button-admin-login"
            >
              {isLoading
                ? t('admin.login.loggingIn', 'Logging in...')
                : t('admin.login.loginButton', 'Login')}
            </Button>
          </form>

          {showDemoLogin === 'true' && (
            <div className="mt-6 p-4 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground text-center">
                {t('admin.login.testCredentialsTitle', 'Default credentials for testing:')}
              </p>
              <div className="mt-2 space-y-1 text-sm font-mono text-center">
                <p>
                  {t('admin.login.testEmail', 'Email:')}{' '}
                  <span className="font-semibold">demo@diploy.in</span>
                </p>
                <p>
                  {t('admin.login.testPassword', 'Password:')}{' '}
                  <span className="font-semibold">Demo@123</span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
