import { useState } from "react";
import {
  useUpdateEmployee,
  useListLovItems,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  type Employee,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmployeeStatus } from "@workspace/api-client-react";

interface MarkAsLeaverDialogProps {
  open: boolean;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
  onSuccess: (updated: Employee) => void;
}

export default function MarkAsLeaverDialog({
  open,
  onClose,
  employeeId,
  employeeName,
  onSuccess,
}: MarkAsLeaverDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const [reason, setReason] = useState("");
  const [leaverDate, setLeaverDate] = useState(today);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: reasons, isLoading: reasonsLoading } =
    useListLovItems("leaver_reason");
  const updateEmployee = useUpdateEmployee();

  const activeReasons = reasons?.filter((r) => r.isActive) ?? [];

  const handleSubmit = () => {
    if (!reason) return;
    updateEmployee.mutate(
      {
        id: employeeId,
        data: {
          status: EmployeeStatus.leaver,
          leaverReason: reason,
          leaverDate: leaverDate || today,
        },
      },
      {
        onSuccess: (updated) => {
          toast({
            title: "Employee marked as leaver",
            description: `${employeeName} has been marked as a leaver.`,
          });
          queryClient.setQueryData(
            getGetEmployeeQueryKey(employeeId),
            updated,
          );
          queryClient.invalidateQueries({
            queryKey: getListEmployeesQueryKey(),
          });
          handleClose();
          onSuccess(updated);
        },
        onError: () => {
          toast({
            title: "Action failed",
            description: "Could not mark this employee as a leaver.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleClose = () => {
    setReason("");
    setLeaverDate(today);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="w-5 h-5 text-amber-500" />
            Mark {employeeName} as Leaver
          </DialogTitle>
          <DialogDescription>
            This will update the employee's status to Leaver. Please select a
            reason and confirm the leaving date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="leaver-reason">
              Leaver Reason <span className="text-destructive">*</span>
            </Label>
            {reasonsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading reasons…
              </div>
            ) : (
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="leaver-reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {activeReasons.map((r) => (
                    <SelectItem key={r.id} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leaver-date">Leaving Date</Label>
            <Input
              id="leaver-date"
              type="date"
              value={leaverDate}
              onChange={(e) => setLeaverDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={updateEmployee.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason || updateEmployee.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {updateEmployee.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4 mr-2" />
            )}
            Confirm Leaver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
