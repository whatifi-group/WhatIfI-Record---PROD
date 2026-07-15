import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateRole,
  useUpdateRole,
  getListRolesQueryKey,
  Role,
  Permission
} from "@workspace/api-client-react";
import { PERMISSION_LABELS } from "@/lib/permissions";

const roleSchema = z.object({
  name: z.string().min(2, "Role name is required"),
  description: z.string().optional(),
  permissions: z.array(z.nativeEnum(Permission)).min(1, "At least one permission is required"),
});

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const isEditing = !!role;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const form = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
    },
  });

  useEffect(() => {
    if (open) {
      if (role) {
        form.reset({
          name: role.name,
          description: role.description || "",
          permissions: role.permissions,
        });
      } else {
        form.reset({
          name: "",
          description: "",
          permissions: [],
        });
      }
    }
  }, [open, role, form]);

  const onSubmit = (data: z.infer<typeof roleSchema>) => {
    if (isEditing && role) {
      updateRole.mutate({
        id: role.id,
        data: {
          name: data.name,
          description: data.description || null,
          permissions: data.permissions,
        }
      }, {
        onSuccess: () => {
          toast({ title: "Role updated successfully" });
          queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
          onOpenChange(false);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to update role" });
        }
      });
    } else {
      createRole.mutate({
        data: {
          name: data.name,
          description: data.description || undefined,
          permissions: data.permissions,
        }
      }, {
        onSuccess: () => {
          toast({ title: "Role created successfully" });
          queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
          onOpenChange(false);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to create role" });
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 bg-muted/30 border-b border-border">
          <DialogTitle className="text-xl font-display">{isEditing ? "Edit Role" : "Create Custom Role"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update role details and capabilities." : "Define a new access group and its capabilities."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-6 space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Department Manager" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Briefly describe the purpose of this role..." 
                        className="resize-none h-20"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <FormLabel>Capabilities</FormLabel>
                <span className="text-xs text-muted-foreground">{form.watch("permissions").length} selected</span>
              </div>
              <div className="bg-muted/10 p-4 rounded-lg border border-border/50">
                <FormField
                  control={form.control}
                  name="permissions"
                  render={() => (
                    <FormItem>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-4">
                        {Object.values(Permission).map((item) => (
                          <FormField
                            key={item}
                            control={form.control}
                            name="permissions"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={item}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(item)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, item])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== item
                                              )
                                            )
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal text-sm cursor-pointer leading-tight">
                                    {PERMISSION_LABELS[item]}
                                  </FormLabel>
                                </FormItem>
                              )
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage className="mt-4" />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-border mt-6 -mx-6 px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createRole.isPending || updateRole.isPending}>
                {isEditing ? "Save Changes" : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
