import { useState, useMemo } from "react";
import { 
  useListLeaveRequests, 
  useCreateLeaveRequest, 
  useUpdateLeaveRequest, 
  useDeleteLeaveRequest,
  useListEmployees,
  getListLeaveRequestsQueryKey,
  getGetDashboardSummaryQueryKey,
  useListLovItems
} from "@workspace/api-client-react";
import { LeaveStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus, Calendar, Check, X, Trash2, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";

const leaveSchema = z.object({
  employeeId: z.coerce.number().min(1, "Employee must be selected"),
  type: z.string().min(1, "Leave type is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().optional(),
});

type LeaveFormValues = z.infer<typeof leaveSchema>;

export default function LeaveRequestsList() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: leaveRequests, isLoading } = useListLeaveRequests();
  const { data: employees } = useListEmployees({ status: "active" as any });
  const { data: leaveTypes } = useListLovItems("leave_type");
  
  const createLeave = useCreateLeaveRequest();
  const updateLeave = useUpdateLeaveRequest();
  const deleteLeave = useDeleteLeaveRequest();

  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      employeeId: 0,
      type: "vacation",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      reason: "",
    },
  });

  const onSubmitCreate = (data: LeaveFormValues) => {
    createLeave.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Leave request submitted", description: "Leave request submitted successfully." });
          queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Failed to submit request", variant: "destructive" });
        },
      }
    );
  };

  const handleStatusChange = (id: number, status: LeaveStatus) => {
    updateLeave.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Request ${status}`, description: `Leave request has been ${status}.` });
          queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
        onError: () => {
          toast({ title: "Update failed", variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteLeave.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Request cancelled", description: "Leave request has been removed." });
          queryClient.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
        onError: () => {
          toast({ title: "Cancellation failed", variant: "destructive" });
        },
      }
    );
  };

  const filteredRequests = useMemo(() => {
    if (!leaveRequests) return [];
    return leaveRequests.filter(lr => statusFilter === "all" || lr.status === statusFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leaveRequests, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case LeaveStatus.approved:
        return <Badge className="bg-secondary hover:bg-secondary/90 text-white border-transparent">Approved</Badge>;
      case LeaveStatus.pending:
        return <Badge className="bg-chart-4 hover:bg-chart-4/90 text-white border-transparent">Pending</Badge>;
      case LeaveStatus.rejected:
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Leave Requests</h1>
          <p className="text-muted-foreground mt-1">Review and manage employee time off.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 hover-elevate">
              <Plus className="w-4 h-4 mr-2" /> Log Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Log Leave Request</DialogTitle>
              <DialogDescription>Submit a new leave request on behalf of an employee.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4 pt-4">
                <FormField control={form.control} name="employeeId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees?.map((e) => (
                          <SelectItem key={e.id} value={e.id.toString()}>{e.firstName} {e.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="startDate" render={({ field }) => (
                    <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="endDate" render={({ field }) => (
                    <FormItem><FormLabel>End Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Leave Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {leaveTypes?.filter(t => t.isActive).map(type => (
                          <SelectItem key={type.id} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="reason" render={({ field }) => (
                  <FormItem><FormLabel>Reason (Optional)</FormLabel><FormControl><Textarea {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={createLeave.isPending}>
                    {createLeave.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Submit Request
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-col md:flex-row gap-4 justify-between">
          <div className="flex items-center text-sm font-medium text-muted-foreground">
            <CalendarClock className="w-4 h-4 mr-2" />
            Showing {filteredRequests.length} request(s)
          </div>
          <div className="w-full md:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px] bg-background">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value={LeaveStatus.pending}>Pending</SelectItem>
                <SelectItem value={LeaveStatus.approved}>Approved</SelectItem>
                <SelectItem value={LeaveStatus.rejected}>Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex justify-center items-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-display font-medium text-foreground mb-1">No requests found</h3>
            <p className="text-muted-foreground max-w-sm">There are no leave requests matching your current filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-[200px]">Employee</TableHead>
                  <TableHead>Dates & Duration</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request, idx) => {
                  const days = differenceInDays(new Date(request.endDate), new Date(request.startDate)) + 1;
                  return (
                    <TableRow 
                      key={request.id} 
                      className="group border-border/30 hover:bg-muted/10 transition-colors"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <TableCell className="font-medium py-4">
                        {request.employeeName}
                        {request.reason && (
                          <div className="text-xs text-muted-foreground font-normal mt-1 max-w-[200px] truncate" title={request.reason}>
                            "{request.reason}"
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {format(new Date(request.startDate), "MMM d")} - {format(new Date(request.endDate), "MMM d, yyyy")}
                          </span>
                          <span className="text-xs text-muted-foreground mt-0.5">{days} day{days !== 1 ? 's' : ''}</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {request.type.replace("_", " ")}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(request.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-2">
                          {request.status === LeaveStatus.pending && (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 border-secondary text-secondary hover:bg-secondary hover:text-white"
                                onClick={() => handleStatusChange(request.id, LeaveStatus.approved)}
                                disabled={updateLeave.isPending}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-white"
                                onClick={() => handleStatusChange(request.id, LeaveStatus.rejected)}
                                disabled={updateLeave.isPending}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Leave Request?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove the leave request for {request.employeeName}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(request.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
