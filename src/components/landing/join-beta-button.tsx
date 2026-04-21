import Link from "next/link";
import { SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { ContrastButton } from "@/components/landing/contrast-button";

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
      {withArrow ? <ArrowRight size={16} aria-hidden="true" /> : null}
    </>
  );

  return (
    <>
      <SignedOut>
        <SignUpButton>
          <ContrastButton size="lg">{content}</ContrastButton>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <ContrastButton asChild size="lg">
          <Link href="/dashboard">{content}</Link>
        </ContrastButton>
      </SignedIn>
    </>
  );
}
