import { LifeBuoy } from "lucide-react";

export default function Safety() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-amber-100">
        <LifeBuoy className="h-10 w-10 text-amber-700" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-2xl font-bold text-foreground">Safety</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This module is coming soon. You'll be able to manage safety incidents,
          risk assessments, and compliance records here.
        </p>
      </div>
    </div>
  );
}
