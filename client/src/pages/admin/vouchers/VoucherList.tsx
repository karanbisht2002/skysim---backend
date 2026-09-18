import { useTranslation } from "@/contexts/TranslationContext";
import { Voucher } from "./types";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2 } from "lucide-react";

export default function VoucherList({
  vouchers,
  onEdit,
  onDelete,
}: {
  vouchers: Voucher[];
  onEdit: (voucher: Voucher) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">Code</th>
          <th className="text-left p-2">Type</th>
          <th className="text-left p-2">Value</th>
          <th className="text-left p-2">{t('common.status', 'Status')}</th>
          <th className="text-left p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {vouchers.map((v) => (
          <tr key={v.id} className="border-b">
            <td className="p-2">{v.code}</td>
            <td className="p-2">{v.type}</td>
            <td className="p-2">{v.value}</td>
            <td className="p-2">{v.status}</td>
            <td className="p-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(v)}>
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(v.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
