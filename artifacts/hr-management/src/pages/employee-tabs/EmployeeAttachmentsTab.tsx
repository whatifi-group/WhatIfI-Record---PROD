import { useState } from "react";
import {
  useListEmployeeAttachments,
  useCreateEmployeeAttachment,
  useDeleteEmployeeAttachment,
  getListEmployeeAttachmentsQueryKey,
} from "@workspace/api-client-react";
import type { EmployeeAttachmentInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Paperclip, ExternalLink } from "lucide-react";
import TabErrorState from "@/components/TabErrorState";
import { format } from "date-fns";

interface Props {
  employeeId: number;
}

interface FormData {
  fileName: string;
  fileUrl: string;
  fileType: string;
}

const defaultForm: FormData = { fileName: "", fileUrl: "", fileType: "" };

export default function EmployeeAttachmentsTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormData>(defaultForm);

  const { data: attachments, isLoading, isError, refetch } = useListEmployeeAttachments(employeeId);
  const createAttachment = useCreateEmployeeAttachment();
  const deleteAttachment = useDeleteEmployeeAttachment();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEmployeeAttachmentsQueryKey(employeeId) });

  const handleAdd = () => {
    if (!form.fileName.trim() || !form.fileUrl.trim()) {
      toast({ title: "File name and URL are required", variant: "destructive" });
      return;
    }
    const payload: EmployeeAttachmentInput = {
      fileName: form.fileName,
      fileUrl: form.fileUrl,
      fileType: form.fileType || undefined,
    };
    createAttachment.mutate(
      { id: employeeId, data: payload },
      {
        onSuccess: () => { toast({ title: "Attachment added" }); invalidate(); setDialogOpen(false); setForm(defaultForm); },
        onError: () => toast({ title: "Failed to add attachment", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (attachmentId: number) => {
    deleteAttachment.mutate(
      { id: employeeId, attachmentId },
      {
        onSuccess: () => { toast({ title: "Attachment removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to delete attachment", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return <TabErrorState onRetry={refetch} message="Could not load attachments. Check your connection and try again." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Attachments</h3>
        <Button size="sm" onClick={() => { setForm(defaultForm); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add Attachment
        </Button>
      </div>

      {!attachments || attachments.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No attachments on record</p>
        </div>
      ) : (
        <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachments.map((att) => (
                <TableRow key={att.id} className="border-border/30">
                  <TableCell>
                    <a
                      href={att.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {att.fileName}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{att.fileType || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {att.fileSizeBytes ? `${(att.fileSizeBytes / 1024).toFixed(1)} KB` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(att.uploadedAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this attachment?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(att.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add Attachment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>File Name *</Label>
              <Input className="mt-1" value={form.fileName} onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))} />
            </div>
            <div>
              <Label>File URL *</Label>
              <Input className="mt-1" value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))} />
            </div>
            <div>
              <Label>File Type</Label>
              <Input className="mt-1" value={form.fileType} onChange={e => setForm(f => ({ ...f, fileType: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={createAttachment.isPending}>
              {createAttachment.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
