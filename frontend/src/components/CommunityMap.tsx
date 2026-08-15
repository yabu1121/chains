"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { useAuth } from "@/lib/auth";
import { communityNetworkKey, getCommunityNetwork } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { CommunityNetwork } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

interface MapNode {
  id: string;
  display_name: string;
  self: boolean;
  x?: number;
  y?: number;
}

const SELF_COLOR = "#2d4f7c";
const MEMBER_COLOR = "#16181d";

/** Tracks a container's width so the canvas can fill it. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * CommunityMap renders the relationship sub-graph among a community's members —
 * the "関係マップ" that makes a roster more than a list. Tapping a node opens
 * that person's profile.
 */
export function CommunityMap({
  communityId,
  onSelect,
}: {
  communityId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { ref, width } = useWidth();
  const { data, isLoading } = useSWR<CommunityNetwork>(
    communityNetworkKey(communityId),
    () => getCommunityNetwork(communityId),
  );

  const graph = useMemo(() => {
    if (!data) return { nodes: [] as MapNode[], links: [] };
    const nodes: MapNode[] = data.nodes.map((n) => ({
      id: n.id,
      display_name: n.display_name,
      self: n.id === user?.id,
    }));
    return { nodes, links: data.links.map((l) => ({ ...l })) };
  }, [data, user?.id]);

  const height = 300;

  return (
    <div className="pv-section">
      <div className="section-title">{t.community.relationshipMap}</div>
      {isLoading || !data ? (
        <p className="empty">{t.common.loading}</p>
      ) : graph.nodes.length === 0 ? (
        <p className="empty">{t.community.noMembers}</p>
      ) : (
        <>
          <p className="muted text-[12px] mt-0 mb-1">
            {graph.links.length === 0
              ? t.community.noConnections
              : t.community.connections(graph.links.length)}
          </p>
          <div
            ref={ref}
            className="rounded-[10px] border border-border overflow-hidden bg-bg"
            style={{ height }}
          >
            {width > 0 ? (
              <ForceGraph2D
                graphData={graph}
                width={width}
                height={height}
                backgroundColor="#faf8f4"
                cooldownTicks={100}
                nodeRelSize={4}
                linkColor={() => "rgba(104,112,131,0.35)"}
                nodeLabel={(n: MapNode) => n.display_name}
                onNodeClick={(n: MapNode) => onSelect(n.id)}
                nodeCanvasObject={(
                  node: MapNode,
                  ctx: CanvasRenderingContext2D,
                  scale: number,
                ) => {
                  const r = node.self ? 5.5 : 4;
                  const x = node.x ?? 0;
                  const y = node.y ?? 0;
                  ctx.beginPath();
                  ctx.arc(x, y, r, 0, 2 * Math.PI);
                  ctx.fillStyle = node.self ? SELF_COLOR : MEMBER_COLOR;
                  ctx.fill();
                  const fontSize = 11 / scale;
                  ctx.font = `${fontSize}px sans-serif`;
                  ctx.fillStyle = "#1a1d24";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "top";
                  ctx.fillText(node.display_name, x, y + r + 1);
                }}
                nodePointerAreaPaint={(
                  node: MapNode,
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
        </>
      )}
    </div>
  );
}
