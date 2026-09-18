import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  Percent,
  DollarSign,
  Trash2,
  Edit,
  Eye,
  Copy,
  BarChart3,
} from 'lucide-react';
import type { VoucherCode, VoucherUsage } from '@shared/schema';
import { useTranslation } from '@/contexts/TranslationContext';

interface VoucherFormData {
  code: string;
  type: 'percentage' | 'fixed';
  value: string;
  description: string;
  minPurchaseAmount: string;
  maxDiscountAmount: string;
  maxUses: string;
  perUserLimit: string;
  validFrom: string;
  validUntil: string;
  targetCountries: string[];
  targetRegions: string[];
  targetPackages: string[];
  firstTimeOnly: boolean;
  isStackable: boolean;
  status: string;
}

const initialFormData: VoucherFormData = {
  code: '',
  type: 'percentage',
  value: '',
  description: '',
  minPurchaseAmount: '0',
  maxDiscountAmount: '',
  maxUses: '',
  perUserLimit: '1',
  validFrom: new Date().toISOString().slice(0, 16),
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  targetCountries: [],
  targetRegions: [],
  targetPackages: [],
  firstTimeOnly: false,
  isStackable: false,
  status: 'active',
};

function generateRandomCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function AdminVouchers() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherCode | null>(null);
  const [formData, setFormData] = useState<VoucherFormData>(initialFormData);
  const { t } = useTranslation();

  const { data: vouchersData, isLoading } = useQuery<{
    vouchers: VoucherCode[];
    statistics: {
      totalVouchers: number;
      activeVouchers: number;
      totalUsage: number;
      totalDiscount: number;
    };
  }>({
    queryKey: ['/api/admin/vouchers'],
  });

  const { data: usageData } = useQuery<{ usage: VoucherUsage[] }>({
    queryKey: ['/api/admin/vouchers', selectedVoucher?.id, 'usage'],
    enabled: !!selectedVoucher,
  });

  const createMutation = useMutation({
    mutationFn: async (data: VoucherFormData) => {
      return apiRequest('POST', '/api/admin/vouchers', {
        ...data,
        value: parseFloat(data.value),
        minPurchaseAmount: parseFloat(data.minPurchaseAmount) || 0,
        maxDiscountAmount: data.maxDiscountAmount ? parseFloat(data.maxDiscountAmount) : null,
        maxUses: data.maxUses ? parseInt(data.maxUses) : null,
        perUserLimit: parseInt(data.perUserLimit) || 1,
        validFrom: new Date(data.validFrom).toISOString(),
        validUntil: new Date(data.validUntil).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/vouchers'] });
      setIsCreateDialogOpen(false);
      setFormData(initialFormData);
      toast({ title: 'Voucher created successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating voucher',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VoucherFormData> }) => {
      return apiRequest('PATCH', `/api/admin/vouchers/${id}`, {
        ...data,
        value: data.value ? parseFloat(data.value) : undefined,
        minPurchaseAmount: data.minPurchaseAmount ? parseFloat(data.minPurchaseAmount) : undefined,
        maxDiscountAmount: data.maxDiscountAmount ? parseFloat(data.maxDiscountAmount) : null,
        maxUses: data.maxUses ? parseInt(data.maxUses) : null,
        perUserLimit: data.perUserLimit ? parseInt(data.perUserLimit) : undefined,
        validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/vouchers'] });
      setIsEditDialogOpen(false);
      setSelectedVoucher(null);
      toast({ title: 'Voucher updated successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating voucher',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/admin/vouchers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/vouchers'] });
      toast({ title: 'Voucher deleted successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting voucher',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const vouchers = vouchersData?.vouchers || [];
  const statistics = vouchersData?.statistics || {
    totalVouchers: 0,
    activeVouchers: 0,
    totalUsage: 0,
    totalDiscount: 0,
  };

  const filteredVouchers = vouchers.filter((voucher: VoucherCode) => {
    const matchesSearch =
      voucher.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (voucher.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === 'all' || voucher.status === statusFilter;
    const matchesType = typeFilter === 'all' || voucher.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Code copied to clipboard' });
  };

  const handleEdit = (voucher: VoucherCode) => {
    setSelectedVoucher(voucher);
    setFormData({
      code: voucher.code,
      type: voucher.type as 'percentage' | 'fixed',
      value: voucher.value,
      description: voucher.description || '',
      minPurchaseAmount: voucher.minPurchaseAmount || '0',
      maxDiscountAmount: voucher.maxDiscountAmount || '',
      maxUses: voucher.maxUses?.toString() || '',
      perUserLimit: voucher.perUserLimit?.toString() || '1',
      validFrom: new Date(voucher.validFrom).toISOString().slice(0, 16),
      validUntil: new Date(voucher.validUntil).toISOString().slice(0, 16),
      targetCountries: voucher.targetCountries || [],
      targetRegions: voucher.targetRegions || [],
      targetPackages: voucher.targetPackages || [],
      firstTimeOnly: voucher.firstTimeOnly || false,
      isStackable: voucher.isStackable || false,
      status: voucher.status,
    });
    setIsEditDialogOpen(true);
  };

  const handleView = (voucher: VoucherCode) => {
    setSelectedVoucher(voucher);
    setIsViewDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Inactive</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 dark:text-white">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
            {t("adminPanel.admin.vouchers.title", "Voucher Management")}
          </h1>
          <p className="text-muted-foreground">{t("adminPanel.admin.vouchers.description", "Create and manage discount vouchers")}</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full md:w-auto" data-testid="button-create-voucher">
              <Plus className="w-4 h-4 mr-2" />
              {t("adminPanel.admin.vouchers.createVoucher", "Create Voucher")}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("adminPanel.admin.vouchers.createNew", "Create New Voucher")}</DialogTitle>
              <DialogDescription> {t("adminPanel.admin.vouchers.createDescription", "Create a new discount voucher code")}</DialogDescription>
            </DialogHeader>
            <VoucherForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={() => createMutation.mutate(formData)}
              isSubmitting={createMutation.isPending}
              submitLabel={t("adminPanel.admin.vouchers.createVoucher", "Create Voucher")}
            />
          </DialogContent>
        </Dialog>
      </div>


      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.vouchers.total", "Total Vouchers")}</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-vouchers">
              {statistics.totalVouchers}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.vouchers.active", "Active Vouchers")}</CardTitle>
            <Gift className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-vouchers">
              {statistics.activeVouchers}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">{t("adminPanel.admin.vouchers.totalUsage", "Total Usage")}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-usage">
              {statistics.totalUsage}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium"> {t("adminPanel.admin.vouchers.totalDiscount", "Total Discount Given")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-discount">
              ${statistics.totalDiscount.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminPanel.admin.vouchers.title", "Vouchers")}</CardTitle>
          <div className="flex items-center gap-4 flex-wrap mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t(
                  "adminPanel.admin.vouchers.search",
                  "Search by code or description..."
                )}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-vouchers"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder={t("adminPanel.admin.vouchers.status", "Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"> {t("adminPanel.admin.vouchers.allStatus", "All Status")}</SelectItem>
                <SelectItem value="active"> {t("adminPanel.admin.vouchers.status.active", "Active")}</SelectItem>
                <SelectItem value="inactive">{t("adminPanel.admin.vouchers.status.inactive", "Inactive")}</SelectItem>
                <SelectItem value="expired">{t("adminPanel.admin.vouchers.status.expired", "Expired")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-type-filter">
                <SelectValue placeholder={t("adminPanel.admin.vouchers.type", "Type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminPanel.admin.vouchers.allTypes", "All Types")}</SelectItem>
                <SelectItem value="percentage">{t("adminPanel.admin.vouchers.type.percentage", "Percentage (%)")}</SelectItem>
                <SelectItem value="fixed">{t("adminPanel.admin.vouchers.type.fixed", "Fixed Amount ($)")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("adminPanel.admin.vouchers.loading", "Loading vouchers...")}</div>
          ) : filteredVouchers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("adminPanel.admin.vouchers.noVouchers", "No vouchers found")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.vouchers.table.code", "Code")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.vouchers.table.discount", "Discount")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.vouchers.table.usage", "Usage")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.vouchers.table.validity", "Validity")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.vouchers.table.status", "Status")}</th>
                    <th className="text-left py-3 px-4 font-medium">{t("adminPanel.admin.vouchers.table.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVouchers.map((voucher: VoucherCode, index: number) => (
                    <tr key={voucher.id} className="border-b" data-testid={`row-voucher-${index}`}>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                            {voucher.code}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleCopyCode(voucher.code)}
                            data-testid={`button-copy-${index}`}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        {voucher.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {voucher.description}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          {voucher.type === 'percentage' ? (
                            <>
                              <Percent className="h-4 w-4 text-muted-foreground" />
                              <span>{voucher.value}%</span>
                            </>
                          ) : (
                            <>
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span>${voucher.value}</span>
                            </>
                          )}
                        </div>
                        {voucher.minPurchaseAmount && parseFloat(voucher.minPurchaseAmount) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Min: ${voucher.minPurchaseAmount}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span>{voucher.currentUses}</span>
                        {voucher.maxUses && (
                          <span className="text-muted-foreground"> / {voucher.maxUses}</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm">
                          <div>{format(new Date(voucher.validFrom), 'MMM d, yyyy')}</div>
                          <div className="text-muted-foreground">
                            to {format(new Date(voucher.validUntil), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">{getStatusBadge(voucher.status)}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleView(voucher)}
                            data-testid={`button-view-${index}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(voucher)}
                            data-testid={`button-edit-${index}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(voucher.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Voucher</DialogTitle>
            <DialogDescription>Update voucher details</DialogDescription>
          </DialogHeader>
          <VoucherForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={() =>
              selectedVoucher && updateMutation.mutate({ id: selectedVoucher.id, data: formData })
            }
            isSubmitting={updateMutation.isPending}
            submitLabel="Update Voucher"
            isEdit
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Voucher Details</DialogTitle>
          </DialogHeader>
          {selectedVoucher && (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">{t("adminPanel.admin.vouchers.details", "Details")}</TabsTrigger>
                <TabsTrigger value="usage">{t("adminPanel.admin.vouchers.usageHistory", "Usage History")}</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Code</Label>
                    <p className="font-mono">{selectedVoucher.code}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p>{getStatusBadge(selectedVoucher.status)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Discount</Label>
                    <p>
                      {selectedVoucher.type === 'percentage'
                        ? `${selectedVoucher.value}%`
                        : `$${selectedVoucher.value}`}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Usage</Label>
                    <p>
                      {selectedVoucher.currentUses}{' '}
                      {selectedVoucher.maxUses ? `/ ${selectedVoucher.maxUses}` : ''}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valid From</Label>
                    <p>{format(new Date(selectedVoucher.validFrom), 'PPP')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valid Until</Label>
                    <p>{format(new Date(selectedVoucher.validUntil), 'PPP')}</p>
                  </div>
                  {selectedVoucher.minPurchaseAmount && (
                    <div>
                      <Label className="text-muted-foreground">Minimum Purchase</Label>
                      <p>${selectedVoucher.minPurchaseAmount}</p>
                    </div>
                  )}
                  {selectedVoucher.maxDiscountAmount && (
                    <div>
                      <Label className="text-muted-foreground">Maximum Discount</Label>
                      <p>${selectedVoucher.maxDiscountAmount}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Per User Limit</Label>
                    <p>{selectedVoucher.perUserLimit || 'Unlimited'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">First-time Only</Label>
                    <p>{selectedVoucher.firstTimeOnly ? 'Yes' : 'No'}</p>
                  </div>
                </div>
                {selectedVoucher.description && (
                  <div>
                    <Label className="text-muted-foreground">Description</Label>
                    <p>{selectedVoucher.description}</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="usage" className="mt-4">
                {usageData?.usage && usageData.usage.length > 0 ? (
                  <div className="space-y-2">
                    {usageData.usage.map((usage: VoucherUsage, i: number) => (
                      <div
                        key={usage.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                      >
                        <div>
                          <p className="text-sm font-medium">Order #{usage.orderId?.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(usage.usedAt), 'PPP p')}
                          </p>
                        </div>
                        <Badge variant="outline">${usage.discountAmount}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No usage history</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoucherForm({
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
  submitLabel,
  isEdit = false,
}: {
  formData: VoucherFormData;
  setFormData: (data: VoucherFormData) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitLabel: string;
  isEdit?: boolean;
}) {
  const handleGenerateCode = () => {
    setFormData({ ...formData, code: generateRandomCode() });
  };

  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="code"> {t("adminPanel.admin.vouchers.code", "Voucher Code")}</Label>
          <div className="flex gap-2">
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="SAVE20"
              disabled={isEdit}
              data-testid="input-voucher-code"
            />
            {!isEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateCode}
                data-testid="button-generate-code"
              >
                {t("adminPanel.admin.vouchers.generateCode", "Generate")}
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status"> {t("adminPanel.admin.vouchers.table.status", "Status")}</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger data-testid="select-voucher-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active"> {t("adminPanel.admin.vouchers.status.active", "Active")}</SelectItem>
              <SelectItem value="inactive">{t("adminPanel.admin.vouchers.status.inactive", "Inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="type">{t("adminPanel.admin.vouchers.discountType", "Discount Type")}</Label>
          <Select
            value={formData.type}
            onValueChange={(value) =>
              setFormData({ ...formData, type: value as 'percentage' | 'fixed' })
            }
          >
            <SelectTrigger data-testid="select-discount-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">{t("adminPanel.admin.vouchers.type.percentage", "Percentage (%)")}
              </SelectItem>
              <SelectItem value="fixed">  {t("adminPanel.admin.vouchers.type.fixed", "Fixed Amount ($)")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="value">{t("adminPanel.admin.vouchers.discountValue", "Discount Value")}</Label>
          <Input
            id="value"
            type="number"
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
            placeholder={formData.type === 'percentage' ? '20' : '10.00'}
            data-testid="input-discount-value"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("adminPanel.admin.vouchers.descriptionField", "Description (optional)")}</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder={t(
            "adminPanel.admin.vouchers.descriptionPlaceholder",
            "Summer sale discount..."
          )}
          data-testid="input-description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="minPurchaseAmount">{t("adminPanel.admin.vouchers.minPurchaseAmount", "Minimum Purchase Amount ($)")}</Label>
          <Input
            id="minPurchaseAmount"
            type="number"
            value={formData.minPurchaseAmount}
            onChange={(e) => setFormData({ ...formData, minPurchaseAmount: e.target.value })}
            placeholder="0"
            data-testid="input-min-purchase"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxDiscountAmount"> {t("adminPanel.admin.vouchers.maxDiscountCap", "Maximum Discount Cap ($)")}</Label>
          <Input
            id="maxDiscountAmount"
            type="number"
            value={formData.maxDiscountAmount}
            onChange={(e) => setFormData({ ...formData, maxDiscountAmount: e.target.value })}
            placeholder={t(
              "adminPanel.admin.vouchers.noCap",
              "Leave empty for no cap"
            )}
            data-testid="input-max-discount"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxUses">{t("adminPanel.admin.vouchers.totalUsageLimit", "Total Usage Limit")}</Label>
          <Input
            id="maxUses"
            type="number"
            value={formData.maxUses}
            onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
            placeholder={t(
              "adminPanel.admin.vouchers.unlimited",
              "Leave empty for unlimited"
            )}
            data-testid="input-max-uses"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="perUserLimit">{t("adminPanel.admin.vouchers.perUserLimit", "Per User Limit")}</Label>
          <Input
            id="perUserLimit"
            type="number"
            value={formData.perUserLimit}
            onChange={(e) => setFormData({ ...formData, perUserLimit: e.target.value })}
            placeholder="1"
            data-testid="input-per-user-limit"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="validFrom">{t("adminPanel.admin.vouchers.validFrom", "Valid From")}</Label>
          <Input
            id="validFrom"
            type="datetime-local"
            value={formData.validFrom}
            onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
            data-testid="input-valid-from"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="validUntil"> {t("adminPanel.admin.vouchers.validUntil", "Valid Until")}</Label>
          <Input
            id="validUntil"
            type="datetime-local"
            value={formData.validUntil}
            onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
            data-testid="input-valid-until"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="firstTimeOnly"
            checked={formData.firstTimeOnly}
            onCheckedChange={(checked) => setFormData({ ...formData, firstTimeOnly: checked })}
            data-testid="switch-first-time-only"
          />
          <Label htmlFor="firstTimeOnly">{t("adminPanel.admin.vouchers.firstTimeOnly", "First-time customers only")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="isStackable"
            checked={formData.isStackable}
            onCheckedChange={(checked) => setFormData({ ...formData, isStackable: checked })}
            data-testid="switch-stackable"
          />
          <Label htmlFor="isStackable">  {t("adminPanel.admin.vouchers.stackable", "Stackable with other offers")}</Label>
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !formData.code || !formData.value}
          data-testid="button-submit-voucher"
        >
          {isSubmitting ? t("adminPanel.admin.vouchers.saving", "Saving...") : submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}
