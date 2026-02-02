// Prompt templates for AI summarization

export const SYSTEM_PROMPT = `You are an expert podcast summarizer for busy professionals. Your job is to:
1. Create concise, actionable summaries that capture the essence of podcast episodes
2. Extract key takeaways that listeners can immediately apply
3. Provide a "worth it" score to help users decide if the full episode is worth their time

Always respond in valid JSON format. Be objective and focus on value delivered to the listener.`;

export function getSummarizationPrompt(
  podcastTitle: string,
  episodeTitle: string,
  description: string,
  duration: number,
  transcript?: string
): string {
  const durationMinutes = Math.round(duration / 60);
  const hasTranscript = transcript && transcript.length > 100;

  const contentSection = hasTranscript
    ? `## Transcript (full or partial):
${transcript}`
    : `## Episode Description:
${description}

Note: Full transcript not available. Base your analysis on the episode description and metadata.`;

  return `Analyze this podcast episode and provide a summary:

## Podcast: ${podcastTitle}
## Episode: ${episodeTitle}
## Duration: ${durationMinutes} minutes

${contentSection}

Please provide your analysis in the following JSON format:
{
  "summary": "A comprehensive 2-3 paragraph summary of the episode's main content and themes. Be specific about what was discussed, who was interviewed (if applicable), and what value it provides to listeners.",
  "keyTakeaways": [
    "First key insight or actionable takeaway",
    "Second key insight or actionable takeaway",
    "Third key insight or actionable takeaway",
    "Fourth key insight or actionable takeaway (if applicable)",
    "Fifth key insight or actionable takeaway (if applicable)"
  ],
  "worthItScore": 7.5,
  "worthItReason": "A brief explanation (1-2 sentences) of why this score was given, considering factors like: uniqueness of content, actionability of insights, quality of discussion, time investment vs value received."
}

Guidelines for the worth-it score (0-10 scale):
- 9-10: Exceptional content, must-listen for anyone interested in the topic
- 7-8: Strong content with valuable insights, worth the time investment
- 5-6: Average content, some useful points but nothing groundbreaking
- 3-4: Below average, limited value for most listeners
- 1-2: Poor quality or misleading content

Important:
- Extract 3-5 key takeaways, prioritizing actionable insights
- If working from description only, be honest about the limitations
- Consider the time investment (${durationMinutes} min) when scoring
- Focus on value for busy professionals who need to be selective with their time`;
}

export function getQuickSummaryPrompt(
  title: string,
  description: string
): string {
  return `Provide a very brief (2-3 sentence) summary of this podcast episode based on its title and description:

Title: ${title}
Description: ${description}

Respond in JSON format:
{
  "quickSummary": "Your 2-3 sentence summary here"
}`;
}
