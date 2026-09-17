import { Button } from "@/components/ui/Button";
import type { Redemption } from "@/lib/types";

export interface RedemptionsTableRow {
  redemption: Redemption;
  driverName: string;
}

export interface RedemptionsTableProps {
  rows: RedemptionsTableRow[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const STATUS_ICON: Record<Redemption["status"], string> = {
  pending: "…",
  processing: "↻",
  completed: "✓",
  failed: "✕",
};

/** Redemptions admin table (PRD Section 8.7). */
export function RedemptionsTable({ rows, onApprove, onReject }: RedemptionsTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-mist">No redemptions match this filter.</p>;
  }

  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-line text-xs text-mist">
          <th scope="col" className="pb-2 pr-4 font-medium">Driver</th>
          <th scope="col" className="pb-2 pr-4 font-medium">Type</th>
          <th scope="col" className="pb-2 pr-4 font-medium">Amount</th>
          <th scope="col" className="pb-2 pr-4 font-medium">Status</th>
          <th scope="col" className="pb-2 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ redemption, driverName }) => (
          <tr key={redemption.id} className="border-b border-line/60 text-fog">
            <td className="py-3 pr-4">{driverName}</td>
            <td className="py-3 pr-4">{redemption.redemption_type.replace(/_/g, " ")}</td>
            <td className="py-3 pr-4">{redemption.amount ?? 0}</td>
            <td className="py-3 pr-4">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">{STATUS_ICON[redemption.status]}</span>
                {redemption.status}
              </span>
            </td>
            <td className="py-3">
              {redemption.status === "pending" ? (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => onApprove(redemption.id)}>
                    Approve
                  </Button>
                  <Button variant="danger" onClick={() => onReject(redemption.id)}>
                    Reject
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-mist">No action needed</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
