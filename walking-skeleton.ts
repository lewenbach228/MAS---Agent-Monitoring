/**
 * P6 — Walking Skeleton (zéro infra)
 * Model-based reflex agent (Russell & Norvig, AIMA ch. 2)
 *
 * Ce script prouve le cœur agentique avant toute infrastructure :
 * - Modèle interne (world model) en mémoire
 * - Événements simulés injectés dans le modèle
 * - Règles réflexes déclenchées par l'état du modèle
 * - Actions produites sans planification longue
 *
 * Usage : npx tsx walking-skeleton.ts
 */

interface ContentNode {
  id: string;
  title: string;
  platform: string;
  sentiment: number;
  engagementVelocity: number;
  shareVelocity: number;
  commentCount: number;
  lastActivityAt: number;
  status: "normal" | "warming" | "crisis" | "viral";
}

interface PlatformNode {
  id: string;
  name: string;
  contentIds: string[];
}

interface WorldModel {
  contents: Map<string, ContentNode>;
  platforms: Map<string, PlatformNode>;
}

interface Event {
  type: "comment" | "engagement" | "sentiment_shift" | "timeout";
  contentId: string;
  platform: string;
  timestamp: number;
  payload: Record<string, number | string>;
}

interface ReflexAction {
  type: "NOTIFY_SLACK" | "NOTIFY_PAGERDUTY" | "BOOST_CONTENT" | "FLAG_CRISIS" | "CHECK_IN";
  severity: "info" | "warning" | "critical";
  contentId: string;
  message: string;
}

const REFLEX_RULES = [
  {
    name: "CRISIS_DETECTED",
    condition: (c: ContentNode) => c.sentiment < -0.5 && c.engagementVelocity > 100,
    action: (c: ContentNode): ReflexAction => ({
      type: "FLAG_CRISIS",
      severity: "critical",
      contentId: c.id,
      message: `CRISE: "${c.title}" — sentiment ${c.sentiment.toFixed(2)} à ${c.engagementVelocity.toFixed(0)} interactions/min`,
    }),
  },
  {
    name: "VIRAL_OPPORTUNITY",
    condition: (c: ContentNode) => c.sentiment > 0.6 && c.shareVelocity > 20,
    action: (c: ContentNode): ReflexAction => ({
      type: "BOOST_CONTENT",
      severity: "info",
      contentId: c.id,
      message: `VIRAL: "${c.title}" — sentiment ${c.sentiment.toFixed(2)}, ${c.shareVelocity.toFixed(0)} partages/min`,
    }),
  },
  {
    name: "ENGAGEMENT_DROP",
    condition: (c: ContentNode) => Date.now() - c.lastActivityAt > 4 * 60 * 60 * 1000 && c.engagementVelocity < 5,
    action: (c: ContentNode): ReflexAction => ({
      type: "CHECK_IN",
      severity: "warning",
      contentId: c.id,
      message: `INACTIF: "${c.title}" — aucune activité depuis 4h+`,
    }),
  },
];

class ModelBasedReflexAgent {
  private model: WorldModel = { contents: new Map(), platforms: new Map() };
  private actionLog: ReflexAction[] = [];

  perceive(event: Event): void {
    const content = this.model.contents.get(event.contentId);
    if (!content) return;

    switch (event.type) {
      case "comment":
        content.commentCount += 1;
        content.lastActivityAt = Date.now();
        break;
      case "engagement":
        content.engagementVelocity = event.payload.velocity as number;
        content.shareVelocity = (event.payload.shares as number) || 0;
        content.lastActivityAt = Date.now();
        break;
      case "sentiment_shift":
        content.sentiment = event.payload.sentiment as number;
        content.engagementVelocity = event.payload.velocity as number;
        content.lastActivityAt = Date.now();
        break;
    }

    if (content.sentiment < -0.3) content.status = "warming";
    if (content.sentiment < -0.5 && content.engagementVelocity > 50) content.status = "crisis";
    if (content.sentiment > 0.6 && content.shareVelocity > 20) content.status = "viral";
    if (content.sentiment >= -0.3 && content.engagementVelocity < 30) content.status = "normal";

    console.log(
      `  [${event.type.padEnd(16)}] ${content.title.padEnd(32)} | ` +
        `sentiment: ${content.sentiment.toFixed(2)} | ` +
        `velocity: ${content.engagementVelocity.toFixed(0)} | ` +
        `status: ${content.status}`
    );
  }

  act(): ReflexAction[] {
    const triggered: ReflexAction[] = [];

    for (const content of this.model.contents.values()) {
      for (const rule of REFLEX_RULES) {
        if (rule.condition(content)) {
          const action = rule.action(content);
          triggered.push(action);
          this.actionLog.push(action);

          const icon = action.severity === "critical" ? "🔴" : action.severity === "warning" ? "⚠️" : "ℹ️";
          console.log(`  ${icon} ACTION [${action.type}] → ${action.message}`);
        }
      }
    }

    return triggered;
  }

  seedContents(contents: ContentNode[]): void {
    for (const c of contents) {
      this.model.contents.set(c.id, c);
      const platform = this.model.platforms.get(c.platform) ?? {
        id: c.platform,
        name: c.platform,
        contentIds: [],
      };
      platform.contentIds.push(c.id);
      this.model.platforms.set(c.platform, platform);
    }
    console.log(`🌱 ${contents.length} contenus initialisés dans le modèle`);
    for (const c of contents) {
      console.log(`   · ${c.platform.padEnd(12)} "${c.title}" (sentiment: ${c.sentiment.toFixed(1)})`);
    }
    console.log("");
  }

  getModel(): WorldModel {
    return this.model;
  }

  getActionLog(): ReflexAction[] {
    return this.actionLog;
  }
}

function main() {
  console.log("=".repeat(64));
  console.log("  P6 — Vigie de Monitoring et Crise Digitale");
  console.log("  Walking Skeleton — Model-based reflex agent");
  console.log("=".repeat(64));
  console.log("");

  const agent = new ModelBasedReflexAgent();

  agent.seedContents([
    {
      id: "yt-1",
      title: "Nouvelle fonctionnalité IA",
      platform: "youtube",
      sentiment: 0.3,
      engagementVelocity: 12,
      shareVelocity: 3,
      commentCount: 5,
      lastActivityAt: Date.now(),
      status: "normal",
    },
    {
      id: "tw-1",
      title: "Annonce partenariat controversé",
      platform: "twitter",
      sentiment: -0.1,
      engagementVelocity: 45,
      shareVelocity: 8,
      commentCount: 23,
      lastActivityAt: Date.now(),
      status: "normal",
    },
    {
      id: "ig-1",
      title: "Tutoriel design",
      platform: "instagram",
      sentiment: 0.7,
      engagementVelocity: 8,
      shareVelocity: 2,
      commentCount: 12,
      lastActivityAt: Date.now(),
      status: "normal",
    },
    {
      id: "li-1",
      title: "Article opinion marché",
      platform: "linkedin",
      sentiment: -0.2,
      engagementVelocity: 3,
      shareVelocity: 1,
      commentCount: 2,
      lastActivityAt: Date.now(),
      status: "normal",
    },
  ]);

  const scenarios: { delay: number; event: Event }[] = [
    { delay: 800, event: { type: "engagement", contentId: "ig-1", platform: "instagram", timestamp: Date.now(), payload: { velocity: 25, shares: 15 } } },
    { delay: 1600, event: { type: "engagement", contentId: "ig-1", platform: "instagram", timestamp: Date.now(), payload: { velocity: 80, shares: 45 } } },
    { delay: 2400, event: { type: "engagement", contentId: "ig-1", platform: "instagram", timestamp: Date.now(), payload: { velocity: 200, shares: 120 } } },
    { delay: 1200, event: { type: "comment", contentId: "tw-1", platform: "twitter", timestamp: Date.now(), payload: { count: 1 } } },
    { delay: 2000, event: { type: "engagement", contentId: "tw-1", platform: "twitter", timestamp: Date.now(), payload: { velocity: 60, shares: 12 } } },
    { delay: 2800, event: { type: "sentiment_shift", contentId: "tw-1", platform: "twitter", timestamp: Date.now(), payload: { sentiment: -0.6, velocity: 150 } } },
    { delay: 3600, event: { type: "sentiment_shift", contentId: "tw-1", platform: "twitter", timestamp: Date.now(), payload: { sentiment: -0.8, velocity: 300 } } },
    { delay: 4400, event: { type: "engagement", contentId: "li-1", platform: "linkedin", timestamp: Date.now(), payload: { velocity: 0, shares: 0 } } },
  ];

  console.log("🎬 Simulation de scénarios en cours...\n");

  let totalDelay = 0;
  for (const s of scenarios) {
    totalDelay += s.delay;
    setTimeout(() => {
      console.log(`\n📥 Événement reçu (${s.event.type} sur ${s.event.contentId}):`);
      agent.perceive(s.event);
      const actions = agent.act();
      if (actions.length === 0) {
        console.log(`  ✅ Aucune règle réflexe déclenchée`);
      }
    }, totalDelay);
  }

  const finalDelay = totalDelay + 2000;
  setTimeout(() => {
    console.log("\n" + "=".repeat(64));
    console.log("📊 BILAN DE LA SIMULATION");
    console.log("=".repeat(64));
    console.log(`\nActions réflexes déclenchées : ${agent.getActionLog().length}`);
    for (const a of agent.getActionLog()) {
      const icon = a.severity === "critical" ? "🔴" : a.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(`  ${icon} [${a.type}] ${a.message}`);
    }
    console.log(`\n✅ Walking Skeleton validé — le cœur model-based reflex fonctionne.`);
    console.log(`   Prochaine étape : API REST + Dashboard React temps réel`);
  }, finalDelay);
}

main();
