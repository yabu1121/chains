"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { avatarUrl } from "@/lib/api";
import {
  useFriends,
  useIncomingRequests,
  useNetwork,
  useOutgoingRequests,
} from "@/lib/hooks";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { prefersReducedMotion, useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { ProfileModal } from "./ProfileModal";
import { Select } from "./Select";

// react-force-graph-2d reaches for `window`, so it must load client-only.
// Its prop generics don't survive next/dynamic cleanly, hence the cast.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

type Role = "self" | "friend" | "other";

interface GraphNode {
  id: string;
  display_name: string;
  role: Role;
  avatar_updated_at: string | null;
  languages: string[];
  // populated by the force simulation at runtime
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  // True for a friend request still in flight (rendered as a dashed edge).
  pending: boolean;
}

const COLORS: Record<Role, string> = {
  self: "#4cb5f5", // bluesky
  friend: "#34675c", // pine
  other: "#6b7280",
};

/** Tracks a container's pixel size so the canvas can fill it. */
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize((s) =>
        s.width === width && s.height === height ? s : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

export function NetworkGraph({
  onEditProfile,
}: {
  onEditProfile?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { graph, isLoading, error } = useNetwork();
  const { friends } = useFriends();
  const { requests: incoming } = useIncomingRequests();
  const { requests: outgoing } = useOutgoingRequests();
  const { ref, size } = useSize();
  const panelRef = useReveal<HTMLDivElement>({ y: 8 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  // Center on the viewer's own node once the layout settles (re-arm per load).
  const focusedRef = useRef(false);
  useEffect(() => {
    focusedRef.current = false;
  }, [graph]);

  // Mobile / touch: render fewer things and don't repaint continuously.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px), (pointer: coarse)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Current visible graph-space rectangle (with margin), recomputed each frame
  // in onRenderFramePre. Used to cull off-screen nodes/links so only the
  // people around the current view are drawn — and it follows you as you pan.
  const viewRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const inView = (n: { x?: number; y?: number }) => {
    const v = viewRef.current;
    if (!v || n.x == null || n.y == null) return true; // before first frame, show all
    return n.x >= v.minX && n.x <= v.maxX && n.y >= v.minY && n.y <= v.maxY;
  };

  // Preload avatar images so nodeCanvasObject can draw them. Keyed by user id;
  // each <img> carries its version in dataset.v so a changed avatar reloads.
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [, redraw] = useState(0);

  const friendIds = useMemo(
    () => new Set(friends.map((f) => f.user.id)),
    [friends],
  );

  // Build a fresh, mutable graph for the simulation, tagging each node's role.
  const data = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const nodes: GraphNode[] = graph.nodes.map((n) => ({
      id: n.id,
      display_name: n.display_name,
      avatar_updated_at: n.avatar_updated_at,
      languages: n.languages ?? [],
      role:
        n.id === user?.id
          ? "self"
          : friendIds.has(n.id)
            ? "friend"
            : "other",
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      pending: false,
    }));
    // Directed dashed edges for in-flight requests, pointing from the requester
    // to the addressee: outgoing → you to them, incoming → them to you. Skip
    // ids absent from the (possibly capped) node set to keep links valid.
    if (user?.id && nodeIds.has(user.id)) {
      for (const r of outgoing) {
        if (r.user.id !== user.id && nodeIds.has(r.user.id)) {
          links.push({ source: user.id, target: r.user.id, pending: true });
        }
      }
      for (const r of incoming) {
        if (r.user.id !== user.id && nodeIds.has(r.user.id)) {
          links.push({ source: r.user.id, target: user.id, pending: true });
        }
      }
    }
    return { nodes, links };
  }, [graph, user?.id, friendIds, incoming, outgoing]);

  // Languages that at least one node in the graph lists, in canonical order.
  const graphLanguages = useMemo(() => {
    const present = new Set(data.nodes.flatMap((n) => n.languages));
    return PROGRAMMING_LANGUAGES.filter((lang) => present.has(lang));
  }, [data]);

  // A node matches when no filter is set, or it lists the selected language.
  const matches = (n: GraphNode) => !language || n.languages.includes(language);
  const matchCount = language
    ? data.nodes.filter((n) => n.languages.includes(language)).length
    : data.nodes.length;

  // Pending (request) edges are drawn as marching-ants dashes. When any exist
  // we keep the canvas repainting every frame (autoPauseRedraw off) so the
  // dashes flow; otherwise we let the graph idle. Held still for reduced motion.
  const reduce = prefersReducedMotion();
  const hasPending = data.links.some((l) => l.pending);
  // On mobile, don't keep the canvas repainting for the marching-ants dashes:
  // the continuous redraw is a big battery/FPS cost. The dashed arrow still
  // renders (just held still), and autoPauseRedraw lets the graph idle.
  const animateEdges = hasPending && !reduce && !isMobile;

  useEffect(() => {
    const cache = imgCacheRef.current;
    for (const n of data.nodes) {
      const v = n.avatar_updated_at;
      if (!v) {
        cache.delete(n.id);
        continue;
      }
      const existing = cache.get(n.id);
      if (existing && existing.dataset.v === v) continue;
      const img = new Image();
      img.dataset.v = v;
      img.onload = () => redraw((t) => t + 1); // repaint once the image is ready
      img.src = avatarUrl(n.id, v);
      cache.set(n.id, img);
    }
  }, [data]);

  return (
    <>
    <div
      ref={panelRef}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          padding: "16px 20px 0",
        }}
      >
        <h2 className="section-title" style={{ margin: 0 }}>
          {t.network.title}
        </h2>
        <div
          style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
        >
          {graphLanguages.length > 0 ? (
            <Select
              value={language}
              onChange={setLanguage}
              ariaLabel={t.network.highlightByLanguage}
              options={[
                { value: "", label: t.network.allLanguages },
                ...graphLanguages.map((lang) => ({ value: lang, label: lang })),
              ]}
            />
          ) : null}
          <div className="muted" style={{ fontSize: 13 }}>
            <Legend color={COLORS.self} label={t.network.legendYou} />
            <Legend color={COLORS.friend} label={t.network.legendFriends} />
            <Legend color={COLORS.other} label={t.network.legendEveryone} />
            <Legend color={COLORS.self} label={t.network.legendPending} dashed />
          </div>
        </div>
      </div>

      {error ? (
        <p className="error" style={{ padding: "0 20px" }}>
          {t.network.couldNotLoad}
        </p>
      ) : isLoading || !graph ? (
        <p className="empty" style={{ padding: "0 20px" }}>
          {t.network.loading}
        </p>
      ) : data.nodes.length === 0 ? (
        <p className="empty" style={{ padding: "0 20px" }}>
          {t.network.empty}
        </p>
      ) : (
        <>
          <p
            className="muted"
            style={{ marginTop: 0, fontSize: 13, padding: "0 20px" }}
          >
            {data.nodes.length} people · {data.links.length} connections
            {graph.truncated ? " (showing a capped subset)" : ""}
            {language ? ` · ${matchCount} use ${language}` : ""}
          </p>
          <div
            ref={ref}
            className="graph-canvas"
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            {size.width > 0 && size.height > 0 ? (
              <ForceGraph2D
                ref={fgRef}
                graphData={data}
                width={size.width}
                height={size.height}
                backgroundColor="#ffffff"
                cooldownTicks={120}
                onEngineStop={() => {
                  if (focusedRef.current) return;
                  const self = data.nodes.find((n) => n.role === "self");
                  if (!self || self.x == null || self.y == null) return;
                  focusedRef.current = true;
                  fgRef.current?.centerAt(self.x, self.y, 800);
                  fgRef.current?.zoom(2.5, 800);
                }}
                onNodeClick={(node: GraphNode) => setSelectedId(node.id)}
                autoPauseRedraw={!animateEdges}
                // Before each frame, record the visible graph-space rectangle
                // (plus a small margin) so node/link visibility can cull
                // anything off-screen. Only what's around the current view is
                // drawn, and it follows the camera as you pan/zoom.
                onRenderFramePre={() => {
                  const fg = fgRef.current;
                  if (!fg || !size.width || !size.height) return;
                  const tl = fg.screen2GraphCoords(0, 0);
                  const br = fg.screen2GraphCoords(size.width, size.height);
                  const mx = (br.x - tl.x) * 0.15;
                  const my = (br.y - tl.y) * 0.15;
                  viewRef.current = {
                    minX: tl.x - mx,
                    minY: tl.y - my,
                    maxX: br.x + mx,
                    maxY: br.y + my,
                  };
                }}
                nodeVisibility={(n: GraphNode) => inView(n)}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                linkVisibility={(l: any) => {
                  const s = l.source;
                  const t = l.target;
                  if (typeof s !== "object" || typeof t !== "object") return true;
                  return inView(s) || inView(t);
                }}
                linkColor={(l: GraphLink) =>
                  l.pending ? COLORS.self : "rgba(104,112,131,0.35)"
                }
                linkWidth={(l: GraphLink) => (l.pending ? 1.5 : 1)}
                // Solid edges render by default; pending edges are replaced
                // with a hand-drawn dashed line whose offset marches with time.
                linkCanvasObjectMode={(l: GraphLink) =>
                  l.pending ? "replace" : undefined
                }
                linkCanvasObject={(
                  // At render time source/target are the resolved node objects.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  link: any,
                  ctx: CanvasRenderingContext2D,
                ) => {
                  if (!link.pending) return;
                  const s = link.source;
                  const t = link.target;
                  if (!s || !t || typeof s !== "object" || typeof t !== "object")
                    return;
                  const sx = s.x ?? 0;
                  const sy = s.y ?? 0;
                  const tx = t.x ?? 0;
                  const ty = t.y ?? 0;
                  const len = Math.hypot(tx - sx, ty - sy) || 1;
                  const ux = (tx - sx) / len;
                  const uy = (ty - sy) / len;
                  // Stop short of the target node so the arrowhead sits beside it.
                  const targetR =
                    t.role === "self" ? 6 : t.role === "friend" ? 4.5 : 3;
                  const headLen = 2.8;
                  const tipX = tx - ux * (targetR + 1);
                  const tipY = ty - uy * (targetR + 1);
                  const baseX = tipX - ux * headLen;
                  const baseY = tipY - uy * headLen;
                  ctx.save();
                  ctx.strokeStyle = COLORS.self;
                  ctx.fillStyle = COLORS.self;
                  ctx.lineWidth = 1.5;
                  // Marching-ants shaft: a negative, time-driven dash offset
                  // flows the dashes from the requester toward the addressee.
                  // Frozen for reduced motion.
                  ctx.setLineDash([3, 3]);
                  ctx.lineDashOffset = reduce
                    ? 0
                    : -((performance.now() * 0.018) % 6);
                  ctx.beginPath();
                  ctx.moveTo(sx, sy);
                  ctx.lineTo(baseX, baseY);
                  ctx.stroke();
                  // Solid arrowhead at the target end makes the edge directed.
                  ctx.setLineDash([]);
                  const hw = 1.7;
                  ctx.beginPath();
                  ctx.moveTo(tipX, tipY);
                  ctx.lineTo(baseX - uy * hw, baseY + ux * hw);
                  ctx.lineTo(baseX + uy * hw, baseY - ux * hw);
                  ctx.closePath();
                  ctx.fill();
                  ctx.restore();
                }}
                nodeRelSize={4}
                nodeLabel={(n: GraphNode) => n.display_name}
                nodeCanvasObject={(
                  node: GraphNode,
                  ctx: CanvasRenderingContext2D,
                  scale: number,
                ) => {
                  const dim = !matches(node);
                  ctx.globalAlpha = dim ? 0.12 : 1;
                  const r = node.role === "self" ? 6 : node.role === "friend" ? 4.5 : 3;
                  const x = node.x ?? 0;
                  const y = node.y ?? 0;
                  const img = node.avatar_updated_at
                    ? imgCacheRef.current.get(node.id)
                    : undefined;
                  if (img && img.complete && img.naturalWidth > 0) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, 2 * Math.PI);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
                    ctx.restore();
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, 2 * Math.PI);
                    ctx.lineWidth = 0.6;
                    ctx.strokeStyle = COLORS[node.role];
                    ctx.stroke();
                  } else {
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, 2 * Math.PI);
                    ctx.fillStyle = COLORS[node.role];
                    ctx.fill();
                  }
                  if (node.role !== "other" && !dim) {
                    const fontSize = 12 / scale;
                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.fillStyle = "#1a1d24";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillText(node.display_name, x, y + r + 1);
                  }
                  ctx.globalAlpha = 1;
                }}
                nodePointerAreaPaint={(
                  node: GraphNode,
                  color: string,
                  ctx: CanvasRenderingContext2D,
                ) => {
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.arc(node.x ?? 0, node.y ?? 0, 6, 0, 2 * Math.PI);
                  ctx.fill();
                }}
              />
            ) : null}
          </div>
          <p
            className="muted"
            style={{ fontSize: 12, margin: 0, padding: "8px 20px" }}
          >
            Tap a node to view their profile · scroll to zoom · drag to pan.
          </p>
        </>
      )}
    </div>
    {selectedId ? (
      <ProfileModal
        userId={selectedId}
        onClose={() => setSelectedId(null)}
        onEditProfile={onEditProfile}
      />
    ) : null}
    </>
  );
}

function Legend({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span style={{ marginLeft: 14, whiteSpace: "nowrap" }}>
      <span
        style={{
          display: "inline-block",
          verticalAlign: "middle",
          marginRight: 5,
          ...(dashed
            ? {
                width: 14,
                height: 0,
                borderTop: `1.5px dashed ${color}`,
              }
            : {
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: color,
              }),
        }}
      />
      {label}
    </span>
  );
}
