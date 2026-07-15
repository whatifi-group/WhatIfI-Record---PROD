import { useRef, useState } from "react";
import { useImportQualificationTypes } from "@workspace/api-client-react";
import type { QualificationTypeImportResult } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, AlertTriangle, CheckCircle2, Download } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const SAMPLE_CSV = `name,awardingBody,validityValue,validityUnit,isActive
First Aid at Work,British Red Cross,3,years,true
Food Hygiene Level 2,Highfield,3,years,true
Manual Handling,,,, true
Fire Safety Awareness,,,, true
`;

const EXPECTED_COLUMNS = ["name", "awardingBody", "validityValue", "validityUnit", "isActive"] as const;

interface ParsedRow {
  name: string;
  awardingBody: string;
  validityValue: string;
  validityUnit: string;
  isActive: string;
}

function parsePreview(csv: string): { headers: string[]; rows: ParsedRow[]; parseError: string | null } {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 1) return { headers: [], rows: [], parseError: "File is empty." };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  if (!headers.includes("name")) {
    return { headers, rows: [], parseError: 'Missing required "name" column. Check your CSV header row.' };
  }
  const nameIdx = headers.indexOf("name");
  const awardingBodyIdx = headers.indexOf("awardingBody");
  const validityValueIdx = headers.indexOf("validityValue");
  const validityUnitIdx = headers.indexOf("validityUnit");
  const isActiveIdx = headers.indexOf("isActive");

  const rows: ParsedRow[] = lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return {
      name: cells[nameIdx] ?? "",
      awardingBody: awardingBodyIdx >= 0 ? (cells[awardingBodyIdx] ?? "") : "",
      validityValue: validityValueIdx >= 0 ? (cells[validityValueIdx] ?? "") : "",
      validityUnit: validityUnitIdx >= 0 ? (cells[validityUnitIdx] ?? "") : "",
      isActive: isActiveIdx >= 0 ? (cells[isActiveIdx] ?? "") : "",
    };
  });
  return { headers, rows, parseError: null };
}

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "qualification-types-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvImportDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<QualificationTypeImportResult | null>(null);
  const importMutation = useImportQualificationTypes();

  const preview = csvText ? parsePreview(csvText) : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) ?? null);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!csvText) return;
    importMutation.mutate(
      { data: csvText },
      {
        onSuccess: (res) => {
          setResult(res);
          if (res.imported > 0) {
            onImported();
            toast({
              title: `${res.imported} qualification type${res.imported !== 1 ? "s" : ""} imported`,
              description: res.skipped > 0 ? `${res.skipped} row${res.skipped !== 1 ? "s" : ""} skipped due to errors.` : undefined,
            });
          } else {
            toast({
              variant: "destructive",
              title: "Nothing imported",
              description: "All rows had errors — check the details below.",
            });
          }
        },
        onError: () => {
          toast({ variant: "destructive", title: "Import failed", description: "Server error — please try again." });
        },
      }
    );
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setCsvText(null);
      setFileName(null);
      setResult(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    onOpenChange(open);
  };

  const canImport = !!csvText && !preview?.parseError && !importMutation.isPending && !result;
  const previewRows = preview?.rows.slice(0, 5) ?? [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle>Import from CSV</DialogTitle>
          </div>
          <DialogDescription>
            Upload a CSV file to bulk-create qualification types. Download the template to see the
            expected format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template download */}
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border/70 px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4 shrink-0" />
              <span>
                Columns: <code className="text-xs bg-muted rounded px-1">{EXPECTED_COLUMNS.join(", ")}</code>
              </span>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs shrink-0" onClick={downloadSample}>
              <Download className="w-3.5 h-3.5" /> Template
            </Button>
          </div>

          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
            >
              <Upload className="w-4 h-4" />
              {fileName ?? "Choose CSV file…"}
            </Button>
          </div>

          {/* Parse error */}
          {preview?.parseError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {preview.parseError}
            </div>
          )}

          {/* Preview table */}
          {preview && !preview.parseError && previewRows.length > 0 && !result && (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground border-b border-border/50">
                Preview — first {Math.min(previewRows.length, 5)} of {preview.rows.length} rows
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/10">
                    <tr>
                      {["Name", "Awarding Body", "Validity", "Unit", "Active"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {previewRows.map((row, i) => (
                      <tr key={i} className={!row.name ? "bg-destructive/5" : ""}>
                        <td className={`px-3 py-1.5 ${!row.name ? "text-destructive" : "font-medium"}`}>
                          {row.name || <span className="italic opacity-60">missing</span>}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{row.awardingBody || "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{row.validityValue || "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{row.validityUnit || "—"}</td>
                        <td className="px-3 py-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 ${
                              row.isActive.toLowerCase() === "false" || row.isActive === "0"
                                ? "text-muted-foreground"
                                : "text-secondary border-secondary/30"
                            }`}
                          >
                            {row.isActive.toLowerCase() === "false" || row.isActive === "0" ? "Inactive" : "Active"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import result */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-secondary/30 bg-secondary/5 px-3 py-2 text-sm text-secondary">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{result.imported}</strong> imported
                  {result.skipped > 0 && <>, <strong>{result.skipped}</strong> skipped</>}
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/20 overflow-hidden">
                  <div className="px-3 py-1.5 bg-destructive/5 text-xs font-medium text-destructive border-b border-destructive/20">
                    Row errors
                  </div>
                  <ul className="divide-y divide-border/30">
                    {result.errors.map((e, i) => (
                      <li key={i} className="px-3 py-1.5 text-xs text-muted-foreground">
                        {e.row > 0 ? <span className="font-medium text-foreground">Row {e.row}: </span> : null}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={!canImport}>
              {importMutation.isPending ? "Importing…" : `Import ${preview && !preview.parseError ? `${preview.rows.length} rows` : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
