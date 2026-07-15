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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListRoles,
  useCreateUser,
  useUpdateUser,
  getListUsersQueryKey,
  User,
  UserStatus,
  Permission,
} from "@workspace/api-client-react";

const PERMISSION_LABELS: Record<Permission, string> = {
  sysadmin: "System Administrator",
  hr_admin: "HR Administrator",
  view_employees: "View Employees",
  edit_employees: "Edit Employees",
  delete_employees: "Delete Employees",
  view_departments: "View Departments",
  edit_departments: "Edit Departments",
  view_leave: "View Leave",
  manage_leave: "Manage Leave",
  view_reports: "View Reports",
  view_payroll: "View Payroll & Pay Rates",
};

const userSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().optional(),
  roleId: z.coerce.number().min(1, "Role is required"),
  status: z.nativeEnum(UserStatus).default(UserStatus.active),
  permissions: z.array(z.nativeEnum(Permission)).default([]),
});

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const isEditing = !!user;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: roles } = useListRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      roleId: 0,
      status: UserStatus.active,
      permissions: [],
    },
  });

  useEffect(() => {
    if (open) {
      if (user) {
        form.reset({
          name: user.name,
          email: user.email,
          password: "",
          roleId: user.roleId,
          status: user.status,
          permissions: user.permissions,
        });
      } else {
        form.reset({
          name: "",
          email: "",
          password: "",
          roleId: roles && roles.length > 0 ? roles[0].id : 0,
          status: UserStatus.active,
          permissions: [],
        });
      }
    }
  }, [open, user, form, roles]);

  const onSubmit = (data: z.infer<typeof userSchema>) => {
    if (!isEditing && !data.password) {
      form.setError("password", { type: "manual", message: "Password is required for new accounts" });
      return;
    }

    if (isEditing && user) {
      updateUser.mutate(
        {
          id: user.id,
          data: {
            name: data.name,
            email: data.email,
            status: data.status,
            roleId: data.roleId,
            permissions: data.permissions.length > 0 ? data.permissions : undefined,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "User updated successfully" });
            queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Failed to update user" });
          },
        },
      );
    } else {
      createUser.mutate(
        {
          data: {
            name: data.name,
            email: data.email,
            password: data.password!,
            roleId: data.roleId,
            isSystemAccount: true,
            permissions: data.permissions.length > 0 ? data.permissions : undefined,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "System account created" });
            queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Failed to create system account" });
          },
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 bg-muted/30 border-b border-border">
          <DialogTitle className="text-xl font-display">
            {isEditing ? "Edit User" : "Add System Account"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update user details and access levels."
              : "Create a system account for administrators or service users. Employee accounts are created automatically when adding an employee."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="jane@whatifi.group" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value ? field.value.toString() : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles?.map((role) => (
                          <SelectItem key={role.id} value={role.id.toString()}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UserStatus.active}>Active</SelectItem>
                        <SelectItem value={UserStatus.inactive}>Inactive</SelectItem>
                        <SelectItem value={UserStatus.suspended}>Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? "New Password (Optional)" : "Password"}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={isEditing ? "Leave blank to keep current" : "Secure password"}
                      type="password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3 pt-2">
              <FormLabel>Individual Permission Overrides (Optional)</FormLabel>
              <div className="text-xs text-muted-foreground mb-3">
                Permissions granted here combine with the user's role. Typically leave blank and rely on roles.
              </div>
              <div className="grid grid-cols-2 gap-3 bg-muted/10 p-4 rounded-lg border border-border/50 h-[180px] overflow-y-auto">
                <FormField
                  control={form.control}
                  name="permissions"
                  render={() => (
                    <>
                      {Object.values(Permission).map((item) => (
                        <FormField
                          key={item}
                          control={form.control}
                          name="permissions"
                          render={({ field }) => (
                            <FormItem
                              key={item}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item)}
                                  onCheckedChange={(checked) =>
                                    checked
                                      ? field.onChange([...field.value, item])
                                      : field.onChange(field.value?.filter((v) => v !== item))
                                  }
                                />
                              </FormControl>
                              <FormLabel className="font-normal text-sm cursor-pointer">
                                {PERMISSION_LABELS[item]}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-border mt-6 -mx-6 px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                {isEditing ? "Save Changes" : "Create System Account"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
