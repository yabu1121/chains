"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useFriends, useNetwork } from "@/lib/hooks";
import { ProfileModal } from "./ProfileModal";

// react-force-graph-2d reaches for `window`, so it must load client-only.
// Its prop generics don't survive next/dynamic cleanly, hence the cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

type Role = "self" | "friend" | "other";

interface GraphNode {
  id: string;
  display_name: string;
  role: Role;
  // populated by the force simulation at runtime
  x?: number;
  y?: number;
}

const COLORS: Record<Role, string> = {
  self: "#5b8cff",
  friend: "#3ecf8e",
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

export function NetworkGraph() {
  const { user } = useAuth();
  const { graph, isLoading, error } = useNetwork();
  const { friends } = useFriends();
  const { ref, size } = useSize();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const friendIds = useMemo(
    () => new Set(friends.map((f) => f.user.id)),
    [friends],
  );

  // Build a fresh, mutable graph for the simulation, tagging each node's role.
  const data = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], links: [] };
    const nodes: GraphNode[] = graph.nodes.map((n) => ({
      id: n.id,
      display_name: n.display_name,
      role:
        n.id === user?.id
          ? "self"
          : friendIds.has(n.id)
            ? "friend"
            : "other",
    }));
    const links = graph.links.map((l) => ({ source: l.source, target: l.target }));
    return { nodes, links };
  }, [graph, user?.id, friendIds]);

  return (
    <>
    <div
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
          Global network
        </h2>
        <div className="muted" style={{ fontSize: 13 }}>
          <Legend color={COLORS.self} label="You" />
          <Legend color={COLORS.friend} label="Friends" />
          <Legend color={COLORS.other} label="Everyone" />
        </div>
      </div>

      {error ? (
        <p className="error" style={{ padding: "0 20px" }}>
          Could not load the network.
        </p>
      ) : isLoading || !graph ? (
        <p className="empty" style={{ padding: "0 20px" }}>
          Loading the network…
        </p>
      ) : data.nodes.length === 0 ? (
        <p className="empty" style={{ padding: "0 20px" }}>
          No one is here yet.
        </p>
      ) : (
        <>
          <p
            className="muted"
            style={{ marginTop: 0, fontSize: 13, padding: "0 20px" }}
          >
            {data.nodes.length} people · {data.links.length} connections
            {graph.truncated ? " (showing a capped subset)" : ""}
          </p>
          <div
            ref={ref}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            {size.width > 0 && size.height > 0 ? (
              <ForceGraph2D
                graphData={data}
                width={size.width}
                height={size.height}
                backgroundColor="#ffffff"
                cooldownTicks={120}
                onNodeClick={(node: GraphNode) => setSelectedId(node.id)}
                linkColor={() => "rgba(104,112,131,0.35)"}
                linkWidth={1}
                nodeRelSize={4}
                nodeLabel={(n: GraphNode) => n.display_name}
                nodeCanvasObject={(
                  node: GraphNode,
                  ctx: CanvasRenderingContext2D,
                  scale: number,
                ) => {
                  const r = node.role === "self" ? 6 : node.role === "friend" ? 4.5 : 3;
                  const x = node.x ?? 0;
                  const y = node.y ?? 0;
                  ctx.beginPath();
                  ctx.arc(x, y, r, 0, 2 * Math.PI);
                  ctx.fillStyle = COLORS[node.role];
                  ctx.fill();
                  if (node.role !== "other") {
                    const fontSize = 12 / scale;
                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.fillStyle = "#1a1d24";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillText(node.display_name, x, y + r + 1);
                  }
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
      <ProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />
    ) : null}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ marginLeft: 14, whiteSpace: "nowrap" }}>
      <span
        style={{
          display: "inline-block",
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          marginRight: 5,
        }}
      />
      {label}
    </span>
  );
}
