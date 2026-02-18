// Prompt templates for AI summarization

export const SYSTEM_PROMPT = `You are a critical podcast evaluator for busy professionals. Your job is to:
1. Create structured, actionable summaries that capture the essence of podcast episodes
2. Extract key takeaways that listeners can immediately apply
3. Provide a calibrated "worth it" score using dimensional scoring

You are a tough but fair critic. A score of 5 is the average baseline — most episodes are average. You must justify every point above 5 with specific evidence from the content. Scores of 8+ are reserved for truly exceptional content with unique perspectives and highly actionable insights. A 10 is virtually unheard of.

Always respond in valid JSON format. Be objective and resist score inflation.`;

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

  return `Analyze this podcast episode and provide a structured summary:

## Podcast: ${podcastTitle}
## Episode: ${episodeTitle}
## Duration: ${durationMinutes} minutes

${contentSection}

Please provide your analysis in the following JSON format:
{
  "summary": "## TL;DR\\n2-3 sentence overview.\\n\\n## What You'll Learn\\n- Bullet point 1\\n- Bullet point 2\\n- Bullet point 3\\n\\n## Notable Quotes\\n> Quote 1 (if available from transcript)\\n\\n## Action Items\\n- Concrete next step 1\\n- Concrete next step 2\\n\\n## Bottom Line\\n1-2 sentence verdict on whether this episode is worth the time investment.",
  "keyTakeaways": [
    "First actionable insight",
    "Second actionable insight",
    "Third actionable insight"
  ],
  "worthItDimensions": {
    "uniqueness": 5,
    "actionability": 5,
    "timeValue": 5
  },
  "worthItScore": 5.0,
  "worthItReason": "The Bottom Line section text — 1-2 sentence verdict."
}

## Scoring Dimensions (each 1-10):
- **uniqueness**: How original is the content? Does it offer perspectives not found elsewhere?
- **actionability**: How practical are the insights? Can the listener do something concrete afterward?
- **timeValue**: Is the value delivered worth the ${durationMinutes}-minute time investment?

## Anti-Inflation Scoring Guide:
- 1-2: Poor — misleading or no useful content
- 3-4: Below average — limited value, mostly recycled ideas
- **5: Average** — decent content, nothing special (this is the baseline)
- 6-7: Above average — solid insights, worth the time
- 8-9: Exceptional — unique perspectives, highly actionable
- 10: Masterpiece — field-defining, must-listen

The **worthItScore** is the average of the three dimensions, rounded to 1 decimal place.

Important:
- 5 is the average baseline. Justify every point above 5 with specific evidence.
- Extract 3-5 key takeaways, prioritizing actionable insights
- If working from description only, be honest about the limitations and score conservatively
- The summary must include all 5 sections (TL;DR, What You'll Learn, Notable Quotes, Action Items, Bottom Line) using ## headers
- If no notable quotes are available, write "No direct quotes available" under that section
- Consider the time investment (${durationMinutes} min) when scoring timeValue
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
