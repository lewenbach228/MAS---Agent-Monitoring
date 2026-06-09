import pg from "pg";

const { Pool } = pg;

export interface MetricRow {
  time: Date;
  contentId: string;
  sentiment: number;
  velocity: number;
  shares: number;
  comments: number;
  status: string;
}

export interface MetricBucket {
  bucket: string;
  contentId: string;
  avgSentiment: number;
  maxVelocity: number;
  lastStatus: string;
}

export class MetricsStore {
  private pool: pg.Pool | null = null;

  async connect(connectionString: string): Promise<void> {
    this.pool = new Pool({ connectionString });
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS metrics (
          time       TIMESTAMPTZ NOT NULL,
          content_id TEXT NOT NULL,
          sentiment  DOUBLE PRECISION,
          velocity   INTEGER,
          shares     INTEGER,
          comments   INTEGER,
          status     TEXT
        );
      `);

      // make it a hypertable — idempotent
      await client.query(`SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);`);

      // index for common queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_metrics_content_time
        ON metrics (content_id, time DESC);
      `);

      console.log("✓ TimescaleDB prête (hypertable metrics créée)");
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }

  async record(row: MetricRow): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO metrics (time, content_id, sentiment, velocity, shares, comments, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.time, row.contentId, row.sentiment, row.velocity, row.shares, row.comments, row.status]
      );
    } finally {
      client.release();
    }
  }

  async queryByWindow(contentId: string, windowHours: number): Promise<MetricBucket[]> {
    if (!this.pool) return [];
    const bucketSeconds = Math.max(60, Math.floor(windowHours * 3600 / 20)); // ~20 buckets per window
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT
           time_bucket($1::interval, time) AS bucket,
           content_id,
           ROUND(AVG(sentiment)::numeric, 2)::float8 AS avg_sentiment,
           MAX(velocity) AS max_velocity,
           (array_agg(status ORDER BY time DESC))[1] AS last_status
         FROM metrics
         WHERE content_id = $2 AND time > NOW() - ($3 || ' hours')::interval
         GROUP BY bucket, content_id
         ORDER BY bucket`,
        [`${bucketSeconds} seconds`, contentId, windowHours.toString()]
      );
      return result.rows.map((r) => ({
        bucket: new Date(r.bucket).toISOString(),
        contentId: r.content_id,
        avgSentiment: r.avg_sentiment,
        maxVelocity: r.max_velocity,
        lastStatus: r.last_status,
      }));
    } finally {
      client.release();
    }
  }
}
