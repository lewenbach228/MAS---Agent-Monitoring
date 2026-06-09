import express, { Request, Response } from "express";
import { VigieAgent } from "../agent/vigie-agent.js";
import { Event } from "../agent/model.js";

export function createServer(agent: VigieAgent) {
  const app = express();
  app.use(express.json());

  const sseClients = new Set<Response>();

  agent.onEvent((event) => {
    const payload = JSON.stringify(event);
    for (const res of sseClients) {
      res.write(`data: ${payload}\n\n`);
    }
  });

  app.get("/api/stream", async (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const contents = await agent.model.snapshot();
    res.write(`data: ${JSON.stringify({ kind: "snapshot", contents })}\n\n`);

    sseClients.add(res);
    _req.on("close", () => sseClients.delete(res));
  });

  app.post("/api/events", async (req: Request, res: Response) => {
    const event = req.body as Event;
    if (!event.type || !event.contentId) {
      res.status(400).json({ error: "event.type and event.contentId required" });
      return;
    }
    const updated = await agent.perceive(event);
    if (!updated) {
      res.status(404).json({ error: `contentId '${event.contentId}' not found` });
      return;
    }
    res.json({ content: updated, actionLogCount: agent.actionLog.length });
  });

  app.get("/api/contents", async (_req: Request, res: Response) => {
    res.json(await agent.model.snapshot());
  });

  app.get("/api/actions", (_req: Request, res: Response) => {
    res.json(agent.actionLog);
  });

  app.get("/api/metrics", async (req: Request, res: Response) => {
    const contentId = req.query.contentId as string;
    const windowHours = Number(req.query.window) || 1;
    if (!contentId) {
      res.status(400).json({ error: "query param 'contentId' required" });
      return;
    }
    const buckets = await agent.getMetrics(contentId, windowHours);
    res.json({ contentId, windowHours, buckets });
  });

  app.get("/api/postmortem", (req: Request, res: Response) => {
    const contentId = req.query.contentId as string;
    const report = agent.getPostMortem(contentId || undefined);
    res.json(report);
  });

  return app;
}
