"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { forceCollide } from "d3-force";
import { useAuth } from "@/lib/auth";
import { avatarUrl } from "@/lib/api";
import {
  useFriends,
  useIncomingRequests,
  useNetwork,
  useOutgoingRequests,
  useRecommendations,
} from "@/lib/hooks";
import { PROGRAMMING_LANGUAGES } from "@/lib/languages";
import { prefersReducedMotion, useReveal } from "@/lib/anim";
import { useI18n } from "@/lib/i18n";
import { BridgeDialog } from "./BridgeDialog";
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

// Warm-ink palette (see .design/visual-refresh): you are the indigo accent,
// friends are ink, everyone else a muted graphite.
const COLORS: Record<Role, string> = {
  self: "#2d4f7c", // 藍 / indigo accent
  friend: "#16181d", // ink
  other: "#9a958b", // warm graphite
};

// Ring colour for "recommended" people when the recommend highlight is on.
const REC_COLOR = "#b45309"; // amber / earth

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
  beaconIds,
  recentIds,
  staleIds,
  focusId,
  sparkId,
  sparkAt,
  onNodeSelect,
}: {
  onEditProfile?: () => void;
  // Deck integration (all optional — standalone use ignores them):
  beaconIds?: Set<string>; // nodes to glow (active beacons)
  recentIds?: Set<string>; // friends with a recent card exchange (brighter edge)
  staleIds?: Set<string>; // friends gone quiet (fainter edge)
  focusId?: string | null; // when set, centre/zoom on this node
  sparkId?: string | null; // friend a card was just sent to (light runs the edge)
  sparkAt?: number | null; // timestamp the card was sent (drives the animation)
  onNodeSelect?: (id: string) => void; // node click handler (deck drives selection)
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { graph, isLoading, error } = useNetwork();
  const { friends } = useFriends();
  const { requests: incoming } = useIncomingRequests();
  const { requests: outgoing } = useOutgoingRequests();
  const { recommendations } = useRecommendations();
  const { ref, size } = useSize();
  const panelRef = useReveal<HTMLDivElement>({ y: 8 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  // Bridge mode: tap two friends on the graph to introduce them. The two glow,
  // a light line joins them, and a bar offers to send the Bridge Card.
  const [bridgeMode, setBridgeMode] = useState(false);
  const [bridgeSel, setBridgeSel] = useState<string[]>([]);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  // When on, dim everyone except people we recommend you connect with (and you),
  // turning the graph into a "who should I talk to next?" map.
  const [showRec, setShowRec] = useState(false);
  const recommendedIds = useMemo(
    () => new Set(recommendations.map((r) => r.user.id)),
    [recommendations],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  // Center on the viewer's own node once the layout settles (re-arm per load).
  const focusedRef = useRef(false);
  useEffect(() => {
    focusedRef.current = false;
  }, [graph]);

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

  // A node is highlighted (not dimmed) when it passes every active filter: the
  // language filter (if set) AND the "recommended" filter (if on — you always
  // stay lit so the map keeps its anchor).
  const langMatch = (n: GraphNode) =>
    !language || n.languages.includes(language);
  const recMatch = (n: GraphNode) =>
    !showRec || n.role === "self" || recommendedIds.has(n.id);
  const matches = (n: GraphNode) => langMatch(n) && recMatch(n);
  const matchCount = language
    ? data.nodes.filter((n) => n.languages.includes(language)).length
    : data.nodes.length;

  // Edge tone from relationship recency (deck mode): brighter for friends you've
  // exchanged a card with recently, fainter for those gone quiet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edgeTone = (l: any): "recent" | "stale" | "normal" => {
    const sid = typeof l.source === "object" ? l.source.id : l.source;
    const tid = typeof l.target === "object" ? l.target.id : l.target;
    if (recentIds && (recentIds.has(sid) || recentIds.has(tid))) return "recent";
    if (staleIds && (staleIds.has(sid) || staleIds.has(tid))) return "stale";
    return "normal";
  };

  // Centre/zoom on a node when the deck selects it.
  useEffect(() => {
    if (!focusId) return;
    const n = data.nodes.find((nn) => nn.id === focusId);
    if (!n || n.x == null || n.y == null) return;
    fgRef.current?.centerAt(n.x, n.y, 600);
    fgRef.current?.zoom(3, 600);
  }, [focusId, data]);

  // Pending (request) edges are drawn as marching-ants dashes. When any exist
  // we keep the canvas repainting every frame (autoPauseRedraw off) so the
  // dashes flow; otherwise we let the graph idle. Held still for reduced motion.
  //
  // This runs on touch devices too. An earlier `&& !isMobile` guard froze the
  // dashes whenever a phone wasn't being actively dragged — which read as the
  // graph "dying" the instant it settled. We accept the extra repaint cost so
  // the network stays alive on mobile; reduced-motion users still get a still
  // frame, and with no pending edges there is nothing to animate either way.
  const reduce = prefersReducedMotion();
  const hasPending = data.links.some((l) => l.pending);
  // Keep the canvas live (per-frame repaint) when something is meant to move:
  // marching-ants request edges, a beacon ring that slowly pulses, or a card-sent
  // light travelling an edge. Reduced motion holds a still frame.
  const hasBeacons = (beaconIds?.size ?? 0) > 0;
  const SPARK_MS = 1300;
  const sparkActive = !!sparkAt && !reduce;
  const bridgeLine = bridgeMode && bridgeSel.length === 2;
  const animateEdges =
    (hasPending || hasBeacons || sparkActive || bridgeLine) && !reduce;

  // Languages the two bridge-selected friends share, shown in the bridge bar.
  const bridgeCommon = useMemo(() => {
    if (bridgeSel.length < 2) return [] as string[];
    const la = data.nodes.find((n) => n.id === bridgeSel[0])?.languages ?? [];
    const lb = new Set(
      data.nodes.find((n) => n.id === bridgeSel[1])?.languages ?? [],
    );
    return la.filter((l) => lb.has(l));
  }, [bridgeSel, data]);

  // The edge a just-sent card should light up: the one joining you and sparkId.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isSparkEdge = (l: any): boolean => {
    if (!sparkId || !user?.id || l.pending) return false;
    const sid = typeof l.source === "object" ? l.source.id : l.source;
    const tid = typeof l.target === "object" ? l.target.id : l.target;
    return (
      (sid === user.id && tid === sparkId) ||
      (sid === sparkId && tid === user.id)
    );
  };

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

  // Spread connected nodes apart: ~3x d3-force's default link rest length
  // (30 → 90) so edges read as longer, less cramped lines. Re-applied on every
  // data change because react-force-graph reinstalls its default forces when
  // graphData updates; reheat so the layout re-settles at the new distance.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Floor on spacing: a collide radius of 15 keeps node centres ≥ ~30px apart
    // so densely-connected nodes never overlap.
    fg.d3Force?.("collide", forceCollide(15));
    // Minimal repulsion: d3's default charge (-30) flung nodes too far apart, so
    // the spacing comes from the link distance below; charge only nudges a bit.
    fg.d3Force?.("charge")?.strength(-8);

    const link = fg.d3Force?.("link");
    if (!link) {
      fg.d3ReheatSimulation?.();
      return;
    }

    // "Breathing" expansion: the layout starts compact and the link rest length
    // grows over a few seconds up to a ceiling, so the network visibly spreads
    // out after it loads and then holds at MAX. Reduced-motion users skip the
    // animation and land on MAX immediately.
    const MIN = 90;
    const MAX = 240;
    if (reduce) {
      link.distance(MAX);
      fg.d3ReheatSimulation?.();
      return;
    }

    const STEP = 6;
    const EVERY_MS = 450;
    let dist = MIN;
    link.distance(dist);
    fg.d3ReheatSimulation?.();
    const id = window.setInterval(() => {
      dist = Math.min(MAX, dist + STEP);
      link.distance(dist);
      fg.d3ReheatSimulation?.();
      if (dist >= MAX) window.clearInterval(id);
    }, EVERY_MS);
    return () => window.clearInterval(id);
  }, [data, reduce]);

  return (
    <>
    <div ref={panelRef} className="flex-1 min-h-0 flex flex-col">
      {/* Stacks on phones (title, then controls + legend) so the heading isn't
          squeezed to ~40% width and broken mid-word; reverts to the title-left
          / controls-right row at md and up. */}
      <div className="flex flex-col gap-1.5 md:flex-row md:justify-between md:items-center mb-1.5 md:mb-3 px-5 pt-2 md:pt-4 pb-0">
        <h2 className="section-title m-0 max-[768px]:hidden">
          {t.network.title}
        </h2>
        <div className="flex flex-col items-start gap-1.5 md:flex-row md:items-center md:flex-wrap md:gap-x-[14px] md:gap-y-1">
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
          {recommendedIds.size > 0 ? (
            <label className="muted text-[11px] md:text-[13px] flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                className="w-auto"
                checked={showRec}
                onChange={(e) => setShowRec(e.target.checked)}
              />
              {t.network.highlightRecommended}
            </label>
          ) : null}
          {friends.length >= 2 ? (
            <button
              type="button"
              className="text-[11px] md:text-[13px] px-2.5 py-1"
              aria-pressed={bridgeMode}
              style={
                bridgeMode
                  ? { borderColor: "#1f9d6b", color: "#147a52" }
                  : undefined
              }
              onClick={() => {
                setBridgeMode((m) => !m);
                setBridgeSel([]);
              }}
            >
              {t.network.bridgeMode}
            </button>
          ) : null}
          <div className="muted text-[11px] md:text-[13px] flex flex-wrap items-center gap-x-3 md:gap-x-[14px] gap-y-0.5">
            <Legend color={COLORS.self} label={t.network.legendYou} />
            <Legend color={COLORS.friend} label={t.network.legendFriends} />
            <Legend color={COLORS.other} label={t.network.legendEveryone} />
            <Legend color={COLORS.self} label={t.network.legendPending} dashed />
            {showRec ? (
              <Legend color={REC_COLOR} label={t.network.legendRecommended} />
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <p className="error px-5">
          {t.network.couldNotLoad}
        </p>
      ) : isLoading || !graph ? (
        <p className="empty px-5">
          {t.network.loading}
        </p>
      ) : data.nodes.length === 0 ? (
        <p className="empty px-5">
          {t.network.empty}
        </p>
      ) : (
        <>
          <p className="muted mt-0 mb-0 text-[11px] md:text-[13px] px-5 leading-tight max-[768px]:hidden">
            {data.nodes.length} people · {data.links.length} connections
            {graph.truncated ? " (showing a capped subset)" : ""}
            {language ? ` · ${matchCount} use ${language}` : ""}
          </p>
          <div
            ref={ref}
            className="graph-canvas relative flex-1 min-h-0 overflow-hidden bg-bg"
          >
            {size.width > 0 && size.height > 0 ? (
              <ForceGraph2D
                ref={fgRef}
                graphData={data}
                width={size.width}
                height={size.height}
                // Match the warm-paper page background (--color-bg) so the
                // graph blends in with no visible white panel edge.
                backgroundColor="#faf8f4"
                cooldownTicks={120}
                onEngineStop={() => {
                  if (focusedRef.current) return;
                  const self = data.nodes.find((n) => n.role === "self");
                  if (!self || self.x == null || self.y == null) return;
                  focusedRef.current = true;
                  fgRef.current?.centerAt(self.x, self.y, 800);
                  fgRef.current?.zoom(2.5, 800);
                }}
                onNodeClick={(node: GraphNode) => {
                  if (bridgeMode) {
                    // Only your own friends can be introduced to each other.
                    if (node.role !== "friend") return;
                    setBridgeSel((prev) =>
                      prev.includes(node.id)
                        ? prev.filter((x) => x !== node.id)
                        : prev.length < 2
                          ? [...prev, node.id]
                          : [prev[1], node.id],
                    );
                    return;
                  }
                  if (onNodeSelect) onNodeSelect(node.id);
                  else setSelectedId(node.id);
                }}
                autoPauseRedraw={!animateEdges}
                // Before each frame, record the visible graph-space rectangle
                // (plus a small margin) so node/link visibility can cull
                // anything off-screen. Only what's around the current view is
                // drawn, and it follows the camera as you pan/zoom.
                onRenderFramePre={(ctx: CanvasRenderingContext2D) => {
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
                  // The bridge "connection in progress": a glowing dashed line
                  // joining the two friends you're about to introduce.
                  if (bridgeSel.length === 2) {
                    const n1 = data.nodes.find((n) => n.id === bridgeSel[0]);
                    const n2 = data.nodes.find((n) => n.id === bridgeSel[1]);
                    if (n1 && n2 && n1.x != null && n2.x != null) {
                      ctx.save();
                      ctx.beginPath();
                      ctx.moveTo(n1.x, n1.y ?? 0);
                      ctx.lineTo(n2.x, n2.y ?? 0);
                      ctx.strokeStyle = "rgba(31,157,107,0.85)";
                      ctx.lineWidth = 1.6;
                      ctx.shadowColor = "rgba(31,157,107,0.85)";
                      ctx.shadowBlur = 8;
                      ctx.setLineDash([4, 3]);
                      ctx.lineDashOffset = reduce
                        ? 0
                        : -((performance.now() * 0.02) % 7);
                      ctx.stroke();
                      ctx.restore();
                    }
                  }
                }}
                nodeVisibility={(n: GraphNode) => inView(n)}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                linkVisibility={(l: any) => {
                  const s = l.source;
                  const t = l.target;
                  if (typeof s !== "object" || typeof t !== "object") return true;
                  return inView(s) || inView(t);
                }}
                linkColor={(l: GraphLink) => {
                  if (l.pending) return COLORS.self;
                  const tone = edgeTone(l);
                  return tone === "recent"
                    ? "rgba(45,79,124,0.55)"
                    : tone === "stale"
                      ? "rgba(104,112,131,0.14)"
                      : "rgba(104,112,131,0.35)";
                }}
                linkWidth={(l: GraphLink) =>
                  l.pending ? 1.5 : edgeTone(l) === "recent" ? 1.8 : 1
                }
                // Solid edges render by default; pending edges are replaced
                // with a hand-drawn dashed line whose offset marches with time;
                // the card-sent edge draws a travelling light on top ("after").
                linkCanvasObjectMode={(l: GraphLink) =>
                  l.pending ? "replace" : isSparkEdge(l) ? "after" : undefined
                }
                linkCanvasObject={(
                  // At render time source/target are the resolved node objects.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  link: any,
                  ctx: CanvasRenderingContext2D,
                ) => {
                  // A bright dot glides from you to the friend you just sent a
                  // card to, then fades — the relationship visibly "lights up".
                  if (!link.pending && isSparkEdge(link) && sparkAt) {
                    const elapsed = Date.now() - sparkAt;
                    if (elapsed < 0 || elapsed > SPARK_MS) return;
                    const s = link.source;
                    const t = link.target;
                    if (!s || !t || s.x == null || t.x == null) return;
                    const fromSelf =
                      (typeof s === "object" ? s.id : s) === user?.id;
                    const a = fromSelf ? s : t;
                    const b = fromSelf ? t : s;
                    const p = elapsed / SPARK_MS;
                    const x = a.x + (b.x - a.x) * p;
                    const y = a.y + (b.y - a.y) * p;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, 2.6, 0, 2 * Math.PI);
                    ctx.fillStyle = `rgba(45,79,124,${1 - p})`;
                    ctx.shadowColor = "rgba(45,79,124,0.95)";
                    ctx.shadowBlur = 9;
                    ctx.fill();
                    ctx.restore();
                    return;
                  }
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
                  // Soft glowing ring around people with an active beacon — it
                  // breathes (radius + opacity + blur swell) so a beacon reads as
                  // a live "ok to talk now" signal. Held still for reduced motion.
                  if (beaconIds?.has(node.id) && !dim) {
                    const p = reduce
                      ? 0.5
                      : 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, r + 2.5 + p * 1.6, 0, 2 * Math.PI);
                    ctx.strokeStyle = `rgba(180,83,9,${0.5 + 0.45 * p})`;
                    ctx.lineWidth = 1.3;
                    ctx.shadowColor = "rgba(180,83,9,0.85)";
                    ctx.shadowBlur = 4 + p * 6;
                    ctx.stroke();
                    ctx.restore();
                  }
                  // Strong indigo halo on the node the deck is focused on, so the
                  // person you've swiped to clearly "lights up" in the network.
                  if (focusId === node.id && !dim) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
                    ctx.strokeStyle = "rgba(45,79,124,0.9)";
                    ctx.lineWidth = 1.6;
                    ctx.shadowColor = "rgba(45,79,124,0.9)";
                    ctx.shadowBlur = 10;
                    ctx.stroke();
                    ctx.restore();
                  }
                  // Emerald ring on the friends picked for a bridge introduction.
                  if (bridgeMode && bridgeSel.includes(node.id) && !dim) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
                    ctx.strokeStyle = "#1f9d6b";
                    ctx.lineWidth = 1.8;
                    ctx.shadowColor = "rgba(31,157,107,0.8)";
                    ctx.shadowBlur = 6;
                    ctx.stroke();
                    ctx.restore();
                  }
                  // Amber ring around recommended people when the highlight is on.
                  if (showRec && !dim && recommendedIds.has(node.id)) {
                    ctx.beginPath();
                    ctx.arc(x, y, r + 1.6, 0, 2 * Math.PI);
                    ctx.lineWidth = 1.1;
                    ctx.strokeStyle = REC_COLOR;
                    ctx.stroke();
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
            {bridgeMode ? (
              <div className="bridge-bar">
                {bridgeSel.length < 2 ? (
                  <span className="muted text-[13px]">
                    {t.network.bridgeHint}
                  </span>
                ) : (
                  <>
                    {bridgeCommon.length > 0 ? (
                      <span className="text-[13px]">
                        {t.bridgeCard.common(bridgeCommon.join(", "))}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="primary w-auto"
                      onClick={() => setBridgeOpen(true)}
                    >
                      {t.network.bridgeOpen}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setBridgeSel([]);
                    setBridgeMode(false);
                  }}
                >
                  {t.network.clearSelection}
                </button>
              </div>
            ) : null}
          </div>
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
    {bridgeOpen ? (
      <BridgeDialog
        initialA={bridgeSel[0]}
        initialB={bridgeSel[1]}
        onClose={() => {
          setBridgeOpen(false);
          setBridgeSel([]);
          setBridgeMode(false);
        }}
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
    <span className="whitespace-nowrap">
      <span
        className="inline-block align-middle mr-[5px]"
        style={
          dashed
            ? { width: 14, height: 0, borderTop: `1.5px dashed ${color}` }
            : { width: 9, height: 9, borderRadius: "50%", background: color }
        }
      />
      {label}
    </span>
  );
}
