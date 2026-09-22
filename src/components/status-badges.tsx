"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DELIVERY_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
} from "@/lib/constants";
import { prettifyCode, useCategories } from "@/components/categories-provider";

export function PaymentBadge({ status }: { status: string }) {
  const label = PAYMENT_LABELS[status] ?? status;
  return (
    <Badge
      className={cn(
        status === "PAYE" && "bg-green-100 text-green-800 hover:bg-green-100 border-green-200",
        status === "PARTIEL" && "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
        status === "NON_PAYE" && "bg-red-100 text-red-700 hover:bg-red-100 border-red-200"
      )}
    >
      {label}
    </Badge>
  );
}

export function DeliveryBadge({ status }: { status: string }) {
  const label = DELIVERY_LABELS[status] ?? status;
  return (
    <Badge
      className={cn(
        status === "LIVRE"
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200"
          : "bg-stone-100 text-stone-600 hover:bg-stone-100 border-stone-200"
      )}
    >
      {label}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const label = ORDER_STATUS_LABELS[status] ?? status;
  return (
    <Badge
      className={cn(
        status === "EN_COURS" && "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
        status === "CONFIRMEE" && "bg-green-100 text-green-800 hover:bg-green-100 border-green-200",
        status === "LIVREE" && "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200",
        status === "ANNULEE" && "bg-red-100 text-red-700 hover:bg-red-100 border-red-200"
      )}
    >
      {label}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string | null | undefined }) {
  const { labels } = useCategories();
  if (!category) return <span className="text-muted-foreground text-xs">—</span>;
  const label = labels[category] ?? prettifyCode(category);
  return (
    <Badge variant="outline" className="border-green-200 text-green-800 bg-green-50/50">
      {label}
    </Badge>
  );
}


