import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useListEmployees, useListDepartments, useCreateEmployee, getListEmployeesQueryKey, useListLovItems } from "@workspace/api-client-react";
import { EmployeeStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Search, Plus, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  jobTitle: z.string().min(1, "Job title is required"),
  departmentId: z.coerce.number().optional().nullable(),
  employmentType: z.string().min(1, "Engagement type is required"),
  status: z.string().min(1, "Status is required"),
  startDate: z.string().min(1, "Start date is required"),
  salary: z.coerce.number().optional().nullable(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export default function EmployeesList() {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: employees, isLoading } = useListEmployees();
  const { data: departments } = useListDepartments();
  const { data: employmentTypes } = useListLovItems("employment_type");
  const { data: employeeStatuses } = useListLovItems("employee_status");
  const createEmployee = useCreateEmployee();

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      jobTitle: "",
      departmentId: null,
      employmentType: "full_time",
      status: EmployeeStatus.active,
      startDate: new Date().toISOString().split("T")[0],
      salary: null,
    },
  });

  const onSubmit = (data: EmployeeFormValues) => {
    createEmployee.mutate(
      { data: { ...data, status: data.status as EmployeeStatus } },
      {
        onSuccess: () => {
          toast({ title: "Employee added", description: "Successfully added new team member." });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Failed to add employee", description: "Please check your inputs and try again.", variant: "destructive" });
        },
      }
    );
  };

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) => {
      if (emp.status !== EmployeeStatus.active) return false;

      const matchesSearch = search === "" || 
        emp.firstName.toLowerCase().includes(search.toLowerCase()) || 
        emp.lastName.toLowerCase().includes(search.toLowerCase()) ||
        emp.email.toLowerCase().includes(search.toLowerCase()) ||
        emp.jobTitle.toLowerCase().includes(search.toLowerCase());
        
      const matchesDept = departmentFilter === "all" || emp.departmentId === parseInt(departmentFilter);
      
      return matchesSearch && matchesDept;
    });
  }, [employees, search, departmentFilter]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Employee Directory</h1>
          <p className="text-muted-foreground mt-1">Manage WhatIfI Group employees.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 hover-elevate">
              <Plus className="w-4 h-4 mr-2" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Add New Employee</DialogTitle>
              <DialogDescription>Add a new employee. They will be visible in the directory immediately.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="jobTitle" render={({ field }) => (
                    <FormItem className="md:col-span-2"><FormLabel>Role / Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <FormField control={form.control} name="departmentId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Department</SelectItem>
                          {departments?.map((d) => (
                            <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="employmentType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Engagement Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employmentTypes?.filter(t => t.isActive).map(type => (
                            <SelectItem key={type.id} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employeeStatuses?.filter(s => s.isActive).map(s => (
                            <SelectItem key={s.id} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="startDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="salary" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Compensation (Optional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createEmployee.isPending}>
                    {createEmployee.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Add Employee
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, role, or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border/50"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-background">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex justify-center items-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-display font-medium text-foreground mb-1">No employees found</h3>
            <p className="text-muted-foreground max-w-sm">Try adjusting your filters or search terms to find who you're looking for.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-[300px]">Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee, idx) => (
                  <TableRow 
                    key={employee.id} 
                    className="group border-border/30 hover:bg-muted/10 transition-colors cursor-pointer"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-bold uppercase shrink-0">
                          {employee.firstName[0]}{employee.lastName[0]}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <Link
                            href={`/employees/${employee.id}`}
                            className="font-medium text-foreground truncate hover:text-primary transition-colors"
                          >
                            {employee.firstName} {employee.lastName}
                          </Link>
                          <span className="text-xs text-muted-foreground truncate">{employee.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {format(new Date(employee.startDate), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}