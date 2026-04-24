import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ContrastButtonProps = Omit<ButtonProps, "variant">;

const CONTRAST_CLASSES =
  "bg-foreground text-background shadow hover:bg-foreground/90";

export const ContrastButton = React.forwardRef<
  HTMLButtonElement,
  ContrastButtonProps
>(({ className, ...props }, ref) => (
  <Button ref={ref} className={cn(CONTRAST_CLASSES, className)} {...props} />
));
ContrastButton.displayName = "ContrastButton";
