import { useState, useMemo } from "react";
import { 
  useListDepartments, 
  useCreateDepartment, 
  useUpdateDepartment, 
  useDeleteDepartment,
  useListEmployees,
  getListDepartmentsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus, Building2, Pencil, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const departmentSchema = z.object({
  name: z.string().min(1, "Department name is required"),
  description: z.string().optional(),
  headEmployeeId: z.coerce.number().optional().nullable(),
});

type DepartmentFormValues = z.infer<typeof departmentSchema>;

export default function DepartmentsList() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: departments, isLoading } = useListDepartments();
  const { data: employees } = useListEmployees();
  
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: "",
      description: "",
      headEmployeeId: null,
    },
  });

  const editForm = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),
  });

  const onSubmitCreate = (data: DepartmentFormValues) => {
    createDepartment.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Department created", description: "Successfully created new department." });
          queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Failed to create department", variant: "destructive" });
        },
      }
    );
  };

  const onSubmitEdit = (data: DepartmentFormValues) => {
    if (!editingDeptId) return;
    updateDepartment.mutate(
      { id: editingDeptId, data },
      {
        onSuccess: () => {
          toast({ title: "Department updated", description: "Successfully saved department details." });
          queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
          setEditingDeptId(null);
        },
        onError: () => {
          toast({ title: "Update failed", variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteDepartment.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Department deleted", description: "Department has been deleted." });
          queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
        },
        onError: () => {
          toast({ title: "Deletion failed", description: "Make sure no employees are assigned to this department first.", variant: "destructive" });
        },
      }
    );
  };

  const openEdit = (dept: any) => {
    editForm.reset({
      name: dept.name,
      description: dept.description || "",
      headEmployeeId: dept.headEmployeeId,
    });
    setEditingDeptId(dept.id);
  };

  const filteredDepartments = useMemo(() => {
    if (!departments) return [];
    return departments.filter(d => 
      search === "" || d.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [departments, search]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Departments</h1>
          <p className="text-muted-foreground mt-1">Manage organizational departments and team leads.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 hover-elevate">
              <Plus className="w-4 h-4 mr-2" /> Add Department
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Add Department</DialogTitle>
              <DialogDescription>Create a new department for employees to join.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4 pt-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Department Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Mission / Description</FormLabel><FormControl><Textarea {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="headEmployeeId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department Head</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Assign leader" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Leader Assigned</SelectItem>
                        {employees?.map((e) => (
                          <SelectItem key={e.id} value={e.id.toString()}>{e.firstName} {e.lastName} ({e.jobTitle})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={createDepartment.isPending}>
                    {createDepartment.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Create Department
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <Input 
          placeholder="Filter departments by name..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md bg-card border-border/50"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredDepartments.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-xl p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-display font-medium text-foreground mb-1">No departments found</h3>
          <p className="text-muted-foreground max-w-sm">There are no departments matching your criteria, or none have been established yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDepartments.map((dept, idx) => {
            const headEmployee = employees?.find(e => e.id === dept.headEmployeeId);
            return (
              <Card key={dept.id} className="border-border/50 shadow-sm hover-elevate transition-all flex flex-col" style={{ animationDelay: `${idx * 50}ms` }}>
                <CardHeader className="pb-3 border-b border-border/30 bg-muted/10">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{dept.name}</CardTitle>
                      <CardDescription className="line-clamp-2 mt-1 min-h-[40px]">
                        {dept.description || "No mission description provided."}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 flex-1 flex flex-col">
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center"><Users className="w-4 h-4 mr-2" /> Headcount</span>
                      <span className="font-medium">{dept.employeeCount} employees</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Leader</span>
                      <span className="font-medium truncate max-w-[150px]">
                        {headEmployee ? `${headEmployee.firstName} ${headEmployee.lastName}` : "Unassigned"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-6 mt-auto border-t border-border/30">
                    <Dialog open={editingDeptId === dept.id} onOpenChange={(open) => !open && setEditingDeptId(null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => openEdit(dept)}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="font-display text-2xl">Edit Department</DialogTitle>
                        </DialogHeader>
                        <Form {...editForm}>
                          <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4 pt-4">
                            <FormField control={editForm.control} name="name" render={({ field }) => (
                              <FormItem><FormLabel>Department Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={editForm.control} name="description" render={({ field }) => (
                              <FormItem><FormLabel>Mission / Description</FormLabel><FormControl><Textarea {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={editForm.control} name="headEmployeeId" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Department Head</FormLabel>
                                <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                                  <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Assign leader" /></SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">No Leader Assigned</SelectItem>
                                    {employees?.map((e) => (
                                      <SelectItem key={e.id} value={e.id.toString()}>{e.firstName} {e.lastName} ({e.jobTitle})</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <DialogFooter className="pt-4">
                              <Button type="submit" disabled={updateDepartment.isPending}>
                                {updateDepartment.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Save Changes
                              </Button>
                            </DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Department??</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the "{dept.name}" department. You can only do this if no employees are currently assigned to it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(dept.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
