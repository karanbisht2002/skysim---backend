import { useState, useEffect } from 'react';
import {
  Mail,
  Lock,
  ArrowLeft,
  X,
  Gift,
  Globe,
  Shield,
  Zap,
  Clock,
  Eye,
  EyeOff,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Link, useLocation } from 'wouter';
import { useTranslation } from '@/contexts/TranslationContext';
import { useQuery } from '@tanstack/react-query';
import { useSettingByKey } from '@/hooks/useSettings';
import { signInWithGoogle } from "@/lib/firebase";
import ReCAPTCHA from 'react-google-recaptcha';
import { useRef } from 'react';


interface ReferralSettings {
  enabled: boolean;
  referredUserDiscount: string;
}

import { SEOHead } from '@/components/SEOHead';

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [signupStep, setSignupStep] = useState<'email' | 'otp' | 'details'>('email');
  const [forgotStep, setForgotStep] = useState<'email' | 'reset'>('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showReferralBanner, setShowReferralBanner] = useState(false);

  const recaptchaRef = useRef<ReCAPTCHA | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);


  const VITE_RECAPTCHA_SITE_KEY = useSettingByKey('recaptcha_site_key');
  const RecaptchaEnabled = useSettingByKey('recaptcha_enabled');

  const isCaptchaEnabled = RecaptchaEnabled === 'true' || RecaptchaEnabled === true;

  console.log('VITE_RECAPTCHA_SITE_KEY', VITE_RECAPTCHA_SITE_KEY);
  console.log('RecaptchaEnabled', RecaptchaEnabled);

  const logo = useSettingByKey('logo');
  const logoHeight = useSettingByKey('logo_height');
  const logoWidth = useSettingByKey('logo_width');

  const { data: settings } = useQuery<ReferralSettings>({
    queryKey: ['/api/referrals/settings'],
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');

    if (refCode) {
      const upperRefCode = refCode.toUpperCase();
      setReferralCode(upperRefCode);
      setShowReferralBanner(true);
      localStorage.setItem('pendingReferralCode', upperRefCode);
    }
  }, []);

  const resetForms = () => {
    setSignupStep('email');
    setForgotStep('email');
    setShowForgotPassword(false);
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setName('');
  };

  // ✅ Cleanup effect
  useEffect(() => {
    return () => {
      setIsLoading(false);
    };
  }, []);


  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: t('common.error', 'Error'),
        description: t('website.login.enterEmailPassword', 'Please enter email and password'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      if (isCaptchaEnabled && !captchaToken) {
        toast({
          title: t('website.login.captchaRequired', 'Captcha Required'),
          description: t('website.login.verifyHuman', 'Please verify you are human'),
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      await apiRequest('POST', '/api/auth/login-password', {
        email,
        password,
        captchaToken,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });

      setEmail('');
      setPassword('');
      recaptchaRef.current?.reset();
      setCaptchaToken(null);

      toast({
        title: t('common.success', 'Success!'),
        description: t('website.login.loginSuccess', 'Login successful! Redirecting...'),
        duration: 1500,
      });


      const timer2 = setTimeout(() => {
        if (window.location.pathname !== '/account/profile') {
          window.location.href = '/account/profile';
        }
      }, 1200);

      return () => {
        // clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } catch (error: any) {
      let errorMessage = 'Invalid email or password';
      try {
        const match = error.message?.match(/\d+:\s*(.+)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          errorMessage = parsed.message || errorMessage;
        }
      } catch { }

      toast({
        title: t('website.login.loginFailed', 'Login Failed'),
        description: errorMessage,
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendSignupOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/auth/send-otp', { email, purpose: 'login' });
      setSignupStep('otp');
      toast({
        title: t('checkout.otpSent', 'OTP Sent'),
        description: t('checkout.checkEmail', 'Check your email for the verification code.'),
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send OTP',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySignupOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;

    setIsLoading(true);
    try {
      const res = await apiRequest('POST', '/api/auth/verify-otp', { email, otp });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Invalid OTP code');
      }

      setSignupStep('details');
      toast({
        title: t('website.login.emailVerified', 'Email Verified'),
        description: t('website.login.completeSetupMsg', 'Now complete your account setup'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || 'Invalid OTP code',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !newPassword || !confirmPassword) return;

    if (newPassword !== confirmPassword) {
      toast({
        title: t('common.error', 'Error'),
        description: t('website.login.passwordNotMatch', 'Passwords do not match'),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: t('common.error', 'Error'),
        description: t('website.login.passwordMinLength', 'Password must be at least 8 characters'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest('PATCH', '/api/user/profile', { name });

      await apiRequest('POST', '/api/auth/set-password', {
        name: name,
        password: newPassword,
        confirmPassword: confirmPassword,
      });

      const pendingCode = localStorage.getItem('pendingReferralCode');
      if (pendingCode) {
        try {
          await apiRequest('POST', '/api/referrals/signup', {
            code: pendingCode,
          });

          localStorage.removeItem('pendingReferralCode');
        } catch (refError) {
          console.log('referror', refError);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });

      toast({
        title: t('website.login.accountCreated', 'Account Created'),
        description: t('website.login.accountReady', 'Your account is ready!'),
      });

      setLocation('/account/profile');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete signup',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/auth/forgot-password', { email });
      setForgotStep('reset');
      toast({
        title: t('website.login.resetCodeSent', 'Reset Code Sent'),
        description: t(
          'website.login.resetCodeSentDesc',
          'If an account exists, a reset code has been sent to your email.'
        ),
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send reset code',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !newPassword || !confirmPassword) return;

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/auth/reset-password', {
        email,
        otp,
        newPassword,
        confirmPassword,
      });

      toast({
        title: t('website.login.passwordReset', 'Password Reset'),
        description: t(
          'website.login.passwordResetDesc',
          'Your password has been reset. You can now login.'
        ),
      });

      setShowForgotPassword(false);
      resetForms();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const platformBenefits = [
    {
      icon: Globe,
      title: t('website.login.globalCoverage', 'Global Coverage'),
      description: t(
        'website.login.globalCoverageDesc',
        'Access mobile data in 190+ countries worldwide'
      ),
    },
    {
      icon: Zap,
      title: t('website.login.instantActivation', 'Instant Activation'),
      description: t(
        'website.login.instantActivationDesc',
        'Get connected in seconds with QR code setup'
      ),
    },
    {
      icon: Shield,
      title: t('website.login.secureReliable', 'Secure & Reliable'),
      description: t(
        'website.login.secureReliableDesc',
        'Enterprise-grade security for your data'
      ),
    },
    {
      icon: Clock,
      title: t('website.login.support247', '24/7 Support'),
      description: t(
        'website.login.support247Desc',
        'Our team is always here to help you'
      ),
    }
  ];






  const handleGoogleLogin = async () => {
    try {
      const result =
        await signInWithGoogle();

      const idToken =
        await result.user.getIdToken();

      await apiRequest(
        "POST",
        "/api/auth/web/login-with-google",
        {
          idToken,
          referralCode:
            localStorage.getItem(
              "pendingReferralCode"
            ),
        }
      );

      window.location.href =
        "/account/profile";
    } catch (err) {
      console.error(
        "Google login error",
        err
      );
    }
  };




  return (
    <div className="min-h-screen flex max-w-[100vw] overflow-x-hidden">
      {/* Left Side - Platform Benefits */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary-light to-primary-dark p-12 flex-col justify-between relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
        </div>

        <div className="relative z-10">
          <Link href="/">
            {logo ? (
              <img className="rounded-lg"
                src={logo}
                style={{
                  height: logoHeight ? `${logoHeight}px` : '64px', // Default h-16 is 64px
                  width: logoWidth ? `${logoWidth}px` : 'auto',
                }} loading="lazy" />
            ) : (
              <div className="flex items-center gap-2 text-white cursor-pointer"
                data-testid="link-logo">

                <Globe className="h-8 w-8" />
                <span className="font-bold text-2xl">eSIM Global</span>
              </div>
            )}
          </Link>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-4">{t('website.login.stayConnected', 'Stay Connected Anywhere')}</h1>
            <p className="text-xl text-white/80">
              {t("website.login.joinMillions", "Join millions of travelers using eSIM for seamless connectivity")}
            </p>
          </div>

          <div className="space-y-6">
            {platformBenefits.map((benefit, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <benefit.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{benefit.title}</h3>
                  <p className="text-white/70 text-sm">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-white/60 text-sm">{t('website.login.trustedTravelers', 'Trusted by 2M+ travelers worldwide')}</p>
        </div>
      </div>

      {/* Right Side - Auth Forms */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <Link href="/">
              <div
                className="inline-flex items-center gap-2 cursor-pointer"
                data-testid="link-logo-mobile"
              >
                <Globe className="h-8 w-8 text-primary" />
                <span className="font-bold text-2xl">eSIM Global</span>
              </div>
            </Link>
          </div>

          <Link href="/">
            <div
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
              data-testid="link-back-home"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('checkout.backToHome', 'Back to Home')}
            </div>
          </Link>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">{t('website.login.welcome', "Welcome")}</h2>
            <p className="text-muted-foreground mt-1">
              {t('website.login.subtitle', 'Sign in to your account or create a new one')}
            </p>
          </div>

          {/* Referral Banner */}
          {showReferralBanner && referralCode && (
            <Alert
              className="mb-6 border-primary-light bg-teal-500/5 relative"
              data-testid="alert-referral-banner"
            >
              <Gift className="h-4 w-4 text-primary" />
              <AlertDescription className="pr-8">
                <span className="font-semibold text-primary">
                  {t('referrals.youveBeenReferred', {
                    discount: settings?.referredUserDiscount || 0,
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-6 w-6 bg-gradient-primary"
                  onClick={() => {
                    setShowReferralBanner(false);
                    localStorage.removeItem('pendingReferralCode');
                  }}
                  data-testid="button-dismiss-referral"
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Tabs
            value={authTab}
            onValueChange={(v) => {
              setAuthTab(v as any);
              resetForms();
            }}
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin" data-testid="tab-signin">
                {t('website.login.signin', 'Sign In')}
              </TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">
                {t('website.login.signup', 'Sign Up')}
              </TabsTrigger>
            </TabsList>

            {/* Sign In - Password with Forgot Password Flow */}
            <TabsContent value="signin">
              {!showForgotPassword ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('website.login.signin', 'Sign In')}</CardTitle>
                    <CardDescription> {t('website.login.signinDesc', 'Enter your email and password')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handlePasswordLogin} className="space-y-4">
                      <div>
                        <label htmlFor="email-signin" className="text-sm font-medium mb-2 block">
                          {t('website.login.email', "Email")}
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="email-signin"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-10"
                            autoComplete="email"
                            required
                            data-testid="input-email-signin"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="password-signin" className="text-sm font-medium mb-2 block">
                          {t('website.login.password', 'Password')}
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="password-signin"
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('website.login.enterPassword', 'Enter your password')}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-10 pr-10"
                            autoComplete="current-password"
                            required
                            data-testid="input-password-signin"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <div className="text-right mt-2">
                          <button
                            type="button"
                            className="text-sm text-primary-dark hover:underline font-medium"
                            onClick={() => setShowForgotPassword(true)}
                            data-testid="link-forgot-password"
                          >
                            {t('website.login.forgotPassword', 'Forgot password?')}
                          </button>
                        </div>
                      </div>

                      {isCaptchaEnabled && VITE_RECAPTCHA_SITE_KEY && (
                        <div className="w-full flex justify-center my-3 max-w-full overflow-hidden">

                          <div className="transform scale-85 sm:scale-100 origin-center h-[78px] flex items-center">
                            <ReCAPTCHA
                              ref={recaptchaRef}
                              sitekey={VITE_RECAPTCHA_SITE_KEY}
                              onChange={(token) => setCaptchaToken(token)}
                            />

                          </div>
                        </div>
                      )}
                      <Button
                        type="submit"
                        className="w-full bg-primary-gradient hover:bg-primary-gradient "
                        disabled={isLoading}
                        data-testid="button-signin"
                      >
                        {isLoading ? t('website.login.signingIn', 'Signing in...') : t('website.login.signInButton', 'Sign In')}

                      </Button>
                      <p className="text-center text-sm text-muted-foreground">
                        {t('website.login.noAccount', "Don't have an account?")}
                        <button
                          type="button"
                          className="text-primary hover:underline font-medium"
                          onClick={() => {
                            setAuthTab('signup');
                            resetForms();
                          }}
                          data-testid="link-goto-signup"
                        >
                          {t('website.login.signup', 'Sign up')}
                        </button>
                      </p>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {forgotStep === 'email' ? t('website.login.resetPassword', 'Reset Password') : t('website.login.setNewPassword', 'Set New Password')}
                    </CardTitle>
                    <CardDescription>
                      {forgotStep === 'email'
                        ? t('website.login.enterEmailReset', 'Enter your email to receive a reset code')
                        : t('website.login.enterCodePassword', `Enter the code sent to ${email} and your new password`)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {forgotStep === 'email' ? (
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                          <label htmlFor="email-forgot" className="text-sm font-medium mb-2 block">
                            Email
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="email-forgot"
                              type="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-10"
                              autoComplete="email"
                              required
                              data-testid="input-email-forgot"
                            />
                          </div>
                        </div>
                        <Button
                          type="submit"
                          className="w-full bg-primary-gradient"
                          disabled={isLoading}
                          data-testid="button-forgot-submit"
                        >
                          {isLoading ? t('website.login.sending', 'Sending...') : t('website.login.sendResetCode', 'Send Reset Code')}
                        </Button>
                        <p className="text-center text-sm text-muted-foreground">
                          {t("website.login.rememberPassword", "Remember your password?")}
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium"
                            onClick={() => {
                              setShowForgotPassword(false);
                              resetForms();
                            }}
                            data-testid="link-back-signin"
                          >
                            {t("website.login.signInButtonSign", "Sign in")}
                          </button>
                        </p>
                      </form>
                    ) : (
                      <form onSubmit={handleResetPassword} className="space-y-4">
                        <div>
                          <label htmlFor="reset-otp" className="text-sm font-medium mb-2 block">
                            {t('website.login.resetCode', 'Reset Code')}
                          </label>
                          <Input
                            id="reset-otp"
                            type="text"
                            placeholder="Enter 6-digit code"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            className="text-center text-lg tracking-widest"
                            autoComplete="one-time-code"
                            required
                            data-testid="input-reset-otp"
                          />
                        </div>
                        <div>
                          <label htmlFor="new-password" className="text-sm font-medium mb-2 block">
                            {t('website.login.newPassword', 'New Password')}
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="new-password"
                              type={showNewPassword ? 'text' : 'password'}
                              placeholder="Min 8 characters"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="pl-10 pr-10"
                              autoComplete="new-password"
                              required
                              data-testid="input-new-password"
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              data-testid="button-toggle-new-password"
                            >
                              {showNewPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor="confirm-password-reset"
                            className="text-sm font-medium mb-2 block"
                          >
                            {t('website.login.confirmPassword', 'Confirm Password')}
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="confirm-password-reset"
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="Confirm your new password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="pl-10 pr-10"
                              autoComplete="new-password"
                              required
                              data-testid="input-confirm-password-reset"
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              data-testid="button-toggle-confirm-password-reset"
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                        <Button
                          type="submit"
                          className="w-full bg-primary-gradient"
                          disabled={isLoading}
                          data-testid="button-reset-password"
                        >
                          {isLoading ? 'Resetting...' : 'Reset Password'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setForgotStep('email')}
                          data-testid="button-back-forgot"
                        >
                          Use different email
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Sign Up - OTP then Name/Password */}
            <TabsContent value="signup">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {signupStep === 'email' && t('website.login.createAccount', 'Create Account')}
                    {signupStep === 'otp' && 'Verify Email'}
                    {signupStep === 'details' && 'Complete Setup'}
                  </CardTitle>
                  <CardDescription>
                    {signupStep === 'email' && t('website.login.enterEmailStart', 'Enter your email to get started')}
                    {signupStep === 'otp' && `Enter the code sent to ${email}`}
                    {signupStep === 'details' && 'Enter your name and create a password'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {signupStep === 'email' && (
                    <form onSubmit={handleSendSignupOTP} className="space-y-4">
                      <div>
                        <label htmlFor="email-signup" className="text-sm font-medium mb-2 block">
                          Email
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="email-signup"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-10"
                            autoComplete="email"
                            required
                            data-testid="input-email-signup"
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-primary-gradient"
                        disabled={isLoading}
                        data-testid="button-send-signup-otp"
                      >
                        {isLoading ? 'Sending...' : 'Continue'}
                      </Button>
                      <p className="text-center text-sm text-muted-foreground">
                        {t("website.checkout.haveAccount", "Already have an account?")}
                        <button
                          type="button"
                          className="text-primary hover:underline font-medium"
                          onClick={() => {
                            setAuthTab('signin');
                            resetForms();
                          }}
                          data-testid="link-goto-signin"
                        >
                          {t('website.login.signin', 'Sign in')}
                        </button>
                      </p>
                    </form>
                  )}

                  {signupStep === 'otp' && (
                    <form onSubmit={handleVerifySignupOTP} className="space-y-4">
                      <div>
                        <label htmlFor="otp-signup" className="text-sm font-medium mb-2 block">
                          Verification Code
                        </label>
                        <Input
                          id="otp-signup"
                          type="text"
                          placeholder="Enter 6-digit code"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          maxLength={6}
                          className="text-center text-lg tracking-widest"
                          autoComplete="one-time-code"
                          required
                          data-testid="input-otp-signup"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-primary-gradient"
                        disabled={isLoading}
                        data-testid="button-verify-signup-otp"
                      >
                        {isLoading ? 'Verifying...' : 'Verify Email'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setSignupStep('email')}
                        data-testid="button-back-signup-email"
                      >
                        Use different email
                      </Button>
                    </form>
                  )}

                  {signupStep === 'details' && (
                    <form onSubmit={handleCompleteSignup} className="space-y-4">
                      <div>
                        <label htmlFor="name-signup" className="text-sm font-medium mb-2 block">
                          Full Name
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="name-signup"
                            type="text"
                            placeholder="John Doe"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="pl-10"
                            autoComplete="name"
                            required
                            data-testid="input-name-signup"
                          />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="password-signup" className="text-sm font-medium mb-2 block">
                          Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="password-signup"
                            type={showNewPassword ? 'text' : 'password'}
                            placeholder="Min 8 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="pl-10 pr-10"
                            autoComplete="new-password"
                            required
                            data-testid="input-password-signup"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            data-testid="button-toggle-password-signup"
                          >
                            {showNewPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="confirm-password-signup"
                          className="text-sm font-medium mb-2 block"
                        >
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="confirm-password-signup"
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Confirm your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="pl-10 pr-10"
                            autoComplete="new-password"
                            required
                            data-testid="input-confirm-password-signup"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            data-testid="button-toggle-confirm-password"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-primary-gradient"
                        disabled={isLoading}
                        data-testid="button-complete-signup"
                      >
                        {isLoading ? 'Creating Account...' : 'Create Account'}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>




          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">
              {t('website.login.orContinue', 'OR CONTINUE WITH')}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg"
              className="h-5 w-5 mr-2" loading="lazy" />
            {t('website.login.continueGoogle', 'Continue with Google')}
          </Button>


          <p className="text-center text-sm text-muted-foreground mt-6">
            {t('website.checkout.termsAgreement', 'By continuing, you agree to our')}{' '}
            <Link href="/pages/terms-and-condition">
              <span className="text-primary hover:underline cursor-pointer">Terms of Service</span>
            </Link>{' '}
            and{' '}
            <Link href="/pages/privacy-policy">
              <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
