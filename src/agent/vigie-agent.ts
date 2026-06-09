import { WorldModel, Event, ContentNode } from "./model.js";
import { evaluate, evaluateWithFallback, ReflexAction } from "./rules.js";
import { MetricsStore, MetricBucket } from "./metrics.js";
import { generatePostMortem, getPostMortem, PostMortemReport } from "./postmortem.js";

export interface AgentEvent {
  kind: "snapshot" | "perception" | "action" | "metric_buckets" | "postmortem";
  contents?: ContentNode[];
  content?: ContentNode;
  actions?: ReflexAction[];
  buckets?: MetricBucket[];
  postmortem?: PostMortemReport;
}

export type AgentObserver = (event: AgentEvent) => void;

export class VigieAgent {
  model = new WorldModel();
  metrics = new MetricsStore();
  actionLog: ReflexAction[] = [];
  private previousStatuses = new Map<string, string>();
  private observers: AgentObserver[] = [];

  onEvent(observer: AgentObserver): void {
    this.observers.push(observer);
  }

  private emit(event: AgentEvent): void {
    for (const obs of this.observers) obs(event);
  }

  async perceive(event: Event): Promise<ContentNode | null> {
    const updated = await this.model.perceive(event);
    if (!updated) return null;

    this.emit({ kind: "perception", content: updated });

    // record time-series metric
    await this.metrics.record({
      time: new Date(),
      contentId: updated.id,
      sentiment: updated.sentiment,
      velocity: updated.engagementVelocity,
      shares: updated.shareVelocity,
      comments: updated.commentCount,
      status: updated.status,
    });

    // evaluate rules + Ollama for reflex decisions
    const ruleActions = evaluate(updated);
    const ollamaActions = await evaluateWithFallback(updated);
    const allActions = [...ruleActions, ...ollamaActions];
    const newActions = allActions.filter(
      (a) => !this.actionLog.some((existing) => existing.message === a.message)
    );
    for (const a of newActions) this.actionLog.push(a);
    if (newActions.length > 0) this.emit({ kind: "action", actions: newActions });

    // detect status transition → postmortem if crisis resolved
    const prevStatus = this.previousStatuses.get(updated.id);
    if (prevStatus === "crisis" && updated.status !== "crisis") {
      const crisisActions = this.actionLog.filter(
        (a) => a.contentId === updated.id && a.type === "FLAG_CRISIS"
      );
      const report = await generatePostMortem(updated, crisisActions, process.env.OPENAI_API_KEY);
      this.emit({ kind: "postmortem", postmortem: report });
    }
    this.previousStatuses.set(updated.id, updated.status);

    return updated;
  }

  async getMetrics(contentId: string, windowHours: number): Promise<MetricBucket[]> {
    const buckets = await this.metrics.queryByWindow(contentId, windowHours);
    this.emit({ kind: "metric_buckets", buckets });
    return buckets;
  }

  getPostMortem(contentId?: string): PostMortemReport | PostMortemReport[] | null {
    return getPostMortem(contentId);
  }
}
