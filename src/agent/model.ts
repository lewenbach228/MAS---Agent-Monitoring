import neo4j, { Driver, Session, Integer } from "neo4j-driver";

export type ContentStatus = "normal" | "warming" | "crisis" | "viral";

export interface ContentNode {
  id: string;
  title: string;
  platform: string;
  sentiment: number;
  engagementVelocity: number;
  shareVelocity: number;
  commentCount: number;
  lastActivityAt: number;
  status: ContentStatus;
}

export interface PlatformNode {
  id: string;
  name: string;
}

export interface Event {
  type: "comment" | "engagement" | "sentiment_shift" | "timeout";
  contentId: string;
  platform: string;
  timestamp: number;
  payload: Record<string, number | string>;
}

function toNumber(v: number | Integer): number {
  return typeof v === "number" ? v : v.toNumber();
}

function toContentNode(record: Record<string, unknown>): ContentNode {
  const p = record as Record<string, unknown>;
  return {
    id: p.id as string,
    title: p.title as string,
    platform: p.platform as string,
    sentiment: p.sentiment as number,
    engagementVelocity: toNumber(p.engagementVelocity as number | Integer),
    shareVelocity: toNumber(p.shareVelocity as number | Integer),
    commentCount: toNumber(p.commentCount as number | Integer),
    lastActivityAt: toNumber(p.lastActivityAt as number | Integer),
    status: p.status as ContentStatus,
  };
}

export class WorldModel {
  private driver: Driver | null = null;

  async connect(uri: string, user: string, password: string): Promise<void> {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    await this.driver?.close();
  }

  private session(): Session {
    if (!this.driver) throw new Error("WorldModel not connected. Call connect() first.");
    return this.driver.session();
  }

  async seed(seedlings: ContentNode[]): Promise<void> {
    const session = this.session();
    try {
      for (const c of seedlings) {
        await session.run(
          `MERGE (c:Content {id: $id})
           SET c.title = $title, c.platform = $platform, c.sentiment = $sentiment,
               c.engagementVelocity = $velocity, c.shareVelocity = $shares,
               c.commentCount = $comments, c.lastActivityAt = $lastActivity,
               c.status = $status`,
          { id: c.id, title: c.title, platform: c.platform, sentiment: c.sentiment,
            velocity: neo4j.int(c.engagementVelocity), shares: neo4j.int(c.shareVelocity),
            comments: neo4j.int(c.commentCount), lastActivity: neo4j.int(c.lastActivityAt),
            status: c.status }
        );
        await session.run(
          `MERGE (p:Platform {id: $id}) SET p.name = $name`,
          { id: c.platform, name: c.platform }
        );
        await session.run(
          `MATCH (c:Content {id: $cid}), (p:Platform {id: $pid})
           MERGE (c)-[:POSTED_ON]->(p)`,
          { cid: c.id, pid: c.platform }
        );
      }
    } finally {
      await session.close();
    }
  }

  async perceive(event: Event): Promise<ContentNode | null> {
    const existing = await this.getContent(event.contentId);
    if (!existing) return null;

    const updated = { ...existing };

    switch (event.type) {
      case "comment":
        updated.commentCount += 1;
        updated.lastActivityAt = Date.now();
        break;
      case "engagement":
        updated.engagementVelocity = event.payload.velocity as number;
        updated.shareVelocity = (event.payload.shares as number) ?? updated.shareVelocity;
        updated.lastActivityAt = Date.now();
        break;
      case "sentiment_shift":
        updated.sentiment = event.payload.sentiment as number;
        updated.engagementVelocity = event.payload.velocity as number;
        updated.lastActivityAt = Date.now();
        break;
    }

    updated.status = this.computeStatus(updated);

    const sess = this.session();
    try {
      await sess.run(
        `MATCH (c:Content {id: $id})
         SET c.sentiment = $sentiment, c.engagementVelocity = $velocity,
             c.shareVelocity = $shares, c.commentCount = $comments,
             c.lastActivityAt = $lastActivity, c.status = $status`,
        { id: updated.id, sentiment: updated.sentiment, velocity: neo4j.int(updated.engagementVelocity),
          shares: neo4j.int(updated.shareVelocity), comments: neo4j.int(updated.commentCount),
          lastActivity: neo4j.int(updated.lastActivityAt), status: updated.status }
      );
    } finally {
      await sess.close();
    }

    return updated;
  }

  async getContent(id: string): Promise<ContentNode | null> {
    const sess = this.session();
    try {
      const result = await sess.run(
        `MATCH (c:Content {id: $id}) RETURN c`,
        { id }
      );
      if (result.records.length === 0) return null;
      return toContentNode(result.records[0].get("c").properties);
    } finally {
      await sess.close();
    }
  }

  async snapshot(): Promise<ContentNode[]> {
    const sess = this.session();
    try {
      const result = await sess.run(`MATCH (c:Content) RETURN c ORDER BY c.id`);
      return result.records.map((r) => toContentNode(r.get("c").properties));
    } finally {
      await sess.close();
    }
  }

  private computeStatus(c: ContentNode): ContentStatus {
    if (c.sentiment < -0.5 && c.engagementVelocity > 50) return "crisis";
    if (c.sentiment > 0.6 && c.shareVelocity > 20) return "viral";
    if (c.sentiment < -0.3) return "warming";
    if (c.sentiment >= -0.3 && c.engagementVelocity < 30) return "normal";
    return c.status;
  }
}
