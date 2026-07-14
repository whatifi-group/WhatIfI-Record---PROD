import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TabErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export default function TabErrorState({
  message = "Something went wrong while loading this section.",
  onRetry,
}: TabErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-12 text-center border border-destructive/20 rounded-lg bg-destructive/5"
    >
      <AlertCircle className="w-8 h-8 text-destructive/60 mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">Failed to load data</p>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCcw className="w-3.5 h-3.5 mr-2" />
        Try again
      </Button>
    </div>
  );
}
