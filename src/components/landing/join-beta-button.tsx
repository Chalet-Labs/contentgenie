import Link from "next/link";
import { SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JoinBetaButtonProps {
  label?: string;
  withArrow?: boolean;
}

export function JoinBetaButton({
  label = "Join the beta",
  withArrow = true,
}: JoinBetaButtonProps) {
  const content = (
    <>
      {label}
      {withArrow ? <ArrowRight size={16} /> : null}
    </>
  );

  return (
    <>
      <SignedOut>
        <SignUpButton>
          <Button variant="contrast" size="lg">{content}</Button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <Button asChild variant="contrast" size="lg">
          <Link href="/dashboard">{content}</Link>
        </Button>
      </SignedIn>
    </>
  );
}
