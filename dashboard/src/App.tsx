import { useEffect, useState, useRef } from "react";
import "./App.css";

interface ContentNode {
  id: string;
  title: string;
  platform: string;
  sentiment: number;
  engagementVelocity: number;
  shareVelocity: number;
  commentCount: number;
  status: string;
}

interface ReflexAction {
  type: string;
  severity: string;
  contentId: string;
  message: string;
}

type StatusColor = { bg: string; text: string; dot: string };

const STATUS_COLORS: Record<string, StatusColor> = {
  normal: { bg: "#f0fdf4", text: "#166534", dot: "#22c55e" },
  warming: { bg: "#fff7ed", text: "#9a3412", dot: "#f97316" },
  crisis: { bg: "#fef2f2", text: "#991b1b", dot: "#ef4444" },
  viral: { bg: "#f0f9ff", text: "#1e40af", dot: "#3b82f6" },
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube: "▶️",
  twitter: "𝕏",
  instagram: "📸",
  linkedin: "💼",
};

type AgentEvent =
  | { kind: "snapshot"; contents: ContentNode[] }
  | { kind: "perception"; content: ContentNode }
  | { kind: "action"; actions: ReflexAction[] };

export default function App() {
  const [contents, setContents] = useState<ContentNode[]>([]);
  const [actions, setActions] = useState<ReflexAction[]>([]);
  const [connected, setConnected] = useState(false);
  const eventLogEndRef = useRef<HTMLDivElement>(null);
  const [contentId, setContentId] = useState("tw-1");
  const [eventType, setEventType] = useState("sentiment_shift");
  const [sentiment, setSentiment] = useState("-0.8");
  const [velocity, setVelocity] = useState("300");

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (msg) => {
      try {
        const event: AgentEvent = JSON.parse(msg.data);

        if (event.kind === "snapshot") {
          setContents(event.contents);
        } else if (event.kind === "perception" && event.content) {
          setContents((prev) =>
            prev.map((c) => (c.id === event.content.id ? event.content : c))
          );
        } else if (event.kind === "action" && event.actions) {
          setActions((prev) => {
            const newActions = event.actions.filter(
              (a) => !prev.some((p) => p.message === a.message)
            );
            return [...newActions, ...prev];
          });
        }
      } catch {}
    };

    return () => es.close();
  }, []);

  useEffect(() => {
    eventLogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [actions]);

  const injectEvent = async () => {
    const body: Record<string, unknown> = {
      type: eventType,
      contentId,
      platform: contents.find((c) => c.id === contentId)?.platform ?? "",
      timestamp: Date.now(),
      payload: {},
    };

    if (eventType === "sentiment_shift") {
      body.payload = { sentiment: Number(sentiment), velocity: Number(velocity) };
    } else if (eventType === "engagement") {
      body.payload = { velocity: Number(velocity), shares: Number(sentiment) };
    }

    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {}
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Vigie Monitoring</h1>
          <span className="subtitle">Model-based reflex agent — temps réel</span>
        </div>
        <div className="connection-status" data-connected={connected}>
          <span className="dot" />
          {connected ? "Connecté" : "Déconnecté"}
        </div>
      </header>

      <div className="grid">
        {/* Content cards */}
        <section className="card contents-card">
          <h2>Contenus surveillés</h2>
          <div className="content-grid">
            {contents.map((c) => {
              const colors = STATUS_COLORS[c.status] ?? STATUS_COLORS.normal;
              return (
                <div key={c.id} className="content-card" style={{ borderLeftColor: colors.dot }}>
                  <div className="content-header">
                    <span className="platform-icon">{PLATFORM_ICONS[c.platform] ?? "🌐"}</span>
                    <strong>{c.title}</strong>
                  </div>
                  <div className="content-stats">
                    <div className="stat">
                      <span className="stat-label">Sentiment</span>
                      <span className="stat-value" style={{ color: c.sentiment < -0.3 ? "#ef4444" : c.sentiment > 0.5 ? "#22c55e" : "#f59e0b" }}>
                        {c.sentiment.toFixed(2)}
                      </span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Vélocité</span>
                      <span className="stat-value">{c.engagementVelocity.toFixed(0)}/min</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Partages</span>
                      <span className="stat-value">{c.shareVelocity.toFixed(0)}/min</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Commentaires</span>
                      <span className="stat-value">{c.commentCount}</span>
                    </div>
                  </div>
                  <span className="status-badge" style={{ background: colors.bg, color: colors.text, borderColor: colors.dot }}>
                    <span className="status-dot" style={{ background: colors.dot }} />
                    {c.status}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Action log */}
        <section className="card action-card">
          <h2>Actions réflexes</h2>
          <div className="action-log">
            {actions.length === 0 && <p className="empty">Aucune action déclenchée</p>}
            {actions.map((a, i) => (
              <div key={i} className={`action-entry severity-${a.severity}`}>
                <span className="action-severity">
                  {a.severity === "critical" ? "🔴" : a.severity === "warning" ? "⚠️" : "ℹ️"}
                </span>
                <span className="action-type">{a.type}</span>
                <span className="action-msg">{a.message}</span>
              </div>
            ))}
            <div ref={eventLogEndRef} />
          </div>
        </section>
      </div>

      {/* Event injector */}
      <section className="card injector-card">
        <h2>Injecter un événement</h2>
        <div className="injector-form">
          <select value={contentId} onChange={(e) => setContentId(e.target.value)}>
            {contents.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>

          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="sentiment_shift">Changement sentiment</option>
            <option value="engagement">Engagement</option>
            <option value="comment">Commentaire</option>
          </select>

          {eventType === "sentiment_shift" && (
            <>
              <input type="number" step="0.1" min="-1" max="1" value={sentiment} onChange={(e) => setSentiment(e.target.value)} placeholder="Sentiment (-1 à 1)" />
              <input type="number" value={velocity} onChange={(e) => setVelocity(e.target.value)} placeholder="Vélocité" />
            </>
          )}

          {eventType === "engagement" && (
            <input type="number" value={velocity} onChange={(e) => setVelocity(e.target.value)} placeholder="Vélocité" />
          )}

          <button onClick={injectEvent}>Envoyer l'événement</button>
        </div>
      </section>
    </div>
  );
}
