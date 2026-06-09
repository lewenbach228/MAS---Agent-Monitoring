import { ContentNode } from "./model.js";
import { evaluateWithOllama } from "./ollama.js";

export interface ReflexAction {
  type: "FLAG_CRISIS" | "BOOST_CONTENT" | "CHECK_IN";
  severity: "info" | "warning" | "critical";
  contentId: string;
  message: string;
}

interface Rule {
  name: string;
  condition: (c: ContentNode) => boolean;
  action: (c: ContentNode) => ReflexAction;
}

const RULES: Rule[] = [
  {
    name: "CRISIS_DETECTED",
    condition: (c) => c.status === "crisis",
    action: (c) => ({
      type: "FLAG_CRISIS",
      severity: "critical",
      contentId: c.id,
      message: `CRISE: "${c.title}" — sentiment ${c.sentiment.toFixed(2)}, ${c.engagementVelocity.toFixed(0)} interactions/min`,
    }),
  },
  {
    name: "VIRAL_OPPORTUNITY",
    condition: (c) => c.status === "viral",
    action: (c) => ({
      type: "BOOST_CONTENT",
      severity: "info",
      contentId: c.id,
      message: `VIRAL: "${c.title}" — sentiment ${c.sentiment.toFixed(2)}, ${c.shareVelocity.toFixed(0)} partages/min`,
    }),
  },
  {
    name: "ENGAGEMENT_DROP",
    condition: (c) => Date.now() - c.lastActivityAt > 4 * 60 * 60 * 1000 && c.engagementVelocity < 5,
    action: (c) => ({
      type: "CHECK_IN",
      severity: "warning",
      contentId: c.id,
      message: `INACTIF: "${c.title}" — aucune activité depuis 4h+`,
    }),
  },
];

export function evaluate(content: ContentNode): ReflexAction[] {
  return RULES.filter((r) => r.condition(content)).map((r) => r.action(content));
}

export async function evaluateWithFallback(content: ContentNode): Promise<ReflexAction[]> {
  const ollamaAction = await evaluateWithOllama(content);
  if (ollamaAction) return [ollamaAction];
  return evaluate(content);
}

export function getRules(): Rule[] {
  return RULES;
}
