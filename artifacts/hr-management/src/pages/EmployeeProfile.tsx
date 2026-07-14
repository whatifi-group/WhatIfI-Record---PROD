import { useState, useRef, useEffect } from "react";
import { useParams, useLocation, useSearch, Link } from "wouter";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, ArrowLeft, Mail, Phone, Calendar, Briefcase, Building2, Pencil, Save, X, Trash2, ShieldAlert, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

import EmployeeAddressesTab from "./employee-tabs/EmployeeAddressesTab";
import MarkAsLeaverDialog from "./MarkAsLeaverDialog";
import EmployeePayrollTab from "./employee-tabs/EmployeePayrollTab";
import EmployeeAttachmentsTab from "./employee-tabs/EmployeeAttachmentsTab";
import EmployeeMedicalTab from "./employee-tabs/EmployeeMedicalTab";
import EmployeeDietaryTab from "./employee-tabs/EmployeeDietaryTab";
import EmployeeNextOfKinTab from "./employee-tabs/EmployeeNextOfKinTab";
import EmployeeQualificationsTab from "./employee-tabs/EmployeeQualificationsTab";
import EmployeeWorkRecordsTab from "./employee-tabs/EmployeeWorkRecordsTab";

const employeeUpdateSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().nullable(),
  jobTitle: z.string().min(1, "Job title is required"),
  departmentId: z.coerce.number().optional().nullable(),
  employmentType: z.string().min(1, "Engagement type is required"),
  status: z.string().min(1, "Status is required"),
  startDate: z.string().min(1, "Start date is required"),
});

type EmployeeUpdateValues = z.infer<typeof employeeUpdateSchema>;

const VALID_TABS = ["details","addresses","payroll","attachments","medical","dietary","next-of-kin","qualifications","work-record"] as const;

export default function EmployeeProfile() {
  const { id } = useParams();
  const employeeId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const initialTab = VALID_TABS.includes(tabParam as typeof VALID_TABS[number]) ? tabParam! : "details";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit_employees');
  const canDelete = hasPermission('sysadmin');
  const canViewPayroll = hasPermission('view_payroll') || hasPermission('sysadmin');

  const [isEditing, setIsEditing] = useState(canEdit);
  const [isMarkingLeaver, setIsMarkingLeaver] = useState(false);

  const { data: employee, isLoading, isError } = useGetEmployee(employeeId, { 
    query: { enabled: !!employeeId, queryKey: getGetEmployeeQueryKey(employeeId) } 
  });
  const { data: departments } = useListDepartments();
  const { data: employmentTypes } = useListLovItems("employment_type");
  const { data: employeeStatuses } = useListLovItems("employee_status");
  const { data: leaverReasons } = useListLovItems("leaver_reason");
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
      status: "active",
      startDate: new Date().toISOString().split("T")[0],
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
        status: employee.status as EmployeeStatus,
        startDate: employee.startDate.split("T")[0],
      });
    }
  }, [employee, employeeId, form]);

  const onSubmit = (data: EmployeeUpdateValues) => {
    updateEmployee.mutate(
      { id: employeeId, data: { ...data, status: data.status as EmployeeStatus } },
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
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <Link href="/employees" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Directory
      </Link>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Profile Sidebar */}
        <div className="w-full md:w-72 shrink-0 space-y-4">
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="h-20 bg-gradient-to-br from-primary/80 to-secondary/80" />
            <CardContent className="pt-0 relative px-6 pb-6 text-center">
              <div className="w-20 h-20 rounded-full border-4 border-card bg-muted mx-auto -mt-10 flex items-center justify-center text-2xl font-display font-bold text-primary shadow-sm">
                {initials}
              </div>
              <h2 className="text-lg font-display font-bold text-foreground mt-3">{employee.firstName} {employee.lastName}</h2>
              <p className="text-sm font-medium text-muted-foreground">{employee.jobTitle}</p>
              
              <div className="mt-3 flex justify-center">
                <Badge
                  variant={employee.status === EmployeeStatus.active ? "default" : "secondary"}
                  className={
                    employee.status === EmployeeStatus.active ? "bg-secondary hover:bg-secondary/90 text-white" :
                    employee.status === EmployeeStatus.on_leave ? "bg-chart-4 hover:bg-chart-4/90 text-white" :
                    employee.status === EmployeeStatus.leaver ? "bg-destructive/80 hover:bg-destructive/70 text-white" : ""
                  }
                >
                  {employee.status.replace(/_/g, " ").toUpperCase()}
                </Badge>
              </div>

              <div className="mt-5 space-y-2.5 text-sm text-left">
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

              {/* Leaver info in sidebar */}
              {employee.status === EmployeeStatus.leaver && (
                <div className="mt-4 pt-4 border-t border-border/50 space-y-2 text-sm text-left">
                  {employee.leaverDate && (
                    <div className="flex items-center text-muted-foreground">
                      <LogOut className="w-4 h-4 mr-3 shrink-0 text-destructive/60" />
                      <span>Left {format(new Date(employee.leaverDate), "MMM d, yyyy")}</span>
                    </div>
                  )}
                  {employee.leaverReason && (
                    <div className="flex items-start text-muted-foreground">
                      <span className="w-4 h-4 mr-3 shrink-0" />
                      <span className="capitalize">
                        {leaverReasons?.find(r => r.value === employee.leaverReason)?.label ?? employee.leaverReason.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {/* Mark as Leaver — edit_employees on active/on_leave employees */}
            {canEdit && (employee.status === EmployeeStatus.active || employee.status === EmployeeStatus.on_leave) && (
              <Button
                variant="ghost"
                className="w-full text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => setIsMarkingLeaver(true)}
              >
                <LogOut className="w-4 h-4 mr-2" /> Mark as Leaver
              </Button>
            )}

            {/* Permanent delete — sysadmin only */}
            {canDelete && (
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
            )}
          </div>

          {/* Mark as Leaver dialog */}
          <MarkAsLeaverDialog
            open={isMarkingLeaver}
            onClose={() => setIsMarkingLeaver(false)}
            employeeId={employeeId}
            employeeName={`${employee.firstName} ${employee.lastName}`}
            onSuccess={() => setIsMarkingLeaver(false)}
          />
        </div>

        {/* Main Content — Tabbed */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue={initialTab}>
            <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/60 p-1 mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="addresses">Addresses</TabsTrigger>
              {canViewPayroll && <TabsTrigger value="payroll">Payroll</TabsTrigger>}
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <TabsTrigger value="medical">Medical</TabsTrigger>
              <TabsTrigger value="dietary">Dietary</TabsTrigger>
              <TabsTrigger value="next-of-kin">Next of Kin</TabsTrigger>
              <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
              <TabsTrigger value="work-record">Work Record</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  {isEditing ? (
                    <>
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-semibold text-foreground">Edit Details</h3>
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                          <X className="w-4 h-4 mr-1" /> Cancel
                        </Button>
                      </div>
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
                                    {employeeStatuses?.filter(s => (s.isActive || s.value === field.value) && s.value !== 'leaver').map(s => (
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
                            
                          </div>
                          
                          <div className="flex justify-end border-t border-border/50 pt-4 mt-6">
                            <Button type="submit" disabled={updateEmployee.isPending}>
                              {updateEmployee.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                              Save Changes
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </>
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
                      {employee.status === EmployeeStatus.leaver && (
                        <>
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Leaver Reason</h3>
                            <p className="text-base font-medium">
                              {leaverReasons?.find(r => r.value === employee.leaverReason)?.label
                                ?? (employee.leaverReason?.replace(/_/g, " ") || "Not recorded")}
                            </p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Leaving Date</h3>
                            <p className="text-base font-medium">
                              {employee.leaverDate ? format(new Date(employee.leaverDate), "MMMM d, yyyy") : "Not recorded"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="addresses">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <EmployeeAddressesTab employeeId={employeeId} />
                </CardContent>
              </Card>
            </TabsContent>

            {canViewPayroll ? (
              <TabsContent value="payroll">
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="pt-6">
                    <EmployeePayrollTab employeeId={employeeId} />
                  </CardContent>
                </Card>
              </TabsContent>
            ) : (
              <TabsContent value="payroll">
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="pt-6 flex flex-col items-center justify-center py-16 text-center">
                    <ShieldAlert className="w-10 h-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">You don't have permission to view payroll information.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent value="attachments">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <EmployeeAttachmentsTab employeeId={employeeId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="medical">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <EmployeeMedicalTab employeeId={employeeId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dietary">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <EmployeeDietaryTab employeeId={employeeId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="next-of-kin">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <EmployeeNextOfKinTab employeeId={employeeId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="qualifications">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <EmployeeQualificationsTab employeeId={employeeId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="work-record">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <EmployeeWorkRecordsTab employeeId={employeeId} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
