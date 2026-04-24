"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@clerk/nextjs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAiConfig, updateAiConfig } from "@/app/actions/ai-config";
import type { AiProviderName } from "@/lib/ai";
import { ADMIN_ROLE } from "@/lib/auth-roles";

const aiProviderSchema = z.object({
  provider: z.enum(["openrouter", "zai"] as [
    AiProviderName,
    ...AiProviderName[],
  ]),
  model: z.string().trim().min(1, "Model is required"),
});
type AiProviderValues = z.infer<typeof aiProviderSchema>;

export function AiProviderCard() {
  const { has, isLoaded } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const form = useForm<AiProviderValues>({
    resolver: zodResolver(aiProviderSchema),
    defaultValues: { provider: "openrouter", model: "" },
  });
  const { reset } = form;

  const isAdmin = isLoaded && has?.({ role: ADMIN_ROLE });

  useEffect(() => {
    async function loadConfig() {
      try {
        const { config, error } = await getAiConfig();
        if (error) {
          toast.error(error);
          setLoadError(error);
          return;
        }
        setLoadError(null);
        reset({ provider: config.provider, model: config.model });
      } finally {
        setIsLoading(false);
      }
    }
    if (isLoaded && isAdmin) {
      loadConfig();
    }
  }, [isLoaded, isAdmin, reset]);

  if (!isLoaded || !isAdmin) {
    return null;
  }

  const onSubmit = async (values: AiProviderValues) => {
    const result = await updateAiConfig(values.provider, values.model);

    if (result.success) {
      toast.success("AI provider configuration saved");
    } else {
      toast.error(result.error || "Failed to save configuration");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Provider
        </CardTitle>
        <CardDescription>
          Configure the AI provider and model used for episode summarization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading configuration...
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="openrouter">OpenRouter</SelectItem>
                          <SelectItem value="zai">Z.AI</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. google/gemini-2.0-flash-001"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button
                type="submit"
                className="mt-4"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
