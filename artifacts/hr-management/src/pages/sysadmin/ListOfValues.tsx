import { Link } from "wouter";
import { useListLovCategories } from "@workspace/api-client-react";
import { Settings, ListOrdered, ChevronRight, Loader2 } from "lucide-react";

export default function ListOfValues() {
  const { data: categories, isLoading } = useListLovCategories();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">List of Values</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage dropdown options and categories across the system.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => {
            const activeCount = cat.items.filter((i) => i.isActive).length;
            const totalCount = cat.items.length;
            return (
              <Link key={cat.category} href={`/sysadmin/lov/${cat.category}`}>
                <div className="group bg-card border border-border/50 rounded-xl shadow-sm p-5 flex items-center gap-4 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
                    <ListOrdered className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{cat.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {totalCount === 0
                        ? "No items"
                        : `${activeCount} active · ${totalCount} total`}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-xl p-12 text-center">
          <Settings className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-foreground">No categories found</h3>
          <p className="text-sm text-muted-foreground">There are no list of values categories available.</p>
        </div>
      )}
    </div>
  );
}
