import { useState, useEffect } from "react";
import {
  useGetEmployeeMedical,
  usePutEmployeeMedical,
  useListLovItems,
  getGetEmployeeMedicalQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Heart } from "lucide-react";

interface Props {
  employeeId: number;
}

export default function EmployeeMedicalTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const { data: lovItems, isLoading: lovLoading } = useListLovItems("medical_condition");
  const { data: medical, isLoading: medicalLoading } = useGetEmployeeMedical(employeeId, {
    query: { queryKey: getGetEmployeeMedicalQueryKey(employeeId) },
  });
  const putMedical = usePutEmployeeMedical();

  useEffect(() => {
    if (medical) {
      setSelections(medical.selections || []);
      setNotes(medical.notes || "");
    }
  }, [medical]);

  const handleToggle = (value: string, checked: boolean) => {
    setSelections(prev =>
      checked ? [...prev, value] : prev.filter(s => s !== value)
    );
  };

  const handleSave = () => {
    putMedical.mutate(
      { id: employeeId, data: { selections, notes: notes || null } },
      {
        onSuccess: (data) => {
          toast({ title: "Medical information saved" });
          queryClient.setQueryData(getGetEmployeeMedicalQueryKey(employeeId), data);
        },
        onError: () => toast({ title: "Failed to save medical information", variant: "destructive" }),
      }
    );
  };

  if (lovLoading || medicalLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const activeItems = lovItems?.filter(item => item.isActive) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Medical Information</h3>
        <Button size="sm" onClick={handleSave} disabled={putMedical.isPending}>
          {putMedical.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save
        </Button>
      </div>

      <div className="border border-border/50 rounded-lg p-5 bg-card space-y-5">
        <div>
          <Label className="text-sm font-medium mb-3 block">Medical Conditions</Label>
          {activeItems.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-3">
              <Heart className="w-4 h-4 opacity-40" />
              <span>No medical condition options configured. Add them in List of Values.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeItems.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`medical-${item.value}`}
                    checked={selections.includes(item.value)}
                    onCheckedChange={(checked) => handleToggle(item.value, !!checked)}
                  />
                  <Label htmlFor={`medical-${item.value}`} className="cursor-pointer font-normal text-sm">
                    {item.label}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium mb-1 block">Medical Notes</Label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add any relevant medical notes..."
            className="min-h-[100px]"
          />
        </div>
      </div>
    </div>
  );
}
