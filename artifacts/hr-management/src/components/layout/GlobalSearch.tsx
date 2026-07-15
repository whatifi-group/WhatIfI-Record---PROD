import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, Users, Building2, Calendar, UserCog, GraduationCap, X } from "lucide-react";
import { useSearch, getSearchQueryKey, type SearchResult } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ElementType> = {
  employee: Users,
  department: Building2,
  leave_request: Calendar,
  user: UserCog,
  qualification_type: GraduationCap,
};

const TYPE_LABELS: Record<string, string> = {
  employee: "Employees",
  department: "Departments",
  leave_request: "Leave Requests",
  user: "Users",
  qualification_type: "Qualification Types",
};

const TYPE_ORDER = ["employee", "department", "leave_request", "user", "qualification_type"];

function groupResults(results: SearchResult[]): Record<string, SearchResult[]> {
  const groups: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = [];
    groups[r.type].push(r);
  }
  return groups;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  // Debounce input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedQuery]);

  const searchParams = { q: debouncedQuery };
  const { data, isFetching } = useSearch(searchParams, {
    query: {
      queryKey: getSearchQueryKey(searchParams),
      enabled: debouncedQuery.length >= 2,
      staleTime: 10_000,
    },
  });

  const results = data?.results ?? [];
  const groups = groupResults(results);
  const flatResults = TYPE_ORDER.flatMap((t) => groups[t] ?? []);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Don't hijack if already in another input
        if (
          document.activeElement &&
          document.activeElement !== inputRef.current &&
          (document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Escape closes popover
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && activeIndex >= 0 && flatResults[activeIndex]) {
      navigate(flatResults[activeIndex]);
    }
  };

  const navigate = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery("");
      setDebouncedQuery("");
      setLocation(result.href);
    },
    [setLocation],
  );

  // Click outside closes popover
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const showPopover =
    open && query.length >= 2 && (isFetching || results.length > 0 || debouncedQuery.length >= 2);

  let itemIdx = 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      {/* Input */}
      <div
        className={cn(
          "flex items-center gap-2 h-9 rounded-md border bg-background px-3 text-sm transition-colors",
          open
            ? "border-ring ring-1 ring-ring/30"
            : "border-input hover:border-ring/50",
        )}
      >
        {isFetching && query.length >= 2 ? (
          <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0"
          aria-label="Global search"
          aria-expanded={showPopover}
          aria-haspopup="listbox"
          role="combobox"
          autoComplete="off"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDebouncedQuery("");
              inputRef.current?.focus();
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono border border-border rounded px-1 py-0.5 leading-none shrink-0">
          <span>⌘K</span>
        </kbd>
      </div>

      {/* Popover */}
      {showPopover && (
        <div
          role="listbox"
          className="absolute top-full mt-1.5 left-0 right-0 z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
        >
          {results.length === 0 && !isFetching ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto py-1">
              {TYPE_ORDER.filter((t) => groups[t]?.length).map((type) => {
                const Icon = TYPE_ICONS[type] ?? Search;
                return (
                  <div key={type}>
                    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {TYPE_LABELS[type]}
                    </div>
                    {groups[type].map((result) => {
                      const idx = itemIdx++;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={`${result.type}-${result.id}`}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onMouseLeave={() => setActiveIndex(-1)}
                          onClick={() => navigate(result)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                            isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium leading-tight truncate">
                              {result.label}
                            </span>
                            {result.sublabel && (
                              <span className="text-xs text-muted-foreground truncate leading-tight">
                                {result.sublabel}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
