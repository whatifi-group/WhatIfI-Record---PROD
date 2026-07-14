import { useState } from "react";
import { useListRoles, useDeleteRole, getListRolesQueryKey, Role } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shield, Plus, MoreHorizontal, Pencil, Trash2, Lock, Info } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { RoleFormDialog } from "@/components/sysadmin/RoleFormDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function RolesList() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  
  const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null);
  
  const { data: roles, isLoading } = useListRoles();
  const deleteRole = useDeleteRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleEdit = (role: Role) => {
    if (role.isSystem) return;
    setEditingRole(role);
    setIsFormOpen(true);
  };

  const handleCreate = () => {
    setEditingRole(null);
    setIsFormOpen(true);
  };

  const handleDelete = () => {
    if (!deletingRoleId) return;
    
    deleteRole.mutate({ id: deletingRoleId }, {
      onSuccess: () => {
        toast({
          title: "Role deleted",
          description: "The role has been successfully removed.",
        });
        queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
        setDeletingRoleId(null);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to delete role. Ensure no users are assigned to it.",
        });
        setDeletingRoleId(null);
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Role Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Define permissions and access levels across the organization.</p>
        </div>
        <Button onClick={handleCreate} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Create Custom Role
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-semibold w-[250px]">Role Details</th>
                <th className="px-6 py-4 font-semibold">Permissions</th>
                <th className="px-6 py-4 font-semibold text-center w-[120px]">Users</th>
                <th className="px-6 py-4 font-semibold text-right w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  </td>
                </tr>
              ) : roles && roles.length > 0 ? (
                roles.map((role, idx) => (
                  <tr key={role.id} className="hover:bg-muted/20 transition-colors group animate-in fade-in slide-in-from-bottom-2 fill-mode-both" style={{ animationDelay: `${idx * 50}ms` }}>
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-base">{role.name}</span>
                          {role.isSystem && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="bg-primary/10 text-primary p-1 rounded">
                                    <Lock className="w-3 h-3" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>System role. Cannot be edited or deleted.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        {role.description && (
                          <div className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">
                            {role.description}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground/70 mt-2">
                          Created {format(new Date(role.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-wrap gap-1.5 max-w-[400px]">
                        {role.permissions.map((perm) => (
                          <span 
                            key={perm} 
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-foreground border border-border/50 shadow-sm"
                          >
                            {perm.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-center">
                      <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary/10 text-secondary font-bold text-xs border border-secondary/20 shadow-sm">
                        {role.userCount}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-right">
                      {!role.isSystem && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px]">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleEdit(role)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit Role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onClick={() => setDeletingRoleId(role.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-foreground">No roles found</h3>
                    <p className="text-sm text-muted-foreground">Get started by creating custom roles.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RoleFormDialog 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
        role={editingRole} 
      />

      <AlertDialog open={!!deletingRoleId} onOpenChange={(open) => !open && setDeletingRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom role?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any users assigned to this role must be reassigned
              first. Are you sure you want to delete this role?
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
