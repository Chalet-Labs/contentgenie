"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const EpisodeTabs = TabsPrimitive.Root;

const EpisodeTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("mb-5 flex gap-0.5 border-b border-border", className)}
    {...props}
  />
));
EpisodeTabsList.displayName = "EpisodeTabsList";

const EpisodeTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    badge?: React.ReactNode;
  }
>(({ className, children, badge, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "group -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
    {badge != null && (
      <span
        className={cn(
          "rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground",
          "group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary",
        )}
      >
        {badge}
      </span>
    )}
  </TabsPrimitive.Trigger>
));
EpisodeTabsTrigger.displayName = "EpisodeTabsTrigger";

const EpisodeTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
EpisodeTabsContent.displayName = "EpisodeTabsContent";

export { EpisodeTabs, EpisodeTabsList, EpisodeTabsTrigger, EpisodeTabsContent };
