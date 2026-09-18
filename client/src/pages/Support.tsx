import { useState } from 'react';
import { Link } from 'wouter';
import {
  Globe,
  Send,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Headphones,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTranslation } from '@/contexts/TranslationContext';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  userId: string;
  userName: string;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: string;
  senderName: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

interface TicketDetailsResponse {
  ticket: Ticket;
  messages: Message[];
}

export default function UserSupportTickets() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [createFormData, setCreateFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
  });

  // Fetch user's tickets
  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['/api/ticket', { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await apiRequest('GET', `/api/ticket?${params.toString()}`);
      return res.json();
    },
  });

  const tickets: Ticket[] = ticketsData?.tickets || [];

  // Fetch single ticket with messages
  const { data: ticketDetails, refetch: refetchTicketDetails } = useQuery<TicketDetailsResponse>({
    queryKey: ['/api/ticket', selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return null;
      const res = await apiRequest('GET', `/api/ticket/${selectedTicketId}`);
      return res.json();
    },
    enabled: !!selectedTicketId,
  });

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: async (data: typeof createFormData) => {
      return await apiRequest('POST', '/api/ticket', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ticket'] });
      toast({ title: t('support.success'), description: t('support.ticketCreated') });
      setShowCreateDialog(false);
      setCreateFormData({ title: '', description: '', priority: 'medium' });
    },
    onError: (error: any) => {
      toast({
        title: t('support.error'),
        description: error.message || t('support.error'),
        variant: 'destructive',
      });
    },
  });

  // Add message mutation
  const addMessageMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      return await apiRequest('POST', `/api/ticket/${ticketId}/messages`, {
        message,
        isInternal: false,
      });
    },
    onSuccess: () => {
      refetchTicketDetails();
      setNewMessage('');
      toast({ title: t('support.success'), description: t('support.messageSent') });
    },
    onError: (error: any) => {
      toast({
        title: t('support.error'),
        description: error.message || t('support.error'),
        variant: 'destructive',
      });
    },
  });

  const handleCreateTicket = () => {
    if (!createFormData.title || !createFormData.description) {
      toast({
        title: t('support.validationError'),
        description: t('support.fillFields'),
        variant: 'destructive',
      });
      return;
    }
    createTicketMutation.mutate(createFormData);
  };

  const handleSendMessage = () => {
    if (!selectedTicketId || !newMessage.trim()) return;
    addMessageMutation.mutate({
      ticketId: selectedTicketId,
      message: newMessage.trim(),
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'resolved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'closed':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertTriangle className="w-4 h-4" />;
      case 'in_progress':
        return <Clock className="w-4 h-4" />;
      case 'resolved':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'closed':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
      case 'urgent':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return t('support.priorityHighLabel');
      case 'urgent': return t('support.priorityUrgentLabel');
      case 'medium': return t('support.priorityMediumLabel');
      case 'low': return t('support.priorityLowLabel');
      default: return priority;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return t('support.statusOpen');
      case 'in_progress': return t('support.statusInProgress');
      case 'resolved': return t('support.statusResolved');
      case 'closed': return t('support.statusClosed');
      default: return status.replace('_', ' ');
    }
  };

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center space-x-2 cursor-pointer">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-semibold text-xl">{t('support.logo')}</span>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/my-orders">
              <Button variant="ghost">{t('support.myOrders')}</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost">{t('support.signIn')}</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t('support.myTickets')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('support.manageTickets')}
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            {t('support.createTicket')}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('support.statusOpen')}</p>
                  <h3 className="text-2xl font-bold mt-1">
                    {tickets?.filter((t) => t.status === 'open').length || 0}
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('support.statusInProgress')}</p>
                  <h3 className="text-2xl font-bold mt-1">
                    {tickets?.filter((t) => t.status === 'in_progress').length || 0}
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('support.statusResolved')}</p>
                  <h3 className="text-2xl font-bold mt-1">
                    {tickets?.filter((t) => t.status === 'resolved').length || 0}
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t('support.total')}</p>
                  <h3 className="text-2xl font-bold mt-1">{tickets?.length || 0}</h3>
                </div>
                <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                  <Headphones className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tickets List */}
          <div className="lg:col-span-1">
            {/* Status Filter */}
            <div className="mb-4">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">{t('support.statusAll')}</option>
                <option value="open">{t('support.statusOpen')}</option>
                <option value="in_progress">{t('support.statusInProgress')}</option>
                <option value="resolved">{t('support.statusResolved')}</option>
                <option value="closed">{t('support.statusClosed')}</option>
              </select>
            </div>

            {/* Tickets */}
            {isLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-muted-foreground">{t('support.loadingTickets')}</div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <Card
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`cursor-pointer transition-all hover:shadow-md ${selectedTicketId === ticket.id ? 'ring-2 ring-primary' : ''
                      }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusIcon(ticket.status)}
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}
                          >
                            {getStatusLabel(ticket.status)}
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}
                          >
                            {getPriorityLabel(ticket.priority)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="font-medium mb-2">{ticket.title}</h3>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t('support.updatedTime', { time: new Date(ticket.updatedAt).toLocaleTimeString() })}</span>
                        {ticket.assignedToName && (
                          <span className="text-primary font-medium">
                            {t('support.assignedTo', { name: ticket.assignedToName })}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {tickets.length === 0 && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Headphones className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">{t('support.noTicketsFound')}</h3>
                      <p className="text-muted-foreground mb-4">
                        {statusFilter !== 'all'
                          ? t('support.adjustFilter')
                          : t('support.createFirstTicket')}
                      </p>
                      <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                        <Plus className="w-4 h-4" />
                        {t('support.createTicket')}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* Ticket Details */}
          <div className="lg:col-span-2">
            {selectedTicketId && selectedTicket ? (
              <Card>
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle>{selectedTicket.title}</CardTitle>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedTicket.status)}`}
                      >
                        {getStatusLabel(selectedTicket.status)}
                      </span>
                    </div>
                    <button
                      onClick={() => refetchTicketDetails()}
                      className="px-4 py-2 border rounded-md hover:bg-muted transition text-sm"
                    >
                      🔄 {t('support.refresh')}
                    </button>
                  </div>
                </CardHeader>

                <CardContent className="p-6">
                  {/* Ticket Info */}
                  <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('support.created')}:</span>
                      <div className="font-medium mt-1">
                        {new Date(selectedTicket.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('support.priority')}:</span>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(selectedTicket.priority)}`}
                        >
                          {getPriorityLabel(selectedTicket.priority)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-6">
                    <span className="text-sm text-muted-foreground">{t('support.description')}:</span>
                    <p className="mt-2 text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
                  </div>

                  {/* Conversation */}
                  <div className="border-t pt-6">
                    <h3 className="font-medium mb-4">{t('support.conversation')}</h3>
                    <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto">
                      {!ticketDetails?.messages || ticketDetails.messages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          {t('support.noMessages')}
                        </p>
                      ) : (
                        ticketDetails.messages.map((msg: Message) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.senderType === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-md ${msg.senderType === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                                } px-4 py-3 rounded-lg`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold">{msg.senderName}</span>
                                {msg.senderType !== 'user' && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                                    Support
                                  </span>
                                )}
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                              <div className="text-xs mt-1 opacity-70">
                                {new Date(msg.createdAt).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Reply Box */}
                    <div className="flex items-start gap-2">
                      <Textarea
                        placeholder={t('support.typeReply')}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1 resize-none"
                        rows={3}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || addMessageMutation.isPending}
                        className="gap-2"
                      >
                        <ArrowRight className="w-4 h-4" />
                        {t('support.send')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Headphones className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t('support.noTicketSelected')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('support.selectTicket')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Contact Support Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl mb-2">📧</div>
              <div className="font-medium mb-1">{t('support.emailSupport')}</div>
              <div className="text-sm text-muted-foreground">support@esim-global.com</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl mb-2">💬</div>
              <div className="font-medium mb-1">{t('support.liveChat')}</div>
              <div className="text-sm text-muted-foreground">{t('support.available247')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl mb-2">📚</div>
              <div className="font-medium mb-1">{t('support.helpCenter')}</div>
              <div className="text-sm text-muted-foreground">{t('support.browseFaqs')}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Ticket Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('support.createNewTicket')}</DialogTitle>
            <DialogDescription>
              {t('support.ticketDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">{t('support.titleLabel')}</Label>
              <Input
                id="title"
                value={createFormData.title}
                onChange={(e) => setCreateFormData({ ...createFormData, title: e.target.value })}
                placeholder={t('support.issueTitle')}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description">{t('support.descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={createFormData.description}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, description: e.target.value })
                }
                placeholder={t('support.issueDesc')}
                rows={5}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="priority">{t('support.priorityLabel')}</Label>
              <select
                id="priority"
                value={createFormData.priority}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, priority: e.target.value as any })
                }
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="low">{t('support.priorityLowDesc')}</option>
                <option value="medium">{t('support.priorityMediumDesc')}</option>
                <option value="high">{t('support.priorityHighDesc')}</option>
                <option value="urgent">{t('support.priorityUrgentDesc')}</option>
              </select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('support.cancel')}
            </Button>
            <Button
              onClick={handleCreateTicket}
              disabled={createTicketMutation.isPending}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              {createTicketMutation.isPending ? t('support.creating') : t('support.createTicket')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
