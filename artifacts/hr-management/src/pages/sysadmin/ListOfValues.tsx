import { useState } from "react";
import { 
  useListLovCategories, 
  useCreateLovItem, 
  useUpdateLovItem, 
  useDeleteLovItem, 
  getListLovCategoriesQueryKey, 
  LovCategory, 
  LovItem 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings, Plus, Pencil, Trash2, ListOrdered } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const lovItemSchema = z.object({
  label: z.string().min(1, "Label is required"),
  value: z.string().min(1, "Value is required").regex(/^[a-z0-9_]+$/, "Value can only contain lowercase letters, numbers, and underscores"),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().default(0),
});

type LovItemFormValues = z.infer<typeof lovItemSchema>;

export default function ListOfValues() {
  const { data: categories, isLoading } = useListLovCategories();
  const createLovItem = useCreateLovItem();
  const updateLovItem = useUpdateLovItem();
  const deleteLovItem = useDeleteLovItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ category: string, item: LovItem | null } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ category: string, id: number } | null>(null);

  const form = useForm<LovItemFormValues>({
    resolver: zodResolver(lovItemSchema),
    defaultValues: {
      label: "",
      value: "",
      isActive: true,
      sortOrder: 0,
    },
  });

  const handleCreate = (category: string) => {
    setEditingItem({ category, item: null });
    form.reset({ label: "", value: "", isActive: true, sortOrder: 0 });
    setFormOpen(true);
  };

  const handleEdit = (category: string, item: LovItem) => {
    setEditingItem({ category, item });
    form.reset({
      label: item.label,
      value: item.value,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    });
    setFormOpen(true);
  };

  const handleDelete = () => {
    if (!deletingItem) return;
    
    deleteLovItem.mutate(
      { category: deletingItem.category, id: deletingItem.id },
      {
        onSuccess: () => {
          toast({ title: "Item deleted", description: "The list item has been removed." });
          queryClient.invalidateQueries({ queryKey: getListLovCategoriesQueryKey() });
          setDeletingItem(null);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to delete item." });
          setDeletingItem(null);
        }
      }
    );
  };

  const onSubmit = (data: LovItemFormValues) => {
    if (!editingItem) return;

    if (editingItem.item) {
      updateLovItem.mutate(
        { category: editingItem.category, id: editingItem.item.id, data: { label: data.label, isActive: data.isActive, sortOrder: data.sortOrder } },
        {
          onSuccess: () => {
            toast({ title: "Item updated", description: "The list item has been updated." });
            queryClient.invalidateQueries({ queryKey: getListLovCategoriesQueryKey() });
            setFormOpen(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to update item." });
          }
        }
      );
    } else {
      createLovItem.mutate(
        { category: editingItem.category, data },
        {
          onSuccess: () => {
            toast({ title: "Item created", description: "The list item has been added." });
            queryClient.invalidateQueries({ queryKey: getListLovCategoriesQueryKey() });
            setFormOpen(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Failed to create item. Value slug must be unique." });
          }
        }
      );
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">List of Values</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage dropdown options and categories across the system.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="grid gap-8">
          {categories.map((categoryGroup) => (
            <div key={categoryGroup.category} className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 border-b border-border/50 bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <ListOrdered className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{categoryGroup.label}</h2>
                    <p className="text-xs text-muted-foreground">Category key: <code className="bg-muted px-1 py-0.5 rounded text-foreground">{categoryGroup.category}</code></p>
                  </div>
                </div>
                <Button onClick={() => handleCreate(categoryGroup.category)} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Item
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="px-6 py-4 font-semibold w-[250px]">Label</th>
                      <th className="px-6 py-4 font-semibold">Value Key</th>
                      <th className="px-6 py-4 font-semibold w-[120px]">Status</th>
                      <th className="px-6 py-4 font-semibold w-[100px] text-right">Order</th>
                      <th className="px-6 py-4 font-semibold text-right w-[100px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {categoryGroup.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                          No items in this category yet.
                        </td>
                      </tr>
                    ) : (
                      categoryGroup.items.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
                        <tr key={item.id} className={`hover:bg-muted/20 transition-colors group ${!item.isActive ? "opacity-60" : ""}`}>
                          <td className="px-6 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${!item.isActive ? "text-muted-foreground" : "text-foreground"}`}>
                                {item.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 align-middle">
                            <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground border border-border/50">
                              {item.value}
                            </code>
                          </td>
                          <td className="px-6 py-3 align-middle">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border shadow-sm ${
                              item.isActive 
                                ? 'bg-secondary/10 text-secondary border-secondary/20' 
                                : 'bg-muted text-muted-foreground border-border/50'
                            }`}>
                              {item.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-3 align-middle text-right text-muted-foreground">
                            {item.sortOrder}
                          </td>
                          <td className="px-6 py-3 align-middle text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(categoryGroup.category, item)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeletingItem({ category: categoryGroup.category, id: item.id })}
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
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-xl p-12 text-center">
          <Settings className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-foreground">No categories found</h3>
          <p className="text-sm text-muted-foreground">There are no list of values categories available.</p>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingItem?.item ? "Edit Item" : "Add New Item"}</DialogTitle>
            <DialogDescription>
              {editingItem?.item 
                ? "Update the label, status, or sorting order." 
                : "Create a new dropdown option. The value key cannot be changed later."}
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
                    <FormControl>
                      <Input placeholder="e.g. Full Time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value Key</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g. full_time" 
                        {...field} 
                        disabled={!!editingItem?.item} 
                        className={editingItem?.item ? "bg-muted" : ""}
                      />
                    </FormControl>
                    <FormDescription>
                      A unique identifier for code use. Lowercase, numbers, underscores only.
                    </FormDescription>
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
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
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
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createLovItem.isPending || updateLovItem.isPending}>
                  {editingItem?.item ? "Save Changes" : "Create Item"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this option. Note that if this option is currently used by any records, deleting it may cause display issues in those records.
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
