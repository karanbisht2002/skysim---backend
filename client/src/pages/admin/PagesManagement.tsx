import { useTranslation } from '@/contexts/TranslationContext';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Edit2,
  FileText,
  Loader2,
  Eye,
  EyeOff,
  Bold,
  Italic,
  List,
  ListOrdered,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ✅ TipTap */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';

interface Page {
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

export default function PageManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);

  const [formData, setFormData] = useState({
    slug: '',
    title: '',
    content: '',
    metaTitle: '',
    metaDescription: '',
    isPublished: false,
  });

  /* ================= TipTap Editor ================= */
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setFormData((prev) => ({
        ...prev,
        content: editor.getHTML(),
      }));
    },
  });

  useEffect(() => {
    if (!showAddDialog && !editingPage) {
      editor?.commands.clearContent();
    }
  }, [showAddDialog, editingPage]);

  /* ---------------- FETCH PAGES ---------------- */
  const { data, isLoading } = useQuery({
    queryKey: ['/api/pages'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pages');
      return res.json();
    },
  });

  const pages = data?.data || [];

  /* ---------------- MUTATIONS ---------------- */
  const addPageMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(t('adminPanel.admin.pagesManagement.errors.failedToCreate', 'Failed to create page'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      resetForm();
      setShowAddDialog(false);
      toast({ title: t('common.success', 'Success'), description: t('adminPanel.admin.pagesManagement.toasts.created', 'Page created successfully') });
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof formData }) => {
      const res = await fetch(`/api/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(t('adminPanel.admin.pagesManagement.errors.failedToUpdate', 'Failed to update page'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      resetForm();
      setEditingPage(null);
      toast({ title: t('common.success', 'Success'), description: t('adminPanel.admin.pagesManagement.toasts.updated', 'Page updated successfully') });
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/pages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      toast({ title: t('common.deleted', 'Deleted'), description: t('adminPanel.admin.pagesManagement.toasts.deleted', 'Page deleted successfully') });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const res = await fetch(`/api/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished }),
      });
      if (!res.ok) throw new Error(t('adminPanel.admin.pagesManagement.errors.failedToUpdateStatus', 'Failed to update status'));
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/pages'] }),
  });

  /* ---------------- HELPERS ---------------- */
  const resetForm = () => {
    setFormData({
      slug: '',
      title: '',
      content: '',
      metaTitle: '',
      metaDescription: '',
      isPublished: false,
    });
  };

  const generateSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const openEditDialog = (page: Page) => {
    setEditingPage(page);
    setFormData({
      slug: page.slug,
      title: page.title,
      content: page.content,
      metaTitle: page.metaTitle || '',
      metaDescription: page.metaDescription || '',
      isPublished: page.isPublished,
    });

    setTimeout(() => {
      editor?.commands.setContent(page.content || '');
    }, 0);
  };

  /* ================= UI ================= */
  return (
    <div className="p-6 space-y-6 dark:text-gray-200">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight ">{t('adminPanel.admin.pagesManagement.title', 'Page Management')}</h1>
          <p className="text-sm md:text-base text-muted-foreground ">{t('adminPanel.admin.pagesManagement.subtitle', 'Manage static CMS pages')}</p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            resetForm();
            setShowAddDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('adminPanel.admin.pagesManagement.addPage', 'Add Page')}
        </Button>
      </div>


      {/* TABLE */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <FileText className="h-5 w-5" /> {t('adminPanel.admin.pagesManagement.pages', 'Pages')}
          </CardTitle>
          <CardDescription>{t('adminPanel.admin.pagesManagement.allPages', 'All static pages')}</CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('adminPanel.admin.pagesManagement.table.title', 'Title')}</TableHead>
                  <TableHead>{t('adminPanel.admin.pagesManagement.table.slug', 'Slug')}</TableHead>
                  <TableHead>{t('common.status', 'Status')}</TableHead>
                  <TableHead>{t('adminPanel.admin.pagesManagement.table.updated', 'Updated')}</TableHead>
                  <TableHead className="text-right">{t('common.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page: Page) => (
                  <TableRow key={page.id}>
                    <TableCell>{page.title}</TableCell>
                    <TableCell>/{page.slug}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={page.isPublished}
                          onCheckedChange={(checked) =>
                            togglePublishMutation.mutate({
                              id: page.id,
                              isPublished: checked,
                            })
                          }
                        />
                        <Badge variant={page.isPublished ? 'default' : 'secondary'}>
                          {page.isPublished ? (
                            <>
                              <Eye className="h-3 w-3 mr-1" /> {t('adminPanel.admin.pagesManagement.status.published', 'Published')}
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3 mr-1" /> {t('adminPanel.admin.pagesManagement.status.draft', 'Draft')}
                            </>
                          )}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(page.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <a
                            href={`/pages/${page?.title}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>

                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(page)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePageMutation.mutate(page.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ADD / EDIT DIALOG */}
      <Dialog
        open={showAddDialog || !!editingPage}
        onOpenChange={() => {
          setShowAddDialog(false);
          setEditingPage(null);
          resetForm();
          editor?.commands.clearContent();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPage ? t('adminPanel.admin.pagesManagement.dialog.editTitle', 'Edit Page') : t('adminPanel.admin.pagesManagement.dialog.addTitle', 'Add Page')}</DialogTitle>
            <DialogDescription>{t('adminPanel.admin.pagesManagement.dialog.description', 'Manage page content & SEO')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('adminPanel.admin.pagesManagement.form.title', 'Page Title *')}</Label>
              <Input
                value={formData.title}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    title: e.target.value,
                    slug: generateSlug(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <Label>{t('adminPanel.admin.pagesManagement.form.slug', 'URL Slug *')}</Label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              />
            </div>

            {/* TipTap Editor */}
            <div>
              <Label>{t('adminPanel.admin.pagesManagement.form.content', 'Page Content *')}</Label>

              <div className="border rounded-md">
                {/* Toolbar */}
                <div className="flex gap-2 border-b p-2 bg-muted">
                  <Button size="icon" variant="ghost" onClick={() => editor?.chain().focus().toggleBold().run()}>
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => editor?.chain().focus().toggleItalic().run()}>
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                    <List className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                </div>

                <EditorContent
                  editor={editor}
                  className="prose max-w-none [&_.ProseMirror]:min-h-[300px] [&_.ProseMirror]:p-3"
                />
              </div>
            </div>

            <div>
              <Label>{t('adminPanel.admin.pagesManagement.form.metaTitle', 'Meta Title')}</Label>
              <Input
                value={formData.metaTitle}
                onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
              />
            </div>

            <div>
              <Label>{t('adminPanel.admin.pagesManagement.form.metaDescription', 'Meta Description')}</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm"
                rows={3}
                value={formData.metaDescription}
                onChange={(e) =>
                  setFormData({ ...formData, metaDescription: e.target.value })
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={formData.isPublished}
                onCheckedChange={(checked) => setFormData({ ...formData, isPublished: checked })}
              />
              <Label>{t('adminPanel.admin.pagesManagement.form.publishImmediately', 'Publish immediately')}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() =>
                editingPage
                  ? updatePageMutation.mutate({
                    id: editingPage.id,
                    payload: formData,
                  })
                  : addPageMutation.mutate(formData)
              }
            >
              {editingPage ? t('adminPanel.admin.pagesManagement.updatePage', 'Update Page') : t('adminPanel.admin.pagesManagement.createPage', 'Create Page')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
