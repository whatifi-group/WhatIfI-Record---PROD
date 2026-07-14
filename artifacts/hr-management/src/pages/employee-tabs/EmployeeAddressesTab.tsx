import { useState } from "react";
import {
  useListEmployeeAddresses,
  useCreateEmployeeAddress,
  useUpdateEmployeeAddress,
  useDeleteEmployeeAddress,
  getListEmployeeAddressesQueryKey,
  useListLovItems,
} from "@workspace/api-client-react";
import type { EmployeeAddress, EmployeeAddressInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, MapPin } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


interface AddressFormData {
  addressType: string;
  line1: string;
  line2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
  isPrimary: boolean;
}

const defaultForm: AddressFormData = {
  addressType: "home",
  line1: "",
  line2: "",
  city: "",
  county: "",
  postcode: "",
  country: "",
  isPrimary: false,
};

interface Props {
  employeeId: number;
}

export default function EmployeeAddressesTab({ employeeId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<EmployeeAddress | null>(null);
  const [form, setForm] = useState<AddressFormData>(defaultForm);

  const { data: addresses, isLoading } = useListEmployeeAddresses(employeeId);
  const { data: addressTypes } = useListLovItems("address_type");
  const createAddress = useCreateEmployeeAddress();
  const updateAddress = useUpdateEmployeeAddress();
  const deleteAddress = useDeleteEmployeeAddress();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEmployeeAddressesQueryKey(employeeId) });

  const openAdd = () => {
    setEditingAddress(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (address: EmployeeAddress) => {
    setEditingAddress(address);
    setForm({
      addressType: address.addressType,
      line1: address.line1,
      line2: address.line2 || "",
      city: address.city || "",
      county: address.county || "",
      postcode: address.postcode || "",
      country: address.country || "",
      isPrimary: address.isPrimary,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.line1.trim()) {
      toast({ title: "Line 1 is required", variant: "destructive" });
      return;
    }
    const payload: EmployeeAddressInput = {
      addressType: form.addressType,
      line1: form.line1,
      line2: form.line2 || undefined,
      city: form.city || undefined,
      county: form.county || undefined,
      postcode: form.postcode || undefined,
      country: form.country || undefined,
      isPrimary: form.isPrimary,
    };

    if (editingAddress) {
      updateAddress.mutate(
        { id: employeeId, addressId: editingAddress.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Address updated" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Failed to update address", variant: "destructive" }),
        }
      );
    } else {
      createAddress.mutate(
        { id: employeeId, data: payload },
        {
          onSuccess: () => { toast({ title: "Address added" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Failed to add address", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = (addressId: number) => {
    deleteAddress.mutate(
      { id: employeeId, addressId },
      {
        onSuccess: () => { toast({ title: "Address removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to delete address", variant: "destructive" }),
      }
    );
  };

  const isSaving = createAddress.isPending || updateAddress.isPending;

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-foreground">Addresses</h3>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Address</Button>
      </div>

      {!addresses || addresses.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No addresses on record</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div key={address.id} className="border border-border/50 rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">{addressTypes?.find(t => t.value === address.addressType)?.label ?? address.addressType}</Badge>
                    {address.isPrimary && <Badge className="bg-primary/10 text-primary text-xs border-0">Primary</Badge>}
                  </div>
                  <p className="text-sm font-medium text-foreground">{address.line1}</p>
                  {address.line2 && <p className="text-sm text-muted-foreground">{address.line2}</p>}
                  <p className="text-sm text-muted-foreground">
                    {[address.city, address.county, address.postcode].filter(Boolean).join(", ")}
                  </p>
                  {address.country && <p className="text-sm text-muted-foreground">{address.country}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(address)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this address?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(address.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingAddress ? "Edit Address" : "Add Address"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="sm:col-span-2">
              <Label>Address Type</Label>
              <Select value={form.addressType} onValueChange={(v) => setForm(f => ({ ...f, addressType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {addressTypes?.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Line 1 *</Label>
              <Input className="mt-1" value={form.line1} onChange={e => setForm(f => ({ ...f, line1: e.target.value }))} placeholder="Street address" />
            </div>
            <div className="sm:col-span-2">
              <Label>Line 2</Label>
              <Input className="mt-1" value={form.line2} onChange={e => setForm(f => ({ ...f, line2: e.target.value }))} placeholder="Apartment, suite, etc." />
            </div>
            <div>
              <Label>City</Label>
              <Input className="mt-1" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>County</Label>
              <Input className="mt-1" value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} />
            </div>
            <div>
              <Label>Postcode</Label>
              <Input className="mt-1" value={form.postcode} onChange={e => setForm(f => ({ ...f, postcode: e.target.value }))} />
            </div>
            <div>
              <Label>Country</Label>
              <Input className="mt-1" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 mt-1">
              <Checkbox id="isPrimary" checked={form.isPrimary} onCheckedChange={(v) => setForm(f => ({ ...f, isPrimary: !!v }))} />
              <Label htmlFor="isPrimary" className="cursor-pointer">Set as primary address</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingAddress ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
