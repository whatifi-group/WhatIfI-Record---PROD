import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabChild {
  value: string;
  label: string;
}

export interface TabSection {
  title: string;
  children: TabChild[];
}

interface GroupedTabNavProps {
  sections: TabSection[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
}

export function GroupedTabNav({ sections, activeTab, onTabChange, className }: GroupedTabNavProps) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenSection(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div
      ref={navRef}
      className={cn(
        "flex flex-wrap gap-1 bg-muted/60 rounded-lg p-1 mb-4",
        className,
      )}
    >
      {sections.map((section) => {
        if (section.children.length === 0) return null;
        const isActiveSection = section.children.some((c) => c.value === activeTab);
        const isOpen = openSection === section.title;

        return (
          <div key={section.title} className="relative">
            <button
              type="button"
              onClick={() => setOpenSection(isOpen ? null : section.title)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all select-none",
                isActiveSection
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              {section.title}
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-150",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen && (
              <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-md shadow-md z-50 min-w-[170px] py-1">
                {section.children.map((child) => {
                  const isActive = child.value === activeTab;
                  return (
                    <button
                      key={child.value}
                      type="button"
                      onClick={() => {
                        onTabChange(child.value);
                        setOpenSection(null);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                        isActive
                          ? "font-semibold text-foreground bg-muted/40"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                      )}
                    >
                      <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                        {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                      </span>
                      {child.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
