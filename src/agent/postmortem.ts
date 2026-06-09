import { ContentNode } from "./model.js";
import { ReflexAction } from "./rules.js";

export interface PostMortemReport {
  contentId: string;
  title: string;
  triggeredAt: number;
  resolvedAt: number;
  severity: string;
  summary: string;
  actions: string[];
  recommendations: string[];
}

const reports = new Map<string, PostMortemReport>();

export function getPostMortem(contentId?: string): PostMortemReport | PostMortemReport[] | null {
  if (contentId) return reports.get(contentId) ?? null;
  return Array.from(reports.values());
}

export async function generatePostMortem(
  content: ContentNode,
  actions: ReflexAction[],
  openaiKey?: string
): Promise<PostMortemReport> {
  const existing = reports.get(content.id);
  const report: PostMortemReport = {
    contentId: content.id,
    title: content.title,
    triggeredAt: existing?.triggeredAt ?? Date.now(),
    resolvedAt: Date.now(),
    severity: actions.some((a) => a.severity === "critical") ? "critical" : "warning",
    summary: "",
    actions: actions.map((a) => a.message),
    recommendations: [],
  };

  if (openaiKey) {
    try {
      report.summary = await callOpenAI(content, actions, openaiKey);
      report.recommendations = extractRecommendations(report.summary);
    } catch {
      report.summary = fallbackSummary(content, actions);
    }
  } else {
    report.summary = fallbackSummary(content, actions);
  }

  reports.set(content.id, report);
  return report;
}

function fallbackSummary(content: ContentNode, actions: ReflexAction[]): string {
  const actionTypes = actions.map((a) => a.type).join(", ");
  return `Crise détectée sur "${content.title}" (sentiment: ${content.sentiment.toFixed(2)}). Actions déclenchées: ${actionTypes}. Surveillance renforcée activée.`;
}

async function callOpenAI(content: ContentNode, actions: ReflexAction[], apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a crisis analyst. Generate a concise post-mortem analysis (max 150 words) covering: root cause, impact, actions taken, and recommendations.",
        },
        {
          role: "user",
          content: `Content: "${content.title}"\nSentiment: ${content.sentiment.toFixed(2)}\nEngagement: ${content.engagementVelocity.toFixed(0)}/min\nActions: ${actions.map((a) => a.message).join("; ")}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
  const data = (await response.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? fallbackSummary(content, actions);
}

function extractRecommendations(summary: string): string[] {
  const lines = summary.split("\n").filter((l) => l.match(/recommend|suggest|should|action|implement|review/i));
  return lines.length > 0 ? lines.map((l) => l.replace(/^[-*\d.]+/, "").trim()).slice(0, 3) : ["Review monitoring thresholds", "Document incident response", "Update escalation procedures"];
}
