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
  const durationMinutes = duration > 0 ? Math.round(duration / 60) : null;
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
## Duration: ${durationMinutes != null ? `${durationMinutes} minutes` : "Unknown"}

${contentSection}

Please provide your analysis in the following JSON format:
{
  "summary": "## TL;DR\\n1 sentence.\\n\\n## What You'll Learn\\n- Bullet point 1\\n- Bullet point 2\\n- Bullet point 3\\n\\n## Notable Quotes / Key Moments\\n- Standout moment 1 (~XX:XX)\\n- Standout moment 2 (~XX:XX)\\n\\n## Action Items\\n- Concrete next step 1\\n- Concrete next step 2\\n\\n## Bottom Line\\n1-2 sentence verdict on whether this episode is worth the time investment.",
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
- **timeValue**: Is the value delivered worth the ${durationMinutes != null ? `${durationMinutes}-minute` : "unknown"} time investment?

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
- The summary must include all 5 sections (TL;DR, What You'll Learn, Notable Quotes / Key Moments, Action Items, Bottom Line) using ## headers
- For Notable Quotes / Key Moments: include 2-3 standout moments; add approximate timestamps (~XX:XX) when working from a transcript; write "No notable moments available" if nothing stands out
- Consider the time investment (${durationMinutes != null ? `${durationMinutes} min` : "unknown duration"}) when scoring timeValue
- Focus on value for busy professionals who need to be selective with their time`;
}

export const TRENDING_TOPICS_SYSTEM_PROMPT = `You are a podcast trend analyst. Your job is to identify distinct topic clusters from podcast episode summaries. Group related topics together into 5-8 clear, non-overlapping clusters. Each cluster should have a concise name and a brief description.

Always respond in valid JSON format.`;

export function getTrendingTopicsPrompt(
  episodes: Array<{ id: number; title: string; keyTakeaways: string[] }>
): string {
  const episodeList = episodes
    .map(
      (ep) =>
        `- [ID: ${ep.id}] "${ep.title}"\n  Takeaways: ${ep.keyTakeaways.join("; ")}`
    )
    .join("\n");

  return `Analyze these ${episodes.length} recently summarized podcast episodes and identify 5-8 trending topic clusters:

${episodeList}

Respond in this JSON format:
{
  "topics": [
    {
      "name": "Short topic name (2-5 words)",
      "description": "One sentence describing what this topic cluster covers",
      "episodeCount": 3,
      "episodeIds": [1, 5, 12]
    }
  ]
}

Rules:
- Extract 5-8 distinct topic clusters (fewer if there aren't enough distinct themes)
- Each episode can appear in multiple clusters if relevant
- episodeIds must only contain IDs from the provided list
- episodeCount must equal the length of episodeIds
- Sort topics by episodeCount descending (most popular first)
- Topic names should be concise and professional (e.g., "AI & Machine Learning", "Leadership & Management")
- If fewer than 3 episodes are provided, return fewer clusters proportionally (minimum 1)`;
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
