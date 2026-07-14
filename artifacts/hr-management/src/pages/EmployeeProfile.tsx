import { useState, useRef, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { 
  useGetEmployee, 
  useUpdateEmployee, 
  useDeleteEmployee, 
  getGetEmployeeQueryKey,
  useListDepartments,
  getListEmployeesQueryKey,
  useListLovItems
} from "@workspace/api-client-react";
import { EmployeeStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, ArrowLeft, Mail, Phone, Calendar, Briefcase, Building2, Pencil, Save, X, Trash2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const employeeUpdateSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().nullable(),
  jobTitle: z.string().min(1, "Job title is required"),
  departmentId: z.coerce.number().optional().nullable(),
  employmentType: z.string().min(1, "Engagement type is required"),
  status: z.enum([EmployeeStatus.active, EmployeeStatus.inactive, EmployeeStatus.on_leave]),
  startDate: z.string().min(1, "Start date is required"),
  salary: z.coerce.number().optional().nullable(),
});

type EmployeeUpdateValues = z.infer<typeof employeeUpdateSchema>;

export default function EmployeeProfile() {
  const { id } = useParams();
  const employeeId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);

  const { data: employee, isLoading, isError } = useGetEmployee(employeeId, { 
    query: { enabled: !!employeeId, queryKey: getGetEmployeeQueryKey(employeeId) } 
  });
  const { data: departments } = useListDepartments();
  const { data: employmentTypes } = useListLovItems("employment_type");
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const form = useForm<EmployeeUpdateValues>({
    resolver: zodResolver(employeeUpdateSchema),
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

  const initializedRef = useRef<number | null>(null);

  useEffect(() => {
    if (employee && initializedRef.current !== employeeId) {
      initializedRef.current = employeeId;
      form.reset({
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone || "",
        jobTitle: employee.jobTitle,
        departmentId: employee.departmentId,
        employmentType: employee.employmentType,
        status: employee.status,
        startDate: employee.startDate.split("T")[0],
        salary: employee.salary,
      });
    }
  }, [employee, employeeId, form]);

  const onSubmit = (data: EmployeeUpdateValues) => {
    updateEmployee.mutate(
      { id: employeeId, data },
      {
        onSuccess: (updatedData) => {
          toast({ title: "Profile updated", description: "Employee details have been saved." });
          queryClient.setQueryData(getGetEmployeeQueryKey(employeeId), updatedData);
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          setIsEditing(false);
        },
        onError: () => {
          toast({ title: "Update failed", description: "Could not save changes.", variant: "destructive" });
        }
      }
    );
  };

  const handleDelete = () => {
    deleteEmployee.mutate(
      { id: employeeId },
      {
        onSuccess: () => {
          toast({ title: "Employee removed", description: "The profile has been deleted." });
          queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          setLocation("/employees");
        },
        onError: () => {
          toast({ title: "Deletion failed", description: "Could not remove this profile.", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Loading profile...</p>
      </div>
    );
  }

  if (isError || !employee) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center space-y-4 text-center">
        <ShieldAlert className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-display font-semibold">Profile Not Found</h2>
        <p className="text-muted-foreground max-w-md">The requested employee profile does not exist or you lack permission to view it.</p>
        <Button variant="outline" onClick={() => setLocation("/employees")}>Return to Directory</Button>
      </div>
    );
  }

  const initials = `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase();

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <Link href="/employees" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Directory
      </Link>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Profile Sidebar */}
        <div className="w-full md:w-1/3 space-y-6">
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="h-24 bg-gradient-to-br from-primary/80 to-secondary/80" />
            <CardContent className="pt-0 relative px-6 pb-6 text-center">
              <div className="w-24 h-24 rounded-full border-4 border-card bg-muted mx-auto -mt-12 flex items-center justify-center text-3xl font-display font-bold text-primary shadow-sm">
                {initials}
              </div>
              <h2 className="text-xl font-display font-bold text-foreground mt-4">{employee.firstName} {employee.lastName}</h2>
              <p className="text-sm font-medium text-muted-foreground">{employee.jobTitle}</p>
              
              <div className="mt-4 flex justify-center">
                <Badge variant={employee.status === EmployeeStatus.active ? "default" : "secondary"} className={
                  employee.status === EmployeeStatus.active ? "bg-secondary hover:bg-secondary/90 text-white" : 
                  employee.status === EmployeeStatus.on_leave ? "bg-chart-4 hover:bg-chart-4/90 text-white" : ""
                }>
                  {employee.status.replace("_", " ").toUpperCase()}
                </Badge>
              </div>

              <div className="mt-6 space-y-3 text-sm text-left">
                <div className="flex items-center text-muted-foreground">
                  <Mail className="w-4 h-4 mr-3 shrink-0" />
                  <a href={`mailto:${employee.email}`} className="truncate hover:text-primary transition-colors">{employee.email}</a>
                </div>
                {employee.phone && (
                  <div className="flex items-center text-muted-foreground">
                    <Phone className="w-4 h-4 mr-3 shrink-0" />
                    <span>{employee.phone}</span>
                  </div>
                )}
                <div className="flex items-center text-muted-foreground">
                  <Briefcase className="w-4 h-4 mr-3 shrink-0" />
                  <span className="capitalize">{employee.employmentType.replace("_", " ")}</span>
                </div>
                <div className="flex items-center text-muted-foreground">
                  <Building2 className="w-4 h-4 mr-3 shrink-0" />
                  <span>{employee.departmentName || "No Department"}</span>
                </div>
                <div className="flex items-center text-muted-foreground">
                  <Calendar className="w-4 h-4 mr-3 shrink-0" />
                  <span>Joined {format(new Date(employee.startDate), "MMM d, yyyy")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {!isEditing && (
            <div className="flex flex-col gap-3">
              <Button onClick={() => setIsEditing(true)} className="w-full" variant="outline">
                <Pencil className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4 mr-2" /> Remove Employee
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {employee.firstName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove {employee.firstName} {employee.lastName} from the system. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 w-full">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
              <div>
                <CardTitle className="text-xl">Employee Details</CardTitle>
                <CardDescription>Comprehensive personnel information</CardDescription>
              </div>
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                    <X className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-6">
              {isEditing ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
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
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {employmentTypes?.filter(t => t.isActive || t.value === field.value).map(type => (
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
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={EmployeeStatus.active}>Active</SelectItem>
                              <SelectItem value={EmployeeStatus.on_leave}>On Leave</SelectItem>
                              <SelectItem value={EmployeeStatus.inactive}>Inactive</SelectItem>
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
                          <FormLabel>Compensation</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    
                    <div className="flex justify-end border-t border-border/50 pt-4 mt-6">
                      <Button type="submit" disabled={updateEmployee.isPending}>
                        {updateEmployee.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Changes
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Full Name</h3>
                    <p className="text-base font-medium">{employee.firstName} {employee.lastName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Email Address</h3>
                    <p className="text-base font-medium">{employee.email}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Phone Number</h3>
                    <p className="text-base font-medium">{employee.phone || "Not provided"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Role / Title</h3>
                    <p className="text-base font-medium">{employee.jobTitle}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Department</h3>
                    <p className="text-base font-medium">{employee.departmentName || "Unassigned"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Engagement Type</h3>
                    <p className="text-base font-medium capitalize">{employee.employmentType.replace("_", " ")}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Start Date</h3>
                    <p className="text-base font-medium">{format(new Date(employee.startDate), "MMMM d, yyyy")}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Compensation</h3>
                    <p className="text-base font-medium">{employee.salary ? `$${employee.salary.toLocaleString()}` : "Confidential"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
