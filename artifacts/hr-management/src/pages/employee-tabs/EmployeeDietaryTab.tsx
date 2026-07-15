import { useState, useEffect } from "react";
import {
  useGetEmployeeDietary,
  usePutEmployeeDietary,
  useListLovItems,
  getGetEmployeeDietaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Salad } from "lucide-react";
import TabErrorState from "@/components/TabErrorState";

interface Props {
  employeeId: number;
}

export default function EmployeeDietaryTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const { data: lovItems, isLoading: lovLoading } = useListLovItems("dietary_requirement");
  const { data: dietary, isLoading: dietaryLoading, isError: dietaryIsError, error: dietaryError, refetch: refetchDietary } = useGetEmployeeDietary(employeeId, {
    query: { queryKey: getGetEmployeeDietaryQueryKey(employeeId) },
  });
  const putDietary = usePutEmployeeDietary();

  useEffect(() => {
    if (dietary) {
      setSelections(dietary.selections || []);
      setNotes(dietary.notes || "");
    }
  }, [dietary]);

  const handleToggle = (value: string, checked: boolean) => {
    setSelections(prev =>
      checked ? [...prev, value] : prev.filter(s => s !== value)
    );
  };

  const handleSave = () => {
    putDietary.mutate(
      { id: employeeId, data: { selections, notes: notes || null } },
      {
        onSuccess: (data) => {
          toast({ title: "Dietary information saved" });
          queryClient.setQueryData(getGetEmployeeDietaryQueryKey(employeeId), data);
        },
        onError: () => toast({ title: "Failed to save dietary information", variant: "destructive" }),
      }
    );
  };

  if (lovLoading || dietaryLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (dietaryIsError && (dietaryError as any)?.status !== 404) {
    return <TabErrorState onRetry={refetchDietary} message="Could not load dietary information. Check your connection and try again." />;
  }

  const activeItems = lovItems?.filter(item => item.isActive) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Dietary Information</h3>
        <Button size="sm" onClick={handleSave} disabled={putDietary.isPending}>
          {putDietary.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save
        </Button>
      </div>

      <div className="border border-border/50 rounded-lg p-5 bg-card space-y-5">
        <div>
          <Label className="text-sm font-medium mb-3 block">Dietary Requirements</Label>
          {activeItems.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-3">
              <Salad className="w-4 h-4 opacity-40" />
              <span>No dietary requirement options configured. Add them in List of Values.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeItems.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`dietary-${item.value}`}
                    checked={selections.includes(item.value)}
                    onCheckedChange={(checked) => handleToggle(item.value, !!checked)}
                  />
                  <Label htmlFor={`dietary-${item.value}`} className="cursor-pointer font-normal text-sm">
                    {item.label}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium mb-1 block">Dietary Notes</Label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}

            className="min-h-[100px]"
          />
        </div>
      </div>
    </div>
  );
}
