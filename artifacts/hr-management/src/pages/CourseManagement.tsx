import { BookOpen } from "lucide-react";

export default function CourseManagement() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/10">
        <BookOpen className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-2xl font-bold text-foreground">Course Management</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This module is coming soon. You'll be able to manage training courses,
          track employee completions, and schedule upcoming sessions here.
        </p>
      </div>
    </div>
  );
}
