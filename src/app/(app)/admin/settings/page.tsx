import { getActiveAiConfig } from "@/lib/ai/config";
import { AiProviderCard } from "@/components/settings/ai-provider-card";
import { PromptTemplateCard } from "@/components/admin/settings/prompt-template-card";

export default async function AdminSettingsPage() {
  const config = await getActiveAiConfig();

  return (
    <div className="space-y-6">
      <AiProviderCard />
      <PromptTemplateCard initialPrompt={config.summarizationPrompt ?? null} />
    </div>
  );
}
