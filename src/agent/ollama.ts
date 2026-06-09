import { ContentNode } from "./model.js";
import { ReflexAction } from "./rules.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi3:mini";

export async function evaluateWithOllama(content: ContentNode): Promise<ReflexAction | null> {
  const prompt = `You are a real-time crisis detection system for digital content monitoring.

Analyze this content and decide if any action is needed.

Content: "${content.title}"
Platform: ${content.platform}
Sentiment: ${content.sentiment.toFixed(2)}
Engagement velocity: ${content.engagementVelocity}/min
Share velocity: ${content.shareVelocity}/min
Comment count: ${content.commentCount}
Current status: ${content.status}

Respond with EXACTLY one of these: CRISIS, VIRAL, CHECK_IN, or NONE.
If CRISIS: explain why in 5 words max after a colon.
If VIRAL: explain why in 5 words max after a colon.
If CHECK_IN: explain why in 5 words max after a colon.
If NONE: just say NONE.

Examples:
CRISIS: sentiment crashing fast
VIRAL: high sharing velocity
CHECK_IN: no activity for hours
NONE`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { num_predict: 50, temperature: 0.1 },
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { response: string };
    const text = data.response.trim();
    return parseOllamaResponse(text, content);
  } catch {
    return null;
  }
}

function parseOllamaResponse(text: string, content: ContentNode): ReflexAction | null {
  if (text.startsWith("CRISIS")) {
    return {
      type: "FLAG_CRISIS",
      severity: "critical",
      contentId: content.id,
      message: `CRISE: "${content.title}" — ${text.replace("CRISIS:", "").trim() || "alerte déclenchée"}`,
    };
  }
  if (text.startsWith("VIRAL")) {
    return {
      type: "BOOST_CONTENT",
      severity: "info",
      contentId: content.id,
      message: `VIRAL: "${content.title}" — ${text.replace("VIRAL:", "").trim() || "opportunité détectée"}`,
    };
  }
  if (text.startsWith("CHECK_IN")) {
    return {
      type: "CHECK_IN",
      severity: "warning",
      contentId: content.id,
      message: `INACTIF: "${content.title}" — ${text.replace("CHECK_IN:", "").trim() || "aucune activité"}`,
    };
  }
  return null;
}
