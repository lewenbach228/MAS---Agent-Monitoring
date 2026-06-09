import { VigieAgent } from "./agent/vigie-agent.js";
import { createServer } from "./api/server.js";
import { Event } from "./agent/model.js";

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:8787";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASS = process.env.NEO4J_PASS || "vigie123";
const TIMESCALE_URL = process.env.TIMESCALE_URL || "postgresql://vigie:vigie123@localhost:5432/vigie_metrics";

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const agent = new VigieAgent();

  console.log("Connexion à Neo4j...");
  await agent.model.connect(NEO4J_URI, NEO4J_USER, NEO4J_PASS);
  console.log("✓ Connecté à Neo4j");

  console.log("Connexion à TimescaleDB...");
  await agent.metrics.connect(TIMESCALE_URL);

  await agent.model.seed([
    { id: "yt-1", title: "Nouvelle fonctionnalité IA", platform: "youtube", sentiment: 0.3, engagementVelocity: 12, shareVelocity: 3, commentCount: 5, lastActivityAt: Date.now(), status: "normal" },
    { id: "tw-1", title: "Annonce partenariat controversé", platform: "twitter", sentiment: -0.1, engagementVelocity: 45, shareVelocity: 8, commentCount: 23, lastActivityAt: Date.now(), status: "normal" },
    { id: "ig-1", title: "Tutoriel design", platform: "instagram", sentiment: 0.7, engagementVelocity: 8, shareVelocity: 2, commentCount: 12, lastActivityAt: Date.now(), status: "normal" },
    { id: "li-1", title: "Article opinion marché", platform: "linkedin", sentiment: -0.2, engagementVelocity: 3, shareVelocity: 1, commentCount: 2, lastActivityAt: Date.now(), status: "normal" },
  ]);
  console.log("✓ Contenus initialisés dans Neo4j\n");

  function simulate(contentId: string, type: Event["type"], payload: Record<string, number>) {
    agent.perceive({ type, contentId, platform: "", timestamp: Date.now(), payload });
  }

  const app = createServer(agent);

  const server = app.listen(PORT, () => {
    console.log(`P6 Vigie — API prête sur http://localhost:${PORT}`);
    console.log(`  Neo4j Browser    : http://localhost:8788`);
    console.log(`  TimescaleDB      : localhost:5432 (vigie_metrics)`);
    console.log(`  SSE stream       : http://localhost:${PORT}/api/stream`);
    console.log(`  POST events      : curl -X POST http://localhost:${PORT}/api/events ...`);
    console.log(`  GET metrics      : http://localhost:${PORT}/api/metrics?contentId=tw-1&window=1`);
    console.log(`  Dashboard        : http://localhost:5173`);
    console.log("");

    setTimeout(() => simulate("ig-1", "engagement", { velocity: 200, shares: 120 }), 1500);
    setTimeout(() => simulate("tw-1", "sentiment_shift", { sentiment: -0.8, velocity: 300 }), 3000);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} déjà utilisé. Essaie: PORT=3001 npm run api`);
    } else {
      console.error("Erreur serveur:", err.message);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("Échec au démarrage:", err.message);
  process.exit(1);
});
