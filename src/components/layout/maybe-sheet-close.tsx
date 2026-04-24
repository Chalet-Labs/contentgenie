"use client";

import type { ReactElement } from "react";
import { SheetClose } from "@/components/ui/sheet";

export function MaybeSheetClose({
  inSheet,
  children,
}: {
  inSheet: boolean;
  children: ReactElement;
}) {
  return inSheet ? <SheetClose asChild>{children}</SheetClose> : children;
}
