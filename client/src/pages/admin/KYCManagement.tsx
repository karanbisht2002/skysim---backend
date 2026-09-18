import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, CheckCircle, XCircle, User, Calendar, Eye, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "@/contexts/TranslationContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface KycRequest {
  id: string;
  userId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  status: string;
  rejectionReason?: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name?: string;
    phone?: string;
  };
}

export default function KYCManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<KycRequest | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [hideRejectedToggle, setHideRejectedToggle] = useState(false);
  
  // State for premium confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive' | 'warning' | 'success';
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => { },
  });

  const handleConfirm = (config: {
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive' | 'warning' | 'success';
  }) => {
    setConfirmDialog({
      open: true,
      ...config,
    });
  };

  const { data: requests, isLoading } = useQuery<KycRequest[]>({
    queryKey: ["/api/admin/kyc/pending", { status: activeTab === "all" ? "all" : activeTab }],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/admin/kyc/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      setViewDialogOpen(false);
      setSelectedRequest(null);
      toast({
        title: t('admin.kyc.approvedTitle', 'KYC Verified'),
        description: t('admin.kyc.approvedDescription', 'The user identity has been successfully verified.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.kyc.approvalFailedTitle', 'Verification Failed'),
        description: error.message || t('admin.kyc.approvalFailedDescription', 'Failed to verify KYC'),
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest("POST", `/api/admin/kyc/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/pending"] });
      setRejectDialogOpen(false);
      setViewDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason("");
      toast({
        title: t('admin.kyc.rejectedTitle', 'KYC Rejected'),
        description: t('admin.kyc.rejectedDescription', 'The user has been notified with the rejection reason.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.kyc.rejectionFailedTitle', 'Rejection Failed'),
        description: error.message || t('admin.kyc.rejectionFailedDescription', 'Failed to reject KYC'),
        variant: "destructive",
      });
    },
  });

  const handleApprove = (request: KycRequest) => {
    handleConfirm({
      title: t('admin.kyc.confirmApproveTitle', 'Verify KYC Document'),
      description: t('admin.kyc.confirmApproveDescription', 'Are you sure you want to verify this customer\'s identity document? This will mark their profile as KYC verified.'),
      confirmText: t('admin.kyc.confirmApproveAction', 'Verify Document'),
      variant: 'success',
      onConfirm: () => {
        approveMutation.mutate(request.id);
      }
    });
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast({
        title: t('admin.kyc.reasonRequiredTitle', 'Reason Required'),
        description: t('admin.kyc.reasonRequiredDescription', 'Please provide a reason for rejection'),
        variant: "destructive",
      });
      return;
    }
    if (selectedRequest) {
      rejectMutation.mutate({ id: selectedRequest.id, reason: rejectionReason });
    }
  };

  const handleView = (request: KycRequest) => {
    setSelectedRequest(request);
    setViewDialogOpen(true);
  };

  const getDocumentUrl = (filePath?: string) => {
    if (!filePath) return "";
    const cleanPath = filePath.replace(/\\/g, "/");
    const uploadsIndex = cleanPath.indexOf("/uploads");
    if (uploadsIndex === -1) return "";
    const relativePath = cleanPath.substring(uploadsIndex);
    return `${import.meta.env.VITE_API_BASE_URL || ""}${relativePath}`;
  };

  const docUrl = getDocumentUrl(selectedRequest?.filePath);

  const filteredRequests = hideRejectedToggle 
    ? requests?.filter(r => r.status !== 'rejected') 
    : requests;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500 hover:bg-green-600 border-none font-medium">{t('admin.kyc.status.verified', 'Verified')}</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="font-medium">{t('admin.kyc.status.rejected', 'Rejected')}</Badge>;
      default:
        return <Badge variant="outline" className="font-medium">{t('admin.kyc.status.pending', 'Pending')}</Badge>;
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 dark:text-white">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            {t('adminPanel.admin.kyc.title', 'KYC Verification')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {t('adminPanel.admin.kyc.subtitle', 'Review and verify customer identity documents')}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-2 px-4 rounded-lg border border-slate-200 dark:border-slate-700 transition-all hover:border-slate-300">
          <Switch
            id="hide-rejected"
            checked={hideRejectedToggle}
            onCheckedChange={setHideRejectedToggle}
          />
          <Label htmlFor="hide-rejected" className="text-sm font-medium cursor-pointer">
            {t('adminPanel.admin.kyc.option.hideRejected', 'Hide Rejected')}
          </Label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover-elevate transition-all border-l-4 border-l-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminPanel.admin.kyc.stats.pendingReviews', 'Awaiting Action')}</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {requests?.filter(r => r.status === 'pending').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('adminPanel.admin.kyc.stats.documentsAwaiting', 'Documents needing review')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 mb-4 h-12 w-full justify-start max-w-md">
          <TabsTrigger value="all" className="flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            {t('adminPanel.admin.kyc.tabs.all', 'All')}
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            {t('adminPanel.admin.kyc.tabs.pending', 'Pending')}
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            {t('adminPanel.admin.kyc.tabs.verified', 'Verified')}
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex-1 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            {t('adminPanel.admin.kyc.tabs.rejected', 'Rejected')}
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">{t('admin.kyc.loading', 'Loading verification requests...')}</p>
              </div>
            ) : filteredRequests && filteredRequests.length > 0 ? (
              <div className="space-y-4">
                {filteredRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-col md:flex-row md:items-center justify-between p-5 border rounded-xl hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors gap-4"
                    data-testid={`kyc-request-${request.id}`}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-14 h-14 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10">
                        <User className="h-7 w-7 text-primary" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">{request.user.name || request.user.email}</span>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-1">
                          <span className="flex items-center gap-1.5 capitalize font-medium">
                            <FileText className="h-4 w-4 text-slate-400" />
                            {request.documentType.replace(/_/g, ' ')}
                          </span>
                          <span className="flex items-center gap-1.5 font-medium">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            {new Date(request.createdAt).toLocaleDateString()}
                          </span>
                          {request.status === 'rejected' && request.rejectionReason && (
                            <span className="text-red-500 font-medium italic">
                              Reason: {request.rejectionReason}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 md:self-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(request)}
                        className="h-9 px-4 hover:bg-slate-100 dark:hover:bg-slate-800"
                        data-testid={`button-view-${request.id}`}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        {t('adminPanel.admin.kyc.review', 'Review')}
                      </Button>
                      
                      {request.status === 'pending' && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleApprove(request)}
                            disabled={approveMutation.isPending}
                            className="h-9 px-4 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white"
                            data-testid={`button-approve-${request.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t('adminPanel.admin.kyc.approve', 'Verify')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setRejectDialogOpen(true);
                            }}
                            disabled={rejectMutation.isPending}
                            className="h-9 px-4"
                            data-testid={`button-reject-${request.id}`}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            {t('adminPanel.admin.kyc.reject', 'Reject')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-slate-50/30 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {t('adminPanel.admin.kyc.noPendingTitle', 'Clear Queue!')}
                </h3>
                <p className="text-muted-foreground">
                  {t('adminPanel.admin.kyc.noPending', 'No verification requests found matching this filter')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {/* View Document Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden rounded-3xl border-0 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
          <DialogHeader className="p-6 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-row items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold">{t('admin.kyc.dialog.title', 'Verification Review')}</DialogTitle>
              <DialogDescription>
                {t('adminPanel.admin.kyc.dialog.description', 'Carefully check the submitted document against user information')}
              </DialogDescription>
            </div>
            {selectedRequest && getStatusBadge(selectedRequest.status)}
          </DialogHeader>

          {selectedRequest && (
            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              {/* Info Grid */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('adminPanel.admin.kyc.dialog.customerName', 'Customer Name')}</Label>
                  <div className="font-semibold text-lg">{selectedRequest.user.name || t('adminPanel.admin.kyc.dialog.notProvided', 'Not provided')}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('adminPanel.admin.kyc.dialog.email', 'Email Address')}</Label>
                  <div className="font-medium">{selectedRequest.user.email}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('adminPanel.admin.kyc.dialog.documentType', 'Document Source')}</Label>
                  <div className="font-medium capitalize flex items-center gap-2">
                    <Badge variant="secondary">{selectedRequest.documentType.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('adminPanel.admin.kyc.dialog.phone', 'Phone')}</Label>
                  <div className="font-medium">{selectedRequest.user.phone || t('adminPanel.admin.kyc.dialog.notProvided', 'Unspecified')}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('adminPanel.admin.kyc.dialog.submitted', 'Submission Date')}</Label>
                  <div className="font-medium">
                    {new Date(selectedRequest.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-slate-400 font-bold">{t('adminPanel.admin.kyc.dialog.fileName', 'Evidence File')}</Label>
                  <div className="font-medium text-slate-500 truncate">{selectedRequest.fileName}</div>
                </div>
              </div>

              {/* Preview Container */}
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-10 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col items-center justify-center gap-6 min-h-[300px]">
                <FileText className="h-16 w-16 text-primary/20" />
                
                <div className="text-center space-y-4">
                  {docUrl ? (
                    <div className="space-y-4">
                      <p className="text-slate-600 dark:text-slate-400 max-w-sm">
                        {t('adminPanel.admin.kyc.dialog.previewNote', 'To ensure full privacy and clarity, please open the document in a secure new tab for review.')}
                      </p>
                      <Button asChild className="rounded-full px-8 shadow-lg shadow-primary/20">
                        <a href={docUrl} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-4 w-4 mr-2" />
                          {t('adminPanel.admin.kyc.dialog.viewDocument', 'Open Full Size')}
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <XCircle className="h-10 w-10 text-red-400" />
                      <span className="text-red-500 text-lg font-semibold uppercase tracking-tight">
                        Evidence file not found
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedRequest.status === 'rejected' && selectedRequest.rejectionReason && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 rounded-xl">
                  <Label className="text-red-600 dark:text-red-400 text-xs font-bold uppercase mb-2 block">Rejection Note</Label>
                  <p className="text-red-800 dark:text-red-300 font-medium italic underline decoration-red-200 decoration-wavy underline-offset-4">
                    "{selectedRequest.rejectionReason}"
                  </p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 gap-3">
            <Button
              variant="outline"
              onClick={() => setViewDialogOpen(false)}
              className="rounded-xl h-11 px-6 font-medium border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all"
              data-testid="button-close-dialog"
            >
              {t('adminPanel.admin.kyc.dialog.close', 'Dismiss')}
            </Button>
            
            {selectedRequest?.status === 'pending' && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setViewDialogOpen(false);
                    setRejectDialogOpen(true);
                  }}
                  className="rounded-xl h-11 px-6 font-semibold shadow-lg shadow-red-500/20 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 border-0 transition-all active:scale-95"
                  data-testid="button-reject-dialog"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t('adminPanel.admin.kyc.reject', 'Reject')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => selectedRequest && handleApprove(selectedRequest)}
                  disabled={approveMutation.isPending}
                  className="rounded-xl h-11 px-8 font-semibold bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 shadow-lg shadow-green-500/20 border-0 transition-all active:scale-95"
                  data-testid="button-approve-dialog"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('adminPanel.admin.kyc.approve', 'Verify identity')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="rounded-3xl border-0 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl max-w-md">
          <DialogHeader className="space-y-3">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-1">
              <XCircle className="h-7 w-7 text-red-600 dark:text-red-500" />
            </div>
            <DialogTitle className="text-xl font-bold">{t('adminPanel.admin.kyc.rejectDialog.title', 'Specify Rejection Reason')}</DialogTitle>
            <DialogDescription className="text-base text-slate-500">
              {t('adminPanel.admin.kyc.rejectDialog.description', 'Clearly state why this document fails verification. This note will be sent directly to the customer.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {t('adminPanel.admin.kyc.rejectDialog.rejectionReason', 'Rejection Insight')}
              </Label>
              <Textarea
                id="reason"
                placeholder={t('admin.kyc.rejectDialog.placeholder', 'e.g., The passport photo is blurry and illegible. Please re-upload a higher quality scan.')}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-2 min-h-[140px] resize-none rounded-xl border-slate-200 focus:ring-red-500"
                data-testid="textarea-rejection-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-3 mt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectionReason("");
              }}
              className="rounded-xl flex-1 h-11 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              data-testid="button-cancel-reject"
            >
              {t('adminPanel.admin.kyc.rejectDialog.cancel', 'Go Back')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
              className="rounded-xl flex-1 h-11 font-bold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-500/20 border-0 transition-all active:scale-95"
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? t('adminPanel.admin.kyc.rejectDialog.rejecting', 'Processing...') : t('adminPanel.admin.kyc.rejectDialog.confirmRejection', 'Finalize Rejection')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-md border-0 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn(
                "p-2.5 rounded-full",
                confirmDialog.variant === 'destructive' ? "bg-red-100 dark:bg-red-900/30 text-red-600" :
                confirmDialog.variant === 'warning' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600" :
                confirmDialog.variant === 'success' ? "bg-green-100 dark:bg-green-900/30 text-green-600" :
                "bg-primary/10 text-primary"
              )}>
                {confirmDialog.variant === 'destructive' ? <ShieldAlert className="h-5 w-5" /> :
                 confirmDialog.variant === 'warning' ? <ShieldAlert className="h-5 w-5" /> :
                 confirmDialog.variant === 'success' ? <ShieldCheck className="h-5 w-5" /> :
                 <ShieldCheck className="h-5 w-5" />}
              </div>
              <AlertDialogTitle className="text-xl font-bold tracking-tight">
                {confirmDialog.title}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-3 mt-6">
            <AlertDialogCancel className="rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 h-11 px-6 font-medium">
              {confirmDialog.cancelText || t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "rounded-xl font-semibold shadow-lg transition-all duration-200 active:scale-95 h-11 px-6",
                confirmDialog.variant === 'destructive'
                  ? "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-red-500/20"
                  : confirmDialog.variant === 'warning'
                    ? "bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500 shadow-orange-500/20"
                    : confirmDialog.variant === 'success'
                      ? "bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 shadow-green-500/20"
                      : "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-primary/20"
              )}
              onClick={() => {
                confirmDialog.onConfirm();
              }}
            >
              {confirmDialog.confirmText || t('common.common.confirm', 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
