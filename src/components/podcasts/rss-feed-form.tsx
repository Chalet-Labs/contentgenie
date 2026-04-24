"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Rss, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { addPodcastByRssUrl } from "@/app/actions/subscriptions";
import { useSidebarCountsOptional } from "@/contexts/sidebar-counts-context";

const rssFeedSchema = z.object({
  url: z
    .string()
    .trim()
    .pipe(
      z
        .url("Please enter a valid URL")
        .refine(
          (val) => /^https?:\/\//i.test(val),
          "Please enter a valid URL starting with http:// or https://",
        ),
    ),
});
type RssFeedValues = z.infer<typeof rssFeedSchema>;

interface RssFeedFormProps {
  className?: string;
}

export function RssFeedForm({ className }: RssFeedFormProps) {
  const form = useForm<RssFeedValues>({
    resolver: zodResolver(rssFeedSchema),
    defaultValues: { url: "" },
    mode: "onChange",
  });
  const router = useRouter();
  const { refreshCounts } = useSidebarCountsOptional();

  const onSubmit = async (values: RssFeedValues) => {
    const result = await addPodcastByRssUrl(values.url);

    if (result.success) {
      const episodeMsg =
        result.episodeCount != null
          ? ` ${result.episodeCount} episodes imported.`
          : "";
      toast.success(`Subscribed to ${result.title ?? "podcast"}!${episodeMsg}`);
      form.reset();
      refreshCounts();
      if (result.podcastIndexId) {
        router.push(`/podcast/${result.podcastIndexId}?from=discover`);
      }
    } else {
      toast.error(result.error ?? "Failed to add podcast");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        <div className="flex gap-2">
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem className="relative flex-1 space-y-0">
                <Rss className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <FormControl>
                  <Input
                    type="text"
                    placeholder="Paste RSS feed URL..."
                    disabled={form.formState.isSubmitting}
                    className="pl-9"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={form.formState.isSubmitting || !form.formState.isValid}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Feed"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
