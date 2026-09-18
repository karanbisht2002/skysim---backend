import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star,
  Trash2,
  CheckCircle,
  Search,
  Filter,
  MessageSquare,
  TrendingUp,
  Clock,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/contexts/TranslationContext';
import { apiRequest } from '@/lib/queryClient';

interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  averageRating: number;
  recent: number;
}

interface Review {
  id: string;
  packageId: string;
  userId: string;
  rating: number;
  title: string;
  comment: string;
  pros: string[] | null;
  cons: string[] | null;
  isApproved: boolean;
  isVerifiedPurchase: boolean;
  createdAt: string;
  package?: {
    id: string;
    title: string;
    destination?: { flagEmoji: string };
  };
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

interface ReviewsResponse {
  reviews: Review[];
  totalPages: number;
  total: number;
  page: number;
}

export default function AdminReviews() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    packageId: '',
    userId: '',
    rating: '5',
    title: '',
    comment: '',
  });

  // Fetch review statistics
  const { data: stats } = useQuery<ReviewStats>({
    queryKey: ['/api/admin/reviews/stats'],
  });

  // Fetch reviews
  const { data: reviewsData, isLoading } = useQuery<ReviewsResponse>({
    queryKey: [
      '/api/admin/reviews',
      { status: statusFilter, rating: ratingFilter, search: searchQuery, sortBy, page },
    ],
  });

  // Approve review mutation
  const approveMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      return apiRequest('POST', `/api/admin/reviews/${reviewId}/approve`, {});
    },
    onSuccess: () => {
      toast({
        title: t('reviews.admin.approveSuccess', 'Review approved successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reviews'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reviews/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete review mutation
  const deleteMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      return apiRequest('DELETE', `/api/admin/reviews/${reviewId}`, {});
    },
    onSuccess: () => {
      toast({
        title: t('reviews.admin.deleteSuccess', 'Review deleted successfully'),
      });
      setDeleteReviewId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reviews'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reviews/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (reviewId: string) => {
    approveMutation.mutate(reviewId);
  };

  const handleDelete = (reviewId: string) => {
    setDeleteReviewId(reviewId);
  };

  const confirmDelete = () => {
    if (deleteReviewId) {
      deleteMutation.mutate(deleteReviewId);
    }
  };

  // Fetch packages for dropdown
  // const { data: packages } = useQuery<{ id: string; title: string }[]>({
  //   queryKey: ["/api/unified-packages"],
  // });

  const { data: packages = [] } = useQuery({
    queryKey: ['/api/unified-packages'],
    select: (res: any) => res?.data?.data ?? [],
  });

  const { data: users } = useQuery({
    queryKey: ['/api/admin/customers'],
    queryFn: () => apiRequest('GET', '/api/admin/customers'),
    select: (res: any) => res?.data?.data ?? [], // ensure it's always an array
  });

  // Create review mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/reviews', data);
    },
    onSuccess: () => {
      toast({
        title: 'Review Created',
        description: 'Review created successfully',
      });
      setCreateDialogOpen(false);
      setReviewForm({
        packageId: '',
        userId: '',
        rating: '5',
        title: '',
        comment: '',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reviews'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reviews/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateReview = () => {
    createMutation.mutate({
      ...reviewForm,
      rating: parseInt(reviewForm.rating),
      isApproved: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-foreground" data-testid="text-admin-reviews-title">
           {t("adminPanel.admin.reviews.title", "Review Management")}
          </h1>
          <p className="text-muted-foreground">
           {t(
    "adminPanel.admin.reviews.description",
    "Manage customer reviews and maintain quality standards"
  )}
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-review">
          <Plus className="mr-2 h-4 w-4" />
        {t("adminPanel.admin.reviews.addReview", "Add Review")}
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('adminPanel.admin.reviews.totalReviews', 'Total Reviews')}
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-reviews">
                {stats.total}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('adminPanel.admin.reviews.pendingApproval', 'Pending Approval')}
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold text-orange-600"
                data-testid="text-pending-reviews"
              >
                {stats.pending}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('adminPanel.admin.reviews.averageRating', 'Platform Average')}
              </CardTitle>
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-average-rating">
                {stats.averageRating.toFixed(1)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('adminPanel.admin.reviews.recentReviews', 'Recent (7 days)')}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-recent-reviews">
                {stats.recent}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder={t(
    "adminPanel.admin.reviews.searchPlaceholder",
    "Search by package name or customer email..."
  )}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-rating-filter">
                <SelectValue  placeholder={t("adminPanel.admin.reviews.filterRating", "Filter by rating")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"> {t("adminPanel.admin.reviews.allRatings", "All Ratings")}</SelectItem>
                <SelectItem value="5"> {t("adminPanel.admin.reviews.fiveStars", "5 Stars")}</SelectItem>
                <SelectItem value="4"> {t("adminPanel.admin.reviews.fiveStars", "5 Stars")}</SelectItem>
                <SelectItem value="3"> {t("adminPanel.admin.reviews.threeStars", "3 Stars")}</SelectItem>
                <SelectItem value="2">{t("adminPanel.admin.reviews.twoStars", "2 Stars")}</SelectItem>
                <SelectItem value="1">{t("adminPanel.admin.reviews.oneStar", "1 Stars")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]" data-testid="select-sort">
                <SelectValue  placeholder={t("adminPanel.admin.reviews.sortBy", "Sort by")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("adminPanel.admin.reviews.sortNewest", "Newest First")}</SelectItem>
                <SelectItem value="oldest"> {t("adminPanel.admin.reviews.sortOldest", "Oldest First")}</SelectItem>
                <SelectItem value="rating-high">  {t("adminPanel.admin.reviews.sortHighRating", "Highest Rating")}</SelectItem>
                <SelectItem value="rating-low"> {t("adminPanel.admin.reviews.sortLowRating", "Lowest Rating")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reviews Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            {t('adminPanel.admin.reviews.pendingApproval', 'Pending Approval')}
            {stats && stats.pending > 0 && (
              <Badge variant="destructive" className="ml-2">
                {stats.pending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            {t('adminPanel.admin.reviews.approvedTab', 'Approved')}
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            {t('adminPanel.admin.reviews.allTab', 'All Reviews')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : reviewsData && reviewsData.reviews && reviewsData.reviews.length > 0 ? (
            <div className="space-y-4">
              {reviewsData.reviews.map((review: any) => (
                <Card key={review.id} data-testid={`card-review-${review.id}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Package Thumbnail */}
                      {review.package && (
                        <div className="flex-shrink-0">
                          <div className="w-24 h-24 rounded-md bg-muted flex items-center justify-center text-4xl">
                            {review.package.destination?.flagEmoji || '🌍'}
                          </div>
                        </div>
                      )}

                      {/* Review Content */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3
                              className="font-semibold text-lg mb-1"
                              data-testid={`text-package-title-${review.id}`}
                            >
                              {review.package?.title || 'Package'}
                            </h3>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`h-4 w-4 ${
                                      star <= review.rating
                                        ? 'fill-yellow-400 text-yellow-400'
                                        : 'text-muted-foreground'
                                    }`}
                                  />
                                ))}
                              </div>
                              {review.isVerifiedPurchase && (
                                <Badge variant="secondary" data-testid="badge-verified">
                                  {t('adminPanel.admin.reviews.verifiedPurchas', 'Verified Purchase')}
                                </Badge>
                              )}
                              {review.isApproved && (
                                <Badge variant="default" data-testid="badge-approved">
                                  {t('adminPanel.admin.reviews.approve', 'Approved')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <p className="text-sm text-muted-foreground mb-2">
                          <span
                            className="font-medium"
                            data-testid={`text-customer-name-${review.id}`}
                          >
                            {review.user?.name || 'Anonymous'}
                          </span>{' '}
                          ({review.user?.email}) •{' '}
                          {format(new Date(review.createdAt), 'MMM dd, yyyy')}
                        </p>

                        <h4
                          className="font-semibold mb-2"
                          data-testid={`text-review-title-${review.id}`}
                        >
                          {review.title}
                        </h4>
                        <p
                          className="text-sm mb-4 line-clamp-3"
                          data-testid={`text-review-comment-${review.id}`}
                        >
                          {review.comment}
                        </p>

                        {(review.pros?.length > 0 || review.cons?.length > 0) && (
                          <div className="grid md:grid-cols-2 gap-4 mb-4">
                            {review.pros && review.pros.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-green-600 mb-1">{t("adminPanel.admin.reviews.pros", "Pros")}:</p>
                                <ul className="text-sm text-muted-foreground list-disc list-inside">
                                  {review.pros.slice(0, 2).map((pro: string, index: number) => (
                                    <li key={index}>{pro}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {review.cons && review.cons.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-red-600 mb-1">{t("adminPanel.admin.reviews.pros", "Cons")}:</p>
                                <ul className="text-sm text-muted-foreground list-disc list-inside">
                                  {review.cons.slice(0, 2).map((con: string, index: number) => (
                                    <li key={index}>{con}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {!review.isApproved && (
                            <Button
                              size="sm"
                              onClick={() => handleApprove(review.id)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${review.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              {t('adminPanel.admin.reviews.approve', 'Approve')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(review.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${review.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('adminPanel.admin.reviews.delete', 'Delete')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              {reviewsData.totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {reviewsData.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= reviewsData.totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">{t("adminPanel.admin.reviews.noReviews","No reviews found")}</h3>
                <p className="text-muted-foreground">
                  {statusFilter === 'pending'
                    ? t("adminPanel.admin.reviews.noFilteredReviews","No reviews match your filters")
                    : t("adminPanel.admin.reviews.noFilteredReviews","No reviews match your filters")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Review Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle> {t("adminPanel.admin.reviews.addReviewTitle", "Add New Review")}</DialogTitle>
            <DialogDescription>{t(
    "adminPanel.admin.reviews.addReviewDescription",
    "Create a review for a package and customer"
  )}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("adminPanel.admin.reviews.package", "Package")} *</Label>
                <Select
                  value={reviewForm.packageId}
                  onValueChange={(value) => setReviewForm({ ...reviewForm, packageId: value })}
                >
                  <SelectTrigger data-testid="select-package">
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.slice(0, 50).map((pkg: any) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("adminPanel.admin.reviews.customer", "Customer")} *</Label>
                <Select
                  value={reviewForm.userId}
                  onValueChange={(value) => setReviewForm({ ...reviewForm, userId: value })}
                >
                  <SelectTrigger data-testid="select-user">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.slice(0, 50).map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user?.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("adminPanel.admin.reviews.rating", "Rating")} *</Label>
              <Select
                value={reviewForm.rating}
                onValueChange={(value) => setReviewForm({ ...reviewForm, rating: value })}
              >
                <SelectTrigger data-testid="select-rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 Stars - Excellent</SelectItem>
                  <SelectItem value="4">4 Stars - Good</SelectItem>
                  <SelectItem value="3">3 Stars - Average</SelectItem>
                  <SelectItem value="2">2 Stars - Poor</SelectItem>
                  <SelectItem value="1">1 Star - Very Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("adminPanel.admin.reviews.reviewTitle", "Title")} *</Label>
              <Input
                value={reviewForm.title}
                onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
                data-testid="input-review-title"
                placeholder="Review title"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminPanel.admin.reviews.comment", "Comment")} *</Label>
              <Textarea
                value={reviewForm.comment}
                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                data-testid="input-review-comment"
                placeholder="Write your review..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
               {t("adminPanel.admin.reviews.cancel", "Cancel")}
            </Button>
            <Button onClick={handleCreateReview} data-testid="button-submit-review">
             {t("adminPanel.admin.reviews.createReview", "Create Review")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteReviewId !== null} onOpenChange={() => setDeleteReviewId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('adminPanel.admin.reviews.deleteConfirmTitle', 'Delete this review?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('adminPanel.admin.reviews.deleteConfirmDescription', 'This action cannot be undone')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t("adminPanel.admin.reviews.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {t("adminPanel.admin.reviews.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
