"use client";

import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const EpisodeTabs = Tabs;

const EpisodeTabsList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  React.ComponentPropsWithoutRef<typeof TabsList>
>(({ className, ...props }, ref) => (
  <TabsList
    ref={ref}
    className={cn(
      "mb-5 flex h-auto justify-start gap-0.5 rounded-none border-b border-border bg-transparent p-0 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
EpisodeTabsList.displayName = "EpisodeTabsList";

type EpisodeTabsTriggerProps = Omit<
  React.ComponentPropsWithoutRef<typeof TabsTrigger>,
  "asChild"
> & {
  badge?: number | string;
};

const EpisodeTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsTrigger>,
  EpisodeTabsTriggerProps
>(({ className, children, badge, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      "group -mb-px gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none",
      className,
    )}
    {...props}
  >
    {children}
    {badge !== undefined && badge !== 0 && badge !== "" && (
      <span
        className={cn(
          "rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground",
          "group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary",
        )}
      >
        {badge}
      </span>
    )}
  </TabsTrigger>
));
EpisodeTabsTrigger.displayName = "EpisodeTabsTrigger";

const EpisodeTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsContent>,
  React.ComponentPropsWithoutRef<typeof TabsContent>
>(({ className, ...props }, ref) => (
  <TabsContent ref={ref} className={cn("mt-0", className)} {...props} />
));
EpisodeTabsContent.displayName = "EpisodeTabsContent";

export { EpisodeTabs, EpisodeTabsList, EpisodeTabsTrigger, EpisodeTabsContent };
