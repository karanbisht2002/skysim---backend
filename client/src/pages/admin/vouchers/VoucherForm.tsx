import { useTranslation } from "@/contexts/TranslationContext";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { voucherSchema, VoucherFormData } from "./types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

export default function VoucherForm({
  initialData,
  onSubmit,
}: {
  initialData?: VoucherFormData;
  onSubmit: (data: any) => void;
}) {
  const { t } = useTranslation();
  const form = useForm<VoucherFormData>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      code: "",
      type: "",
      value: "",
      minPurchaseAmount: "",
      maxUses: "",
      validFrom: "",
      validUntil: "",
      description: "",
      status: "active",
    },
  });

  // 🔥 FIX: Normalize edit data
  useEffect(() => {
    if (initialData) {
      form.reset(
        {
          ...initialData,
          maxUses:
            initialData.maxUses === null
              ? ""
              : String(initialData.maxUses),
          validFrom: initialData.validFrom?.slice(0, 10),
          validUntil: initialData.validUntil?.slice(0, 10),
        },
        {
          keepErrors: false,
          keepDirty: false,
        }
      );
    }
  }, [initialData]);

 const handleSave = (data: VoucherFormData) => {
  const payload = {
    ...data,
    minPurchaseAmount: data.minPurchaseAmount || "0",
    maxUses: data.maxUses === "" ? null : Number(data.maxUses),

    // ✅ SEND DATE OBJECTS (NOT STRING)
    validFrom: new Date(data.validFrom),
    validUntil: new Date(data.validUntil),

    description: data.description || null,
  };

  onSubmit(payload);
};


  return (
    <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
      <div>
        <Label>Voucher Code</Label>
        <Input {...form.register("code")} />
      </div>

      <div>
        <Label>Type</Label>
        <Input {...form.register("type")} />
      </div>

      <div>
        <Label>Value</Label>
        <Input {...form.register("value")} />
      </div>

      <div>
        <Label>Min Purchase Amount</Label>
        <Input {...form.register("minPurchaseAmount")} />
      </div>

      <div>
        <Label>Max Uses</Label>
        <Input {...form.register("maxUses")} type="number" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Valid From</Label>
          <Input {...form.register("validFrom")} type="date" />
        </div>
        <div>
          <Label>Valid Until</Label>
          <Input {...form.register("validUntil")} type="date" />
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Input {...form.register("description")} />
      </div>

      <div>
        <Label>{t('common.status', 'Status')}</Label>
        <Select
          value={form.watch("status")}
          onValueChange={(v) =>
            form.setValue("status", v as any, { shouldFocus: false })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full">
        <Save className="h-4 w-4 mr-2" />
        Save Voucher
      </Button>
    </form>
  );
}
