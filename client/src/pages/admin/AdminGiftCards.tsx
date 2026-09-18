import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Plus,
  Search,
  Gift,
  DollarSign,
  Eye,
  Copy,
  CreditCard,
  Users,
  TrendingUp,
  Send,
} from 'lucide-react';
import type { GiftCard, GiftCardTransaction } from '@shared/schema';
import { useTranslation } from '@/contexts/TranslationContext';

interface GiftCardFormData {
  amount: string;
  currency: string;
  recipientEmail: string;
  recipientName: string;
  message: string;
  theme: string;
  expiresAt: string;
}

const initialFormData: GiftCardFormData = {
  amount: '',
  currency: 'USD',
  recipientEmail: '',
  recipientName: '',
  message: '',
  theme: 'default',
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
};

const themes = [
  { value: 'default', label: 'Default' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'travel', label: 'Travel' },
  { value: 'thank-you', label: 'Thank You' },
  { value: 'celebration', label: 'Celebration' },
];

const presetAmounts = [10, 25, 50, 100, 200];

function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'GC-';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 3) result += '-';
  }
  return result;
}

export default function AdminGiftCards() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedGiftCard, setSelectedGiftCard] = useState<GiftCard | null>(null);
  const [formData, setFormData] = useState<GiftCardFormData>(initialFormData);
  const [bulkCount, setBulkCount] = useState('10');
  const [bulkAmount, setBulkAmount] = useState('25');
  const { t } = useTranslation();

  const { data: giftCardsData, isLoading } = useQuery<{
    giftCards: GiftCard[];
    statistics: {
      totalCards: number;
      activeCards: number;
      totalValue: number;
      redeemedValue: number;
      pendingDelivery: number;
    };
  }>({
    queryKey: ['/api/admin/gift-cards'],
  });

  const { data: transactionsData } = useQuery<{ transactions: GiftCardTransaction[] }>({
    queryKey: ['/api/admin/gift-cards', selectedGiftCard?.id, 'transactions'],
    enabled: !!selectedGiftCard,
  });

  const createMutation = useMutation({
    mutationFn: async (data: GiftCardFormData) => {
      return apiRequest('POST', '/api/admin/gift-cards', {
        code: generateGiftCardCode(),
        amount: parseFloat(data.amount),
        balance: parseFloat(data.amount),
        currency: data.currency,
        recipientEmail: data.recipientEmail || null,
        recipientName: data.recipientName || null,
        message: data.message || null,
        theme: data.theme,
        expiresAt: new Date(data.expiresAt).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gift-cards'] });
      setIsCreateDialogOpen(false);
      setFormData(initialFormData);
      toast({ title: 'Gift card created successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating gift card',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async ({ count, amount }: { count: number; amount: number }) => {
      const res = await apiRequest('POST', '/api/admin/gift-cards/bulk', { count, amount });
      return res.json() as Promise<{ created: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gift-cards'] });
      setIsBulkDialogOpen(false);
      toast({ title: `${data.created} gift cards created successfully` });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating gift cards',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const sendDeliveryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/admin/gift-cards/${id}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gift-cards'] });
      toast({ title: 'Gift card delivery email sent' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error sending email', description: error.message, variant: 'destructive' });
    },
  });

  const giftCards = giftCardsData?.giftCards || [];
  const statistics = giftCardsData?.statistics || {
    totalCards: 0,
    activeCards: 0,
    totalValue: 0,
    redeemedValue: 0,
    pendingDelivery: 0,
  };

  const filteredGiftCards = giftCards.filter((card: GiftCard) => {
    const matchesSearch =
      card.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (card.recipientEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (card.recipientName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === 'all' || card.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: t("adminPanel.admin.giftCards.table.copySuccess", "Code copied to clipboard") });
  };

  const handleView = (card: GiftCard) => {
    setSelectedGiftCard(card);
    setIsViewDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{t("adminPanel.admin.giftCards.table.active", "Active")}</Badge>;
      case 'used':
        return <Badge className="bg-teal-500/10 text-teal-500 border-teal-500/20">{t("adminPanel.admin.giftCards.table.used", "Used")}</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">{t("adminPanel.admin.giftCards.table.expired", "Expired")}</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">{t("adminPanel.admin.giftCards.table.cancelled", "Cancelled")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getThemeBadge = (theme: string) => {
    const themeLabel = themes.find((t) => t.value === theme)?.label || theme;
    return <Badge variant="outline">{themeLabel}</Badge>;
  };

  return (
    <div className="space-y-6 dark:text-white">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
            {t("adminPanel.admin.giftCards.title", "Gift Card Management")}
          </h1>
          <p className="text-muted-foreground"> {t("adminPanel.admin.giftCards.description", "Create and manage gift cards")}</p>
        </div>


        <div className="flex flex-col sm:flex-row items-start md:items-center gap-2 w-full md:w-auto">
          <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
            <DialogTrigger asChild>
              {/* 3. Added w-full md:w-auto to buttons for better mobile tap targets */}
              <Button variant="outline" className="w-full md:w-auto" data-testid="button-bulk-create">
                <Users className="w-4 h-4 mr-2" />
                {t("adminPanel.admin.giftCards.bulkDialog.title", "Bulk Generate")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("adminPanel.admin.giftCards.bulkDialog.title", "Bulk Generate Gift Cards")}</DialogTitle>
                <DialogDescription>
                  {t("adminPanel.admin.giftCards.bulkDialog.description", "Create multiple gift cards at once for promotions")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("adminPanel.admin.giftCards.bulkDialog.numberOfCards", "Number of Cards")}</Label>
                  <Input
                    type="number"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                    placeholder="10"
                    data-testid="input-bulk-count"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("adminPanel.admin.giftCards.bulkDialog.amountPerCard", "Amount per Card ($)")}</Label>
                  <Input
                    type="number"
                    value={bulkAmount}
                    onChange={(e) => setBulkAmount(e.target.value)}
                    placeholder="25"
                    data-testid="input-bulk-amount"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() =>
                    bulkCreateMutation.mutate({
                      count: parseInt(bulkCount),
                      amount: parseFloat(bulkAmount),
                    })
                  }
                  disabled={bulkCreateMutation.isPending || !bulkCount || !bulkAmount}
                  data-testid="button-submit-bulk"
                >
                  {bulkCreateMutation.isPending ? t("adminPanel.admin.giftCards.bulkDialog.generating", "Generating...")
                    : t("adminPanel.admin.giftCards.bulkDialog.generateButton", "Generate {count} Cards").replace("{count}", bulkCount)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full md:w-auto" data-testid="button-create-gift-card">
                <Plus className="w-4 h-4 mr-2" />
                {t("adminPanel.admin.giftCards.createDialog.createButton", "Create Gift Card")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("adminPanel.admin.giftCards.createDialog.title", "Create Gift Card")}</DialogTitle>
                <DialogDescription>
                  {t("adminPanel.admin.giftCards.createDialog.description", "Create a new gift card for a customer or promotion")}
                </DialogDescription>
              </DialogHeader>
              <GiftCardForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={() => createMutation.mutate(formData)}
                isSubmitting={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.giftCards.cards.total", "Total Cards")}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-cards">
              {statistics.totalCards}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.giftCards.cards.active", "Active Cards")}</CardTitle>
            <Gift className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-cards">
              {statistics.activeCards}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.giftCards.cards.totalValue", "Total Value")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-value">
              ${statistics.totalValue.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.giftCards.cards.redeemed", "Redeemed")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-redeemed-value">
              ${statistics.redeemedValue.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.giftCards.cards.pendingDelivery", "Pending Delivery")}</CardTitle>
            <Send className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600" data-testid="text-pending-delivery">
              {statistics.pendingDelivery}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle> {t("adminPanel.admin.giftCards.cards.title", "Gift Cards")}</CardTitle>
          <div className="flex items-center gap-4 flex-wrap mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("adminPanel.admin.giftCards.search.placeholder", "Search by code, email, or name...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-gift-cards"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder={t("adminPanel.admin.giftCards.filter.status", "Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminPanel.admin.giftCards.filter.all", "All Status")}</SelectItem>
                <SelectItem value="active">{t("adminPanel.admin.giftCards.filter.active", "Active")}</SelectItem>
                <SelectItem value="used">{t("adminPanel.admin.giftCards.filter.used", "Used")}</SelectItem>
                <SelectItem value="expired">{t("adminPanel.admin.giftCards.filter.expired", "Expired")}</SelectItem>
                <SelectItem value="cancelled">{t("adminPanel.admin.giftCards.filter.cancelled", "Cancelled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("adminPanel.admin.giftCards.loadingGiftCards", "Loading gift cards...")}</div>
          ) : filteredGiftCards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("adminPanel.admin.giftCards.noGiftCardsFound", "No gift cards found")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.giftCards.table.code", "Code")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.giftCards.table.amountBalance", "Amount / Balance")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.giftCards.table.recipient", "Recipient")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.giftCards.table.theme", "Theme")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.giftCards.table.expires", "Expires")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.giftCards.table.status", "Status")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.giftCards.table.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGiftCards.map((card: GiftCard, index: number) => (
                    <tr key={card.id} className="border-b" data-testid={`row-gift-card-${index}`}>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                            {card.code}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleCopyCode(card.code)}
                            data-testid={`button-copy-${index}`}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm">
                          <span className="font-medium">${card.balance}</span>
                          <span className="text-muted-foreground"> / ${card.amount}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {card.recipientEmail ? (
                          <div className="text-sm">
                            <div>{card.recipientName || 'N/A'}</div>
                            <div className="text-muted-foreground">{card.recipientEmail}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t("adminPanel.admin.giftCards.table.notAssigned", "Not assigned")}</span>
                        )}
                      </td>
                      <td className="py-4 px-4">{getThemeBadge(card.theme || 'default')}</td>
                      <td className="py-4 px-4">
                        {card.expiresAt ? format(new Date(card.expiresAt), 'MMM d, yyyy') : 'Never'}
                      </td>
                      <td className="py-4 px-4">{getStatusBadge(card.status)}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleView(card)}
                            data-testid={`button-view-${index}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {card.recipientEmail && !card.deliverySent && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => sendDeliveryMutation.mutate(card.id)}
                              disabled={sendDeliveryMutation.isPending}
                              title={t("adminPanel.admin.giftCards.table.sendDelivery", "Send delivery email")}
                              data-testid={`button-send-${index}`}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("adminPanel.admin.giftCards.viewDialog.title", "Gift Card Details")}</DialogTitle>
          </DialogHeader>
          {selectedGiftCard && (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">{t("adminPanel.admin.giftCards.viewDialog.tabs.details", "Details")}</TabsTrigger>
                <TabsTrigger value="transactions">{t("adminPanel.admin.giftCards.viewDialog.tabs.transactions", "Transactions")}</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">{t("adminPanel.admin.giftCards.table.code", "Code")}</Label>
                    <p className="font-mono">{selectedGiftCard.code}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p>{getStatusBadge(selectedGiftCard.status)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Original Amount</Label>
                    <p>${selectedGiftCard.amount}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Current Balance</Label>
                    <p className="font-semibold text-green-600">${selectedGiftCard.balance}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Recipient</Label>
                    <p>{selectedGiftCard.recipientName || 'N/A'}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedGiftCard.recipientEmail || 'Not assigned'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Theme</Label>
                    <p>{getThemeBadge(selectedGiftCard.theme || 'default')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Created</Label>
                    <p>{format(new Date(selectedGiftCard.createdAt), 'PPP')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Expires</Label>
                    <p>
                      {selectedGiftCard.expiresAt
                        ? format(new Date(selectedGiftCard.expiresAt), 'PPP')
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Delivery Status</Label>
                    <p>{selectedGiftCard.deliverySent ? 'Sent' : 'Pending'}</p>
                  </div>
                  {selectedGiftCard.redeemedAt && (
                    <div>
                      <Label className="text-muted-foreground">First Redeemed</Label>
                      <p>{format(new Date(selectedGiftCard.redeemedAt), 'PPP')}</p>
                    </div>
                  )}
                </div>
                {selectedGiftCard.message && (
                  <div>
                    <Label className="text-muted-foreground">Personal Message</Label>
                    <p className="bg-muted p-3 rounded-md italic">"{selectedGiftCard.message}"</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="transactions" className="mt-4">
                {transactionsData?.transactions && transactionsData.transactions.length > 0 ? (
                  <div className="space-y-2">
                    {transactionsData.transactions.map((tx: GiftCardTransaction) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                      >
                        <div>
                          <p className="text-sm font-medium">Order #{tx.orderId?.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.usedAt), 'PPP p')}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-red-500">
                            -${tx.amountUsed}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            Balance: ${tx.balanceAfter}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">{t("adminPanel.admin.giftCards.viewDialog.noTransactions", "No transactions yet")}</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GiftCardForm({
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
}: {
  formData: GiftCardFormData;
  setFormData: (data: GiftCardFormData) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("adminPanel.admin.giftCards.createDialog.amount", "Amount ($)")}</Label>
        <div className="flex gap-2 flex-wrap">
          {presetAmounts.map((amount) => (
            <Button
              key={amount}
              type="button"
              variant={formData.amount === amount.toString() ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, amount: amount.toString() })}
              data-testid={`button-amount-${amount}`}
            >
              ${amount}
            </Button>
          ))}
        </div>
        <Input
          type="number"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          placeholder={t("adminPanel.admin.giftCards.createDialog.customAmount", "Custom amount")}
          data-testid="input-custom-amount"
        />
      </div>

      <div className="space-y-2">
        <Label> {t("adminPanel.admin.giftCards.createDialog.theme", "Theme")}</Label>
        <Select
          value={formData.theme}
          onValueChange={(value) => setFormData({ ...formData, theme: value })}
        >
          <SelectTrigger data-testid="select-theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {themes.map((theme) => (
              <SelectItem key={theme.value} value={theme.value}>
                {theme.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("adminPanel.admin.giftCards.createDialog.recipientName", "Recipient Name (optional)")}</Label>
          <Input
            value={formData.recipientName}
            onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
            placeholder="John Doe"
            data-testid="input-recipient-name"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("adminPanel.admin.giftCards.createDialog.recipientName", "Recipient Email (optional)")}</Label>
          <Input
            type="email"
            value={formData.recipientEmail}
            onChange={(e) => setFormData({ ...formData, recipientEmail: e.target.value })}
            placeholder="john@example.com"
            data-testid="input-recipient-email"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("adminPanel.admin.giftCards.createDialog.personalMessage", "Personal Message (optional)")}</Label>
        <Textarea
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          placeholder={t("adminPanel.admin.giftCards.createDialog.messagePlaceholder", "Enjoy your eSIM gift card!")}
          data-testid="input-message"
        />
      </div>

      <div className="space-y-2">
        <Label>{t("adminPanel.admin.giftCards.createDialog.expiresOn", "Expires On")}</Label>
        <Input
          type="date"
          value={formData.expiresAt}
          onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
          data-testid="input-expires-at"
        />
      </div>

      <DialogFooter>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !formData.amount}
          data-testid="button-submit-gift-card"
        >
          {isSubmitting ? t("adminPanel.admin.giftCards.createDialog.creating", "Creating...")
            : t("adminPanel.admin.giftCards.createDialog.createButton", "Create Gift Card")}
        </Button>
      </DialogFooter>
    </div>
  );
}
