"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"
import { ChevronsUpDown } from "lucide-react"
import { updateSummarizationPrompt } from "@/app/actions/ai-config"
import { searchEpisodesWithTranscript, type EpisodeSearchResult } from "@/app/actions/admin"

const PLACEHOLDERS = [
  "{{transcript}}",
  "{{title}}",
  "{{podcastName}}",
  "{{description}}",
  "{{duration}}",
]

interface PromptTemplateCardProps {
  initialPrompt: string | null
}

export function PromptTemplateCard({ initialPrompt }: PromptTemplateCardProps) {
  const [promptText, setPromptText] = useState(initialPrompt ?? "")
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeSearchResult | null>(null)
  const [testOutput, setTestOutput] = useState("")
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchResults, setSearchResults] = useState<EpisodeSearchResult[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSearchIdRef = useRef(0)
  const testAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      testAbortRef.current?.abort()
    }
  }, [])

  const missingTranscript = promptText.length > 0 && !promptText.includes("{{transcript}}")

  const handleSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const searchId = ++latestSearchIdRef.current
    debounceRef.current = setTimeout(async () => {
      if (!query.trim()) {
        setSearchResults([])
        return
      }
      try {
        const { results, error } = await searchEpisodesWithTranscript(query)
        if (searchId !== latestSearchIdRef.current) return
        if (error) {
          toast.error(error)
          setSearchResults([])
          return
        }
        setSearchResults(results)
      } catch (err) {
        if (searchId !== latestSearchIdRef.current) return
        toast.error("Search failed: " + (err instanceof Error ? err.message : String(err)))
      }
    }, 300)
  }, [])

  const handleTest = async () => {
    if (!selectedEpisode || isTesting || !promptText.trim()) return
    testAbortRef.current?.abort()
    const controller = new AbortController()
    testAbortRef.current = controller
    setIsTesting(true)
    setTestOutput("")

    try {
      const res = await fetch("/api/admin/test-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, episodeId: selectedEpisode.id }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const msg = await res.text()
        toast.error(`Test failed: ${msg}`)
        return
      }

      if (!res.body) {
        toast.error("No response body")
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          const tail = decoder.decode()
          if (tail) setTestOutput((prev) => prev + tail)
          break
        }
        setTestOutput((prev) => prev + decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      toast.error("Test failed: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const normalizedPrompt = promptText.trim().length === 0 ? null : promptText
      const result = await updateSummarizationPrompt(normalizedPrompt)
      if (result.success) {
        toast.success("Prompt saved successfully")
      } else {
        toast.error(result.error ?? "Failed to save prompt")
      }
    } catch (err) {
      toast.error("Failed to save: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      const result = await updateSummarizationPrompt(null)
      if (result.success) {
        setPromptText("")
        toast.success("Prompt reset to default")
      } else {
        toast.error(result.error ?? "Failed to reset prompt")
      }
    } catch (err) {
      toast.error("Failed to reset: " + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summarization Prompt Template</CardTitle>
        <CardDescription>
          Customize the prompt used when generating episode summaries. Leave empty to use the
          built-in default. Test your prompt live against a real episode before saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Textarea */}
        <div className="space-y-2">
          <Textarea
            className="font-mono min-h-[20rem] text-sm"
            placeholder="Enter your custom summarization prompt. Use {{transcript}} where the episode transcript should be inserted."
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
          {missingTranscript && (
            <p className="text-sm text-status-warning-text">
              Warning: prompt must contain {"{{transcript}}"} to work correctly.
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDERS.map((p) => (
              <code
                key={p}
                className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono"
              >
                {p}
              </code>
            ))}
          </div>
        </div>

        {/* Episode picker */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Test episode</p>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between">
                {selectedEpisode
                  ? `${selectedEpisode.podcastTitle} — ${selectedEpisode.title}`
                  : "Search for an episode…"}
                <ChevronsUpDown className="ml-2 shrink-0 opacity-50" data-icon="inline-end" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[500px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search episodes with transcripts…"
                  onValueChange={handleSearch}
                />
                <CommandList>
                  <CommandEmpty>No episodes found.</CommandEmpty>
                  <CommandGroup>
                    {searchResults.map((ep) => (
                      <CommandItem
                        key={ep.id}
                        value={String(ep.id)}
                        onSelect={() => {
                          setSelectedEpisode(ep)
                          setPickerOpen(false)
                        }}
                      >
                        {ep.podcastTitle} — {ep.title}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Test button */}
        <Button
          onClick={handleTest}
          disabled={!selectedEpisode || isTesting || missingTranscript || !promptText.trim()}
          variant="secondary"
        >
          {isTesting ? "Testing…" : "Test Prompt"}
        </Button>

        {/* Test output */}
        {(testOutput || isTesting) && (
          <pre className="max-h-96 overflow-y-auto rounded border bg-muted p-3 text-sm whitespace-pre-wrap">
            {testOutput}
            {isTesting && <span className="animate-pulse">▋</span>}
          </pre>
        )}

        {/* Action row */}
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isTesting || isSaving || missingTranscript}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={isTesting || isSaving}>
                Reset to Default
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to default prompt?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete your custom prompt and revert to the built-in default
                  summarization prompt. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
