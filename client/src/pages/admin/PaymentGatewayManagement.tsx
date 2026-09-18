import { useContext, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Edit2,
  Trash2,
  CreditCard,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "@/contexts/TranslationContext";

interface PaymentGateway {
  id: string;
  provider: "stripe" | "razorpay" | "paypal" | "paystack" | "powertranz" | "flutterwave" | "yookassa" | "midtrans";
  displayName: string;
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  isEnabled: boolean;
  createdAt: string;
  config: {
    mode?: "test" | "live" | string;
    merchantId?: string;
    [key: string]: any;
  };
  supportedCurrencies?: {
    currencyId: string;
  }[];
}

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isEnabled: boolean;
}


const PROVIDERS = [
  { value: "stripe", label: "Stripe" },
  { value: "razorpay", label: "Razorpay" },
  { value: "paypal", label: "PayPal" },
  { value: "paystack", label: "Paystack" },
  { value: "powertranz", label: "Powertranz" },
  { value: "flutterwave", label: "Flutterwave" },
  { value: "yookassa", label: "YooKassa" },
  { value: "midtrans", label: "Midtrans" },
];

export default function PaymentGatewayManagement() {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentGateway | null>(null);
  const { t } = useTranslation()

  const [form, setForm] = useState({
    provider: "",
    displayName: "",
    publicKey: "",
    secretKey: "",
    webhookSecret: "",
    isEnabled: true,
    config: {
      mode: "test",
    },
    supportedCurrencies: [] as string[],
  });

  /* ================= FETCH ================= */
  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/payment-gateways"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/payment-gateways");
      return res.json();
    },
  });

  const gateways: PaymentGateway[] = data?.data || [];

  /* ================= MUTATIONS ================= */

  // const saveMutation = useMutation({
  //   mutationFn: async () => {
  //     const method = editing ? "PUT" : "POST";
  //     const url = editing
  //       ? `/api/admin/payment-gateways/${editing.id}`
  //       : "/api/admin/payment-gateways";

  //     return apiRequest(method, url, form);
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-gateways"] });
  //     toast({ title: "Success", description: "Payment gateway saved" });
  //     resetForm();
  //   },
  //   onError: (err: any) => {
  //     toast({
  //       title: "Error",
  //       description: err.message || "Failed to save gateway",
  //       variant: "destructive",
  //     });
  //   },
  // });


  const saveMutation = useMutation({
    mutationFn: async () => {
      const method = editing ? "PUT" : "POST";
      const url = editing
        ? `/api/admin/payment-gateways/${editing.id}`
        : "/api/admin/payment-gateways";

      // 🔥 FIX: backend-compatible payload
      const payload = {
        ...form,
        supportedCurrencies: form.supportedCurrencies.map((id) => ({
          currencyId: id,
        })),
      };

      return apiRequest(method, url, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/payment-gateways"],
      });
      toast({ title: "Success", description: "Payment gateway saved" });
      resetForm();
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to save gateway",
        variant: "destructive",
      });
    },
  });


  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/admin/payment-gateways/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-gateways"] });
      toast({ title: "Deleted", description: "Gateway removed" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/payment-gateways/${id}/status`, {
        isEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-gateways"] });
    },
  });

  const toggleModeMutation = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: string }) =>
      apiRequest("PUT", `/api/admin/payment-gateways/${id}`, {
        config: { mode }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-gateways"] });
      toast({ title: "Success", description: "Gateway mode updated" });
    },
  });



  // currencies list
  const { data: currencyRes, isLoading: currencyLoading } = useQuery({
    queryKey: ["/api/admin/currencies"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/currencies");
      return res.json();
    },
    enabled: open, // dialog open hone pe load
  });


  // console.log("currencyRes:", currencyRes);



  const currencies: Currency[] =
    currencyRes?.data?.filter((c: Currency) => c.isEnabled) || [];

  // console.log("currencies:", currencies);

  /* ================= HELPERS ================= */

  const resetForm = () => {
    setEditing(null);
    setOpen(false);
    setForm({
      provider: "",
      displayName: "",
      publicKey: "",
      secretKey: "",
      webhookSecret: "",
      isEnabled: true,
      config: {
        mode: "test",
      },
      supportedCurrencies: [] as string[],
    });
  };

  const openEdit = (g: PaymentGateway) => {
    setEditing(g);
    setForm({
      provider: g.provider,
      displayName: g.displayName,
      publicKey: g.publicKey || "",
      secretKey: g.secretKey || "",
      webhookSecret: g.webhookSecret || "",
      isEnabled: g.isEnabled,
      config: { mode: "test", ...(g.config || {}) },
      supportedCurrencies: g.supportedCurrencies?.map((c: any) => c.currencyId) || [],
    });
    setOpen(true);
  };

  /* ================= UI ================= */

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {/* Reduced icon size slightly for mobile to prevent title crowding */}
            <CreditCard className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {t('adminPanel.admin.paymentGateways.title', 'Payment Gateways')}
            </h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground ml-9 sm:ml-0">
            {t(
              'adminPanel.admin.paymentGateways.description',
              'Configure payment providers and options'
            )}
          </p>
        </div>

        <Button
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto h-11 sm:h-10 gap-2 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          {t('adminPanel.admin.paymentGateways.addGateway', 'Add Gateway')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('adminPanel.admin.paymentGateways.configuredGateways', 'Configured Gateways')}</CardTitle>
          <CardDescription>
            {t(
              'adminPanel.admin.paymentGateways.configuredGatewaysDesc',
              'Each row represents one user-visible payment option'
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin h-6 w-6" />
            </div>
          ) : gateways.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              {t(
                'adminPanel.admin.paymentGateways.noGateways',
                'No payment gateways added'
              )}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('adminPanel.admin.paymentGateways.provider', 'Provider')}</TableHead>
                  <TableHead>{t('adminPanel.admin.paymentGateways.displayName', 'Display Name')}</TableHead>
                  <TableHead>{t('adminPanel.admin.paymentGateways.mode', 'Mode')}</TableHead>
                  <TableHead>{t('adminPanel.admin.paymentGateways.status', 'Status')}</TableHead>
                  <TableHead className="text-right">{t('adminPanel.admin.paymentGateways.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateways.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="capitalize">{g.provider}</TableCell>
                    <TableCell>{g.displayName}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="p-0 h-auto hover:bg-transparent"
                        onClick={() => {
                          const currentMode = (g.config as any)?.mode || 'test';
                          const newMode = currentMode === 'live' ? 'test' : 'live';
                          toggleModeMutation.mutate({ id: g.id, mode: newMode });
                        }}
                      >
                        <span className={`px-2 py-1 rounded text-xs font-medium ${(g.config as any)?.mode === 'live'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                          {(g.config as any)?.mode === 'live' ? 'Live' : 'Test'}
                        </span>
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={g.isEnabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            id: g.id,
                            isEnabled: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(g)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(g.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ================= DIALOG ================= */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('adminPanel.admin.paymentGateways.editGateway', 'Edit Gateway') : t('adminPanel.admin.paymentGateways.addGateway', 'Add Gateway')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('adminPanel.admin.paymentGateways.provider', 'Provider')}</Label>
              <Select
                value={form.provider}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    provider: v,
                    displayName: form.displayName || PROVIDERS.find((p) => p.value === v)?.label || "",
                  })
                }
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t(
                    'adminPanel.admin.paymentGateways.selectProvider',
                    'Select provider'
                  )} />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('adminPanel.admin.paymentGateways.displayName', 'Display Name')}</Label>
              <Input
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
                placeholder={t(
                  'adminPanel.admin.paymentGateways.displayNamePlaceholder',
                  'Card / UPI / Wallet'
                )}
              />
            </div>

            {form.provider === 'midtrans' && (
              <div>
                <Label>Merchant ID</Label>
                <Input
                  value={form.config?.merchantId || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      config: { ...form.config, merchantId: e.target.value },
                    })
                  }
                  placeholder="e.g. G123456789"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your Midtrans Merchant ID from your Midtrans MAP portal.
                </p>
              </div>
            )}

            <div>
              <Label>
                {form.provider === 'midtrans'
                  ? 'Client Key'
                  : t('adminPanel.admin.paymentGateways.publicKey', 'Public Key')}
              </Label>
              <Input
                value={form.publicKey}
                onChange={(e) =>
                  setForm({ ...form, publicKey: e.target.value })
                }
                placeholder={form.provider === 'midtrans' ? 'SB-Mid-client-...' : ''}
              />
              {form.provider === 'midtrans' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Used by Snap.js on the frontend checkout window.
                </p>
              )}
            </div>

            <div>
              <Label>
                {form.provider === 'midtrans'
                  ? 'Server Key'
                  : t('adminPanel.admin.paymentGateways.secretKey', 'Secret Key')}
              </Label>
              <Input
                type="password"
                value={form.secretKey}
                onChange={(e) =>
                  setForm({ ...form, secretKey: e.target.value })
                }
                placeholder={form.provider === 'midtrans' ? 'SB-Mid-server-...' : ''}
              />
              {form.provider === 'midtrans' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Used securely on backend to initialize Snap transactions and verify signatures.
                </p>
              )}
            </div>

            {form.provider === 'midtrans' ? (
              <div className="rounded-md border border-blue-200 bg-blue-50/60 dark:bg-blue-950/40 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                <p className="font-semibold">Midtrans Notification / Webhook URL:</p>
                <code className="block bg-background px-2 py-1.5 rounded border font-mono select-all text-[11px] break-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/payments/midtrans/notification` : '/api/payments/midtrans/notification'}
                </code>
                <p className="text-muted-foreground text-[11px]">
                  Copy and paste this URL into Midtrans MAP &rarr; Settings &rarr; Configuration &rarr; Payment Notification URL.
                </p>
              </div>
            ) : (
              <div>
                <Label>{t('adminPanel.admin.paymentGateways.webhookSecret', 'Webhook Secret')}</Label>
                <Input
                  type="password"
                  value={form.webhookSecret}
                  onChange={(e) =>
                    setForm({ ...form, webhookSecret: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
            )}

            <div>
              <Label>{t('adminPanel.admin.paymentGateways.mode', 'Gateway Mode')}</Label>
              <Select
                value={form.config?.mode || "test"}
                onValueChange={(v) => setForm({
                  ...form,
                  config: { ...form.config, mode: v }
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test (Sandbox)</SelectItem>
                  <SelectItem value="live">Live (Production)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Set to "Live" when you are ready to accept real payments.
              </p>
            </div>

            <div>
              <Label>{t('adminPanel.admin.paymentGateways.supportedCurrencies', 'Supported Currencies')}</Label>

              {currencyLoading ? (
                <p className="text-sm text-muted-foreground mt-2">
                  {t(
                    'adminPanel.admin.paymentGateways.loadingCurrencies',
                    'Loading currencies...'
                  )}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {currencies.map((c) => {
                    const checked = form.supportedCurrencies.includes(c.id);

                    return (
                      <Button
                        key={c.id}
                        type="button"
                        size="sm"
                        variant={checked ? "default" : "outline"}
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            supportedCurrencies: checked
                              ? prev.supportedCurrencies.filter((x) => x !== c.id)
                              : [...prev.supportedCurrencies, c.id],
                          }));
                        }}
                      >
                        {c.symbol} {c.code}
                      </Button>
                    );
                  })}
                </div>
              )}

              {form.supportedCurrencies.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    'adminPanel.admin.paymentGateways.selectCurrency',
                    'Select at least one currency'
                  )}
                </p>
              )}
            </div>


            <div className="flex items-center gap-2">
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(v) =>
                  setForm({ ...form, isEnabled: v })
                }
              />
              <span className="text-sm">
                {form.isEnabled ? t('adminPanel.admin.paymentGateways.enabled', 'Enabled') : t('adminPanel.admin.paymentGateways.disabled', 'Disabled')}
              </span>
            </div>


          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              {t('adminPanel.admin.paymentGateways.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (!form.provider) {
                  toast({
                    title: "Validation Error",
                    description: "Please select a provider",
                    variant: "destructive"
                  });
                  return;
                }
                if (!form.displayName.trim()) {
                  toast({
                    title: "Validation Error",
                    description: "Please enter a display name",
                    variant: "destructive"
                  });
                  return;
                }
                if (form.supportedCurrencies.length === 0) {
                  toast({
                    title: "Validation Error",
                    description: "Please select at least one supported currency",
                    variant: "destructive"
                  });
                  return;
                }
                saveMutation.mutate();
              }}
            >
              {t('adminPanel.admin.paymentGateways.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
