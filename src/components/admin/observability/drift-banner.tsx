import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { DriftResult } from "@/lib/observability/resolution-metrics";
import type { DriftStatus } from "@/lib/observability/drift-thresholds";

interface DriftBannerProps {
  result: DriftResult;
}

type StatusConfig = {
  icon: LucideIcon;
  label: string;
  container: string;
  iconClass: string;
};

const STATUS_CONFIG = {
  ok: {
    icon: CheckCircle2,
    label: "OK",
    container: "bg-green-50 border border-green-200 text-green-800",
    iconClass: "text-green-600 shrink-0 mt-0.5",
  },
  warn: {
    icon: AlertTriangle,
    label: "Warning",
    container: "bg-amber-50 border border-amber-200 text-amber-800",
    iconClass: "text-amber-500 shrink-0 mt-0.5",
  },
  alert: {
    icon: AlertCircle,
    label: "Alert",
    container: "bg-red-50 border border-red-200 text-red-800",
    iconClass: "text-red-500 shrink-0 mt-0.5",
  },
} satisfies Record<DriftStatus, StatusConfig>;

export function DriftBanner({ result }: DriftBannerProps) {
  const {
    icon: Icon,
    label,
    container,
    iconClass,
  } = STATUS_CONFIG[result.status];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-4 py-3 text-sm",
        container,
      )}
      data-status={result.status}
    >
      <Icon className={iconClass} size={16} aria-hidden />
      <div className="flex flex-col gap-0.5">
        <p>
          <span className="font-semibold">{label}:&nbsp;</span>
          {result.reason}
        </p>
        {result.rates.total > 0 && (
          <p className="text-xs opacity-80">
            auto {(result.rates.auto * 100).toFixed(0)}% · llm_disambig{" "}
            {(result.rates.disambig * 100).toFixed(0)}% · new{" "}
            {(result.rates.new * 100).toFixed(0)}% · n={result.rates.total}
          </p>
        )}
      </div>
    </div>
  );
}
