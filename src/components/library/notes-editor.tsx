"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Check, StickyNote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { updateLibraryNotes } from "@/app/actions/library";

interface NotesEditorProps {
  episodePodcastIndexId: string;
  initialNotes: string;
  onNotesChange?: (notes: string) => void;
}

export function NotesEditor({
  episodePodcastIndexId,
  initialNotes,
  onNotesChange,
}: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(initialNotes);

  const saveNotes = useCallback(
    async (notesValue: string) => {
      if (notesValue === lastSavedRef.current) {
        return;
      }

      setIsSaving(true);
      setError(null);

      const result = await updateLibraryNotes(episodePodcastIndexId, notesValue);

      if (result.success) {
        lastSavedRef.current = notesValue;
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      } else {
        setError(result.error || "Failed to save notes");
      }

      setIsSaving(false);
    },
    [episodePodcastIndexId]
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (notes !== lastSavedRef.current) {
        saveNotes(notes);
      }
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [notes, saveNotes]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setNotes(newNotes);
    setIsSaved(false);
    onNotesChange?.(newNotes);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-4 w-4" />
          Notes
        </label>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isSaving && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {isSaved && !isSaving && (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Saved</span>
            </>
          )}
          {error && <span className="text-destructive">{error}</span>}
        </div>
      </div>
      <Textarea
        value={notes}
        onChange={handleChange}
        placeholder="Add your notes about this episode..."
        className="min-h-[100px] resize-y"
      />
    </div>
  );
}
