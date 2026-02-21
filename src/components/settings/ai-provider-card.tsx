"use client";

import { useState, useEffect } from "react";
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
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAiConfig, updateAiConfig } from "@/app/actions/ai-config";
import type { AiProviderName } from "@/lib/ai";

export function AiProviderCard() {
  const { has, isLoaded } = useAuth();
  const [provider, setProvider] = useState<AiProviderName>("openrouter");
  const [model, setModel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = isLoaded && has?.({ role: "org:admin" });

  useEffect(() => {
    async function loadConfig() {
      try {
        const { config, error } = await getAiConfig();
        if (error) {
          toast.error(error);
          return;
        }
        setProvider(config.provider);
        setModel(config.model);
      } finally {
        setIsLoading(false);
      }
    }
    if (isLoaded && isAdmin) {
      loadConfig();
    }
  }, [isLoaded, isAdmin]);

  if (!isLoaded || !isAdmin) {
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    const result = await updateAiConfig(provider, model);
    setIsSaving(false);

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
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Provider</label>
                <Select
                  value={provider}
                  onValueChange={(v) => setProvider(v as AiProviderName)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="zai">Z.AI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Model</label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. google/gemini-2.0-flash-001"
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={isSaving || !model.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
