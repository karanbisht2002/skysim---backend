import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  Trash,
  ArrowRight,
  Headphones,
  Mail,
  Calendar,
  Tag,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAdmin } from '@/hooks/use-admin';
import { useTranslation } from '@/contexts/TranslationContext';
import { connectSocket } from '../../socket/socket';

interface AdminUser {
  id: string;
  username: string;
  role: string;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  userId: string;
  userName: string;
  assignedToId?: string | null;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
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

export default function SupportTicketsSystem() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const { toast } = useToast();
  const { user } = useAdmin();
  const { t } = useTranslation();
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);

  const [createFormData, setCreateFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
  });

  const itemsPerPage = 25;
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // Fetch tickets
  const buildQueryKey = () => {
    const params: any = { page: currentPage, limit: itemsPerPage };
    if (searchQuery) params.search = searchQuery;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (priorityFilter !== 'all') params.priority = priorityFilter;
    return ['/api/admin/support-tickets', params];
  };

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: [
      '/api/admin/support-tickets',
      currentPage,
      searchQuery,
      statusFilter,
      priorityFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (searchQuery) params.append('search', searchQuery);

      const res = await apiRequest('GET', `/api/admin/support-tickets?${params.toString()}`);

      return res.json();
    },
  });

  // const tickets: Ticket[] = ticketsData?.data?.tickets || [];
  const tickets: Ticket[] = ticketsData?.data?.tickets || [];

  const totalPages = Math.ceil((ticketsData?.pagination?.total || 0) / itemsPerPage);

  // Fetch single ticket with messages
  const { data: ticketDetails, refetch: refetchTicketDetails } = useQuery<TicketDetailsResponse>({
    queryKey: ['/api/admin/support-tickets', selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return null;
      const res = await apiRequest('GET', `/api/admin/support-tickets/${selectedTicketId}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!selectedTicketId,
  });

  useEffect(() => {
    if (ticketDetails?.messages) {
      setLiveMessages(ticketDetails.messages);
    }
  }, [ticketDetails?.messages]);

  useEffect(() => {
    if (!selectedTicketId) return;

    const socket = connectSocket();

    // 🔌 join ticket room
    socket.emit('join_ticket', { ticketId: selectedTicketId });

    // 📩 receive realtime messages
    socket.on('ticket_message', (data) => {
      /*
        {
          ticketId,
          replyId,
          senderType: "user" | "admin",
          message,
          createdAt
        }
      */

      setLiveMessages((prev) => {
        const exists = prev.some((m) => m.id === data.replyId);
        if (exists) return prev;

        return [
          ...prev,
          {
            id: data.replyId,
            ticketId: data.ticketId,
            senderId: '',
            senderType: data.senderType,
            senderName: data.senderType === 'user' ? 'User' : 'You',
            message: data.message,
            isInternal: false,
            createdAt: data.createdAt,
          },
        ];
      });
    });

    return () => {
      socket.emit('leave_ticket', { ticketId: selectedTicketId });
      socket.off('ticket_message');
    };
  }, [selectedTicketId]);

  // Fetch all admins for assignment (admin only)
  const { data: adminsData } = useQuery({
    queryKey: ['/api/admins'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admins?limit=100');
      return res.json();
    },
    enabled: isAdmin,
  });

  const adminUsers: AdminUser[] = adminsData?.admins || [];

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: async (data: typeof createFormData) => {
      return await apiRequest('POST', '/api/tickets', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({ title: 'Success', description: 'Ticket created successfully' });
      setShowCreateDialog(false);
      setCreateFormData({ title: '', description: '', priority: 'medium' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create ticket',
        variant: 'destructive',
      });
    },
  });

  // Update ticket mutation (admin only)
  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest('PUT', `/api/tickets/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      refetchTicketDetails();
      toast({ title: 'Success', description: 'Ticket updated successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update ticket',
        variant: 'destructive',
      });
    },
  });

  // Add message mutation
  const addMessageMutation = useMutation({
    mutationFn: async ({
      ticketId,
      message,
      isInternal,
    }: {
      ticketId: string;
      message: string;
      isInternal: boolean;
    }) => {
      return await apiRequest('POST', `/api/admin/support-tickets/${ticketId}/messages`, {
        message,
        isInternal,
      });
    },
    onSuccess: () => {
      refetchTicketDetails();
      setNewMessage('');
      setIsInternalNote(false);
      toast({ title: 'Success', description: 'Message sent successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

  // Delete ticket mutation (admin only)
  const deleteTicketMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/tickets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      setSelectedTicketId(null);
      toast({ title: 'Success', description: 'Ticket deleted successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete ticket',
        variant: 'destructive',
      });
    },
  });

  const handleCreateTicket = () => {
    if (!createFormData.title || !createFormData.description) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    createTicketMutation.mutate(createFormData);
  };

  const handleUpdateStatus = (status: string) => {
    if (!selectedTicketId) return;
    updateTicketMutation.mutate({ id: selectedTicketId, data: { status } });
  };

  const handleUpdatePriority = (priority: string) => {
    if (!selectedTicketId) return;
    updateTicketMutation.mutate({ id: selectedTicketId, data: { priority } });
  };

  const handleAssignTicket = (value: string) => {
    if (!selectedTicketId) return;
    const selectedAdmin = adminUsers.find((admin) => admin.id === value);
    updateTicketMutation.mutate({
      id: selectedTicketId,
      data: {
        assignedToId: value === 'unassigned' ? null : value,
        assignedToName: value === 'unassigned' ? null : selectedAdmin?.username,
      },
    });
  };

  const handleSendMessage = () => {
    if (!selectedTicketId || !newMessage.trim()) return;
    addMessageMutation.mutate({
      ticketId: selectedTicketId,
      message: newMessage.trim(),
      isInternal: isInternalNote,
    });
  };

  const handleDeleteTicket = (ticketId: string, ticketTitle: string) => {
    if (confirm(`Are you sure you want to delete ticket "${ticketTitle}"?`)) {
      deleteTicketMutation.mutate(ticketId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-teal-100 text-teal-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertTriangle className="w-4 h-4 text-teal-500" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'closed':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors dark:text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {t?.('adminPanel.admin.tickets.title', 'Support Tickets')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {t?.(
                'adminPanel.admin.tickets.description',
                'Manage customer support tickets and inquiries',
              )}
            </p>
          </div>
          {/* <Button onClick={() => setShowCreateDialog(true)} className="">
            {t?.('adminPanel.admin.tickets.button.create', 'Create Ticket')}
          </Button> */}
        </div>

        {/* Stats Cards */}

        <div className="grid gap-4 md:grid-cols-4 mb-8">
          {/* Open */}
          <Card className="border-0 bg-gradient-to-br from-teal-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 shadow-lg p-6">
            <p className="text-sm font-medium text-teal-600 dark:text-teal-400">
              {t('adminPanel.admin.tickets.stats.open', 'Open')}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {tickets?.filter((t) => t.status === 'open').length || 0}
            </h3>
          </Card>

          {/* In Progress */}
          <Card className="border-0 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-gray-800 dark:to-gray-900 shadow-lg p-6">
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
              {t('adminPanel.admin.tickets.stats.inProgress', 'In Progress')}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {tickets?.filter((t) => t.status === 'in_progress').length || 0}
            </h3>
          </Card>

          {/* Resolved */}
          <Card className="border-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-800 dark:to-gray-900 shadow-lg p-6">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              {t('adminPanel.admin.tickets.stats.resolved', 'Resolved')}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {tickets?.filter((t) => t.status === 'resolved').length || 0}
            </h3>
          </Card>

          {/* Urgent */}
          <Card className="border-0 bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-800 dark:to-gray-900 shadow-lg p-6">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {t('adminPanel.admin.tickets.stats.urgent', 'Urgent')}
            </p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {tickets?.filter((t) => t.priority === 'urgent').length || 0}
            </h3>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tickets List */}
          <div className="lg:col-span-1">
            {/* Filters and Search */}

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />

                <input
                  type="text"
                  placeholder={t(
                    'adminPanel.admin.tickets.search.placeholder',
                    'Search tickets...',
                  )}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 
      bg-white dark:bg-gray-900 
      border border-gray-300 dark:border-gray-600 
      text-gray-900 dark:text-gray-200
      placeholder-gray-400 dark:placeholder-gray-500
      rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex space-x-2 mt-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex-1 px-3 py-2 
      bg-white dark:bg-gray-900
      border border-gray-300 dark:border-gray-600
      text-gray-900 dark:text-gray-200
      rounded-lg text-sm"
                >
                  <option value="all">
                    {t('adminPanel.admin.tickets.filter.allStatus', 'All Status')}
                  </option>
                  <option value="open">{t('adminPanel.admin.tickets.stats.open', 'Open')}</option>
                  <option value="in_progress">
                    {t('adminPanel.admin.tickets.stats.inProgress', 'In Progress')}
                  </option>
                  <option value="resolved">
                    {t('adminPanel.admin.tickets.stats.resolved', 'Resolved')}
                  </option>
                  <option value="closed">
                    {t('adminPanel.admin.tickets.status.closed', 'Closed')}
                  </option>
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="flex-1 px-3 py-2 
      bg-white dark:bg-gray-900
      border border-gray-300 dark:border-gray-600
      text-gray-900 dark:text-gray-200
      rounded-lg text-sm"
                >
                  <option value="all">
                    {' '}
                    {t('adminPanel.admin.tickets.filter.allPriority', 'All Priority')}
                  </option>
                  <option value="low"> {t('adminPanel.admin.tickets.priority.low', 'Low')}</option>
                  <option value="medium">
                    {t('adminPanel.admin.tickets.priority.medium', 'Medium')}
                  </option>
                  <option value="high">
                    {' '}
                    {t('adminPanel.admin.tickets.priority.high', 'High')}
                  </option>
                  <option value="urgent">
                    {' '}
                    {t('adminPanel.admin.tickets.priority.urgent', 'Urgent')}
                  </option>
                </select>
              </div>
            </div>

            {/* Tickets */}
            {isLoading ? (
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center dark:text-white">
                <div className="text-gray-500">
                  {t('adminPanel.admin.tickets.loading', 'Loading tickets...')}
                </div>
              </div>
            ) : (
              <div className="flex-1 max-h-[500px] overflow-y-auto pr-2">
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border 
  ${
    selectedTicketId === ticket.id
      ? 'border-green-500 ring-2 ring-green-200 dark:ring-green-900'
      : 'border-gray-200 dark:border-gray-700'
  } 
  hover:border-green-500 dark:hover:border-green-400 transition-all cursor-pointer`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2 flex-wrap">
                          {getStatusIcon(ticket.status)}

                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}
                          >
                            {ticket.status.replace('_', ' ')}
                          </span>

                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}
                          >
                            {ticket.priority}
                          </span>
                        </div>

                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="font-medium text-gray-900 dark:text-gray-200 mb-2">
                        {ticket.title}
                      </h3>

                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-600 dark:text-green-300 text-xs font-semibold">
                          {ticket.userName.charAt(0).toUpperCase()}
                        </div>

                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {ticket.userName}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>Updated {new Date(ticket.updatedAt).toLocaleTimeString()}</span>

                        {isAdmin && ticket.assignedToName && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            → {ticket.assignedToName}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {tickets.length === 0 && (
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-center">
                      <Headphones className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />

                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200 mb-2">
                        {t('adminPanel.admin.tickets.empty.title', 'No tickets found')}
                      </h3>

                      <p className="text-gray-500 dark:text-gray-400">
                        {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                          ? t(
                              'adminPanel.admin.tickets.empty.filtered',
                              'Try adjusting your search or filter criteria',
                            )
                          : t(
                              'adminPanel.admin.tickets.empty.allResolved',
                              'All support tickets have been resolved!',
                            )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                <div className="text-sm text-gray-600">
                  {t('adminPanel.admin.tickets.pagination.page', 'Page')} {currentPage}{' '}
                  {t('adminPanel.admin.tickets.pagination.of', 'of')} {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    {t('adminPanel.admin.tickets.pagination.previous', 'Previous')}
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    {t('adminPanel.admin.tickets.pagination.next', 'Next')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Ticket Details */}
          <div className="lg:col-span-2">
            {selectedTicketId && selectedTicket ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* Ticket Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        {selectedTicket.title}
                      </h2>

                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedTicket.status)}`}
                      >
                        {selectedTicket.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => refetchTicketDetails()}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
                      >
                        🔄 {t('adminPanel.admin.tickets.actions.refresh', 'Refresh')}
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() =>
                            handleDeleteTicket(selectedTicket.id, selectedTicket.title)
                          }
                          className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          <Trash className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        {t('adminPanel.admin.tickets.details.creator', 'Creator')}:
                      </span>

                      <div className="flex items-center mt-1">
                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-600 dark:text-green-300 text-xs font-semibold mr-2">
                          {selectedTicket.userName.charAt(0).toUpperCase()}
                        </div>

                        <span className="font-medium text-gray-900 dark:text-gray-200">
                          {selectedTicket.userName}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        {t('adminPanel.admin.tickets.details.details', 'Details')}:
                      </span>

                      <div className="flex items-center mt-1">
                        <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500 mr-1" />
                        <span className="text-gray-900 dark:text-gray-200">
                          {new Date(selectedTicket.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center mt-1">
                        <Tag className="w-4 h-4 text-gray-400 dark:text-gray-500 mr-1" />
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(selectedTicket.priority)}`}
                        >
                          {selectedTicket.priority}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Admin Controls */}
                  {isAdmin && (
                    <div className="flex gap-4 flex-wrap">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                          {t('adminPanel.admin.tickets.form.status', 'Status')}
                        </label>

                        <select
                          value={ticketDetails?.ticket?.status || selectedTicket.status}
                          onChange={(e) => handleUpdateStatus(e.target.value)}
                          className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-lg text-sm"
                        >
                          <option value="open">
                            {t('adminPanel.admin.tickets.stats.open', 'Open')}
                          </option>
                          <option value="in_progress">
                            {t('adminPanel.admin.tickets.stats.inProgress', 'In Progress')}
                          </option>
                          <option value="resolved">
                            {t('adminPanel.admin.tickets.stats.resolved', 'Resolved')}
                          </option>
                          <option value="closed">
                            {t('adminPanel.admin.tickets.status.closed', 'Closed')}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                          {t('adminPanel.admin.tickets.form.priority', 'Priority')}
                        </label>

                        <select
                          value={ticketDetails?.ticket?.priority || selectedTicket.priority}
                          onChange={(e) => handleUpdatePriority(e.target.value)}
                          className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-lg text-sm"
                        >
                          <option value="low">
                            {' '}
                            {t('adminPanel.admin.tickets.priority.low', 'Low')}
                          </option>
                          <option value="medium">
                            {t('adminPanel.admin.tickets.priority.medium', 'Medium')}
                          </option>
                          <option value="high">
                            {' '}
                            {t('adminPanel.admin.tickets.priority.high', 'High')}
                          </option>
                          <option value="urgent">
                            {' '}
                            {t('adminPanel.admin.tickets.priority.urgent', 'Urgent')}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                          {t('adminPanel.admin.tickets.assign.assignTo', 'Assign To')}
                        </label>

                        <select
                          value={ticketDetails?.ticket?.assignedToId || 'unassigned'}
                          onChange={(e) => handleAssignTicket(e.target.value)}
                          className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-lg text-sm"
                        >
                          <option value="unassigned">
                            {t('adminPanel.admin.tickets.assign.unassigned', 'Unassigned')}
                          </option>

                          {adminUsers.map((admin) => (
                            <option key={admin.id} value={admin.id}>
                              {admin.username}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div className="mt-4">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('adminPanel.admin.tickets.details.description', 'Description')}:
                    </span>

                    <p className="mt-2 text-sm text-gray-900 dark:text-gray-200 whitespace-pre-wrap">
                      {selectedTicket.description}
                    </p>
                  </div>
                </div>

                {/* Conversation */}
                <div className="p-6 bg-gray-50 dark:bg-gray-900 max-h-[300px] overflow-y-auto">
                  <h3 className="font-medium text-gray-900 dark:text-gray-200 mb-4">
                    {t('adminPanel.admin.tickets.conversation.title', 'Conversation')}
                  </h3>

                  <div className="space-y-4">
                    {!liveMessages || liveMessages.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                        {t('adminPanel.admin.tickets.conversation.noMessages', 'No messages yet')}
                      </p>
                    ) : (
                      liveMessages.map((msg: Message) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-md px-4 py-3 rounded-lg shadow-sm
              
              ${
                msg.isInternal
                  ? 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700'
                  : msg.senderId === user?.id
                    ? 'bg-green-500 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
              }
              
              `}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-xs font-semibold ${msg.senderId === user?.id && !msg.isInternal ? 'text-green-100' : 'text-gray-700 dark:text-gray-300'}`}
                              >
                                {msg.senderName}
                              </span>

                              {msg.isInternal && (
                                <span className="text-xs px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-200">
                                  Internal
                                </span>
                              )}
                            </div>

                            <p
                              className={`text-sm whitespace-pre-wrap ${msg.senderId === user?.id && !msg.isInternal ? 'text-white' : 'text-gray-900 dark:text-gray-200'}`}
                            >
                              {msg.message}
                            </p>

                            <div
                              className={`text-xs mt-1 ${msg.senderId === user?.id && !msg.isInternal ? 'text-green-100' : 'text-gray-500 dark:text-gray-400'}`}
                            >
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Reply Box */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-start space-x-2">
                    <textarea
                      placeholder={t(
                        'adminPanel.admin.tickets.reply.placeholder',
                        'Type your reply...',
                      )}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                      rows={3}
                    />

                    <button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || addMessageMutation.isPending}
                      className="bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="internal"
                          checked={isInternalNote}
                          onChange={(e) => setIsInternalNote(e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-600 text-green-500 bg-white dark:bg-gray-800"
                        />

                        <label
                          htmlFor="internal"
                          className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
                        >
                          {t(
                            'adminPanel.admin.tickets.reply.internalNote',
                            'Internal note (not visible to user)',
                          )}
                        </label>
                      </div>
                    )}

                    <div className="flex space-x-2 ml-auto">
                      {selectedTicket.status !== 'resolved' && isAdmin && (
                        <button
                          onClick={() => handleUpdateStatus('resolved')}
                          className="px-3 py-1 text-sm bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800"
                        >
                          {t('adminPanel.admin.tickets.actions.resolve', 'Resolve Ticket')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 dark:text-gray-300  p-12 rounded-xl shadow-sm border border-gray-200 text-center">
                <Headphones className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg dark:text-gray-300 font-medium text-gray-900 mb-2">
                  {t('adminPanel.admin.tickets.noSelection.title', 'No ticket selected')}
                </h3>
                <p className="text-gray-500 mb-4">
                  {t(
                    'adminPanel.admin.tickets.noSelection.description',
                    'Select a ticket from the list to view details',
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Ticket Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {t('adminPanel.admin.tickets.dialog.createTitle', 'Create New Ticket')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'adminPanel.admin.tickets.dialog.createDescription',
                "Submit a new support ticket. We'll get back to you as soon as possible.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title" className="text-sm font-medium">
                {t('adminPanel.admin.tickets.form.title', 'Title *')}
              </Label>
              <Input
                id="title"
                value={createFormData.title}
                onChange={(e) => setCreateFormData({ ...createFormData, title: e.target.value })}
                placeholder={t(
                  'adminPanel.admin.tickets.form.titlePlaceholder',
                  'Brief description of the issue',
                )}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                {t('adminPanel.admin.tickets.form.description', 'Description *')}
              </Label>
              <textarea
                id="description"
                value={createFormData.description}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, description: e.target.value })
                }
                placeholder={t(
                  'adminPanel.admin.tickets.form.descriptionPlaceholder',
                  'Detailed description of the issue',
                )}
                rows={5}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <Label htmlFor="priority" className="text-sm font-medium">
                {t('adminPanel.admin.tickets.form.priority', 'Priority')}
              </Label>
              <select
                id="priority"
                value={createFormData.priority}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, priority: e.target.value as any })
                }
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="low"> {t('adminPanel.admin.tickets.priority.low', 'Low')}</option>
                <option value="medium">
                  {t('adminPanel.admin.tickets.priority.medium', 'Medium')}
                </option>
                <option value="high"> {t('adminPanel.admin.tickets.priority.high', 'High')}</option>
                <option value="urgent">
                  {' '}
                  {t('adminPanel.admin.tickets.priority.urgent', 'Urgent')}
                </option>
              </select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setShowCreateDialog(false)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTicket}
              disabled={createTicketMutation.isPending}
              className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
            >
              {createTicketMutation.isPending ? 'Creating...' : 'Create Ticket'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
