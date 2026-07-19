import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useListLovCategories,
  useCreateLovItem,
  useUpdateLovItem,
  useDeleteLovItem,
  getListLovCategoriesQueryKey,
  LovItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, ListOrdered, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useViewDuration } from "@/hooks/use-view-duration";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const lovItemSchema = z.object({
  label: z.string().min(1, "Label is required"),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().default(0),
});

type LovItemFormValues = z.infer<typeof lovItemSchema>;

export default function LovCategoryDetail() {
  const { category } = useParams<{ category: string }>();
  const { data: categories, isLoading } = useListLovCategories();
  const categoryGroup = categories?.find((c) => c.category === category);
  useViewDuration(
    "sysadmin",
    `/sysadmin/lov/${category}`,
    Boolean(category),
    categoryGroup?.label ?? null,
  );
  const createLovItem = useCreateLovItem();
  const updateLovItem = useUpdateLovItem();
  const deleteLovItem = useDeleteLovItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LovItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<number | null>(null);

  const form = useForm<LovItemFormValues>({
    resolver: zodResolver(lovItemSchema),
    defaultValues: { label: "", isActive: true, sortOrder: 0 },
  });

  const handleCreate = () => {
    setEditingItem(null);
    form.reset({ label: "", isActive: true, sortOrder: 0 });
    setFormOpen(true);
  };

  const handleEdit = (item: LovItem) => {
    setEditingItem(item);
    form.reset({ label: item.label, isActive: item.isActive, sortOrder: item.sortOrder });
    setFormOpen(true);
  };

  const handleDelete = () => {
    if (deletingItem === null || !category) return;
    deleteLovItem.mutate(
      { category, id: deletingItem },
      {
        onSuccess: () => {
          toast({ title: "Item deleted", description: "The list item has been removed." });
          queryClient.invalidateQueries({ queryKey: getListLovCategoriesQueryKey() });
          setDeletingItem(null);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to delete item." });
          setDeletingItem(null);
        },
      }
    );
  };

  const onSubmit = (data: LovItemFormValues) => {
    if (!category) return;
    if (editingItem) {
      updateLovItem.mutate(
        { category, id: editingItem.id, data: { label: data.label, isActive: data.isActive, sortOrder: data.sortOrder } },
        {
          onSuccess: () => {
            toast({ title: "Item updated", description: "The list item has been updated." });
            queryClient.invalidateQueries({ queryKey: getListLovCategoriesQueryKey() });
            setFormOpen(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to update item." });
          },
        }
      );
    } else {
      createLovItem.mutate(
        { category, data },
        {
          onSuccess: () => {
            toast({ title: "Item created", description: "The list item has been added." });
            queryClient.invalidateQueries({ queryKey: getListLovCategoriesQueryKey() });
            setFormOpen(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to create item. Make sure the label contains at least one letter or number." });
          },
        }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!categoryGroup) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Link href="/sysadmin/lov" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to List of Values
        </Link>
        <div className="bg-card border border-border/50 rounded-xl p-12 text-center">
          <Settings className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-foreground">Category not found</h3>
          <p className="text-sm text-muted-foreground">The requested category does not exist.</p>
        </div>
      </div>
    );
  }

  const sortedItems = [...categoryGroup.items].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Breadcrumb */}
      <Link href="/sysadmin/lov" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to List of Values
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <ListOrdered className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">{categoryGroup.label}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sortedItems.length} {sortedItems.length === 1 ? "item" : "items"}
            </p>
          </div>
        </div>
        <Button onClick={handleCreate} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      {/* Items table */}
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-semibold">Label</th>
                <th className="px-6 py-4 font-semibold w-[120px]">Status</th>
                <th className="px-6 py-4 font-semibold text-right w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-10 text-center text-muted-foreground text-sm">
                    No items in this category yet. Click "Add Item" to get started.
                  </td>
                </tr>
              ) : (
                sortedItems.map((item) => (
                  <tr key={item.id} className={`hover:bg-muted/20 transition-colors ${!item.isActive ? "opacity-60" : ""}`}>
                    <td className="px-6 py-3 align-middle">
                      <span className={`font-medium ${!item.isActive ? "text-muted-foreground" : "text-foreground"}`}>
                        {item.label}
                      </span>
                    </td>
                    <td className="px-6 py-3 align-middle">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border shadow-sm ${
                        item.isActive
                          ? "bg-secondary/10 text-secondary border-secondary/20"
                          : "bg-muted text-muted-foreground border-border/50"
                      }`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-3 align-middle text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}>
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update the label, status, or sorting order."
                : "Fill in the label and adjust settings below."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Label</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-4">
                <FormField
                  control={form.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex-1 flex flex-col justify-end pb-2">
                      <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createLovItem.isPending || updateLovItem.isPending}>
                  {editingItem ? "Save Changes" : "Create Item"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deletingItem !== null} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this option. If this option is currently used by any records, deleting it may cause display issues in those records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
