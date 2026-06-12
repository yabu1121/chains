"use client";

/**
 * ネットワーク（関係が地図になる） — design-direction §5-4 / copy.md §5。
 *
 * 要旨は隣接テキスト（見出し・説明・キャプション）が担い、SVG 図は装飾として
 * aria-hidden。図は「スクロール連動のドローオン」で @you から放射状に関係が
 * 引かれていく物語を見せ、引き切った後は“生きている”状態で常時ゆらぐ。
 *
 * モーション設計（interaction-designer）:
 *   - 描画は単一の requestAnimationFrame ループで命令的に更新する。エッジ端点・
 *     ノード座標・ラベル位置はノードの「現在位置」（ベース + 漂い + ポインタ反発
 *     ± ドラッグ）に毎フレーム追従させる。framer-motion とは属性を奪い合わない。
 *   - draw-on: useScroll（figure ref, offset ["start 0.85","center 0.5"]）の進捗
 *     0→1 を rAF 内で .get() し、各エッジの「自分の窓」で strokeDashoffset を
 *     全長→0 に引く。窓は @you 接続を先に、周辺リンクを後に並べ放射を時間軸で表す。
 *   - 常時の有機的ゆらぎ: 各ノードを軸ごとに位相・速度・振幅をずらした sin 合成で
 *     ベース位置の周りに ±3〜6px（viewBox 単位）漂わせる。位置は決定的シードで生成。
 *   - ポインタ反応: ポインタ近傍のノードがゆるく反発。減衰補間（lerp）でばね的に。
 *   - ドラッグ: ノード（@you 含む）を pointer/touch で掴んで動かせる。離すと
 *     ベースへばねで戻り、漂いに復帰する。掴んでいる間はそのエッジが追従。
 *   - 触れるアフォーダンス: ノード上で cursor grab / 掴み中 grabbing。
 *   - 対象プロパティは strokeDashoffset / 座標属性（transform 相当の位置）/ opacity
 *     のみ。layout は揺らさない。rAF 内でオブジェクトは生成せず再利用バッファを使う。
 *   - オフスクリーンでは IntersectionObserver で rAF を停止。
 *   - Hero のような d3-force / WebGL ライブ計算は持ち込まない。
 *
 * prefers-reduced-motion 時はスクロール連動・漂い・ポインタ反応・ドラッグ追従を
 * すべて止め、最初から完成図（ベース配置・nodes 可視）を静的表示する。
 * （useReducedMotionSafe で SSR ハイドレーション安全に判定。globals.css の
 *  #network 規則も完成状態を保険として強制する。）
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useScroll, useSpring } from "framer-motion";
import { useReveal } from "../book/use-press-entrance";
import { SplitText } from "../motion/split-text";
import { useReducedMotionSafe } from "../motion/use-reduced-motion-safe";
import { withMark } from "../motion/mark";
import { FlowLine } from "../motion/flow-line";
import copy from "@/content/copy.json";

// viewBox 360 x 300。中心に自分（accent）、周囲にフレンド（ink）。
// 静的レイアウト — 計算ではなく手置きでバランスを取る。
type Node = { id: string; x: number; y: number; handle: string; self?: boolean };

const NODES: ReadonlyArray<Node> = [
  { id: "me", x: 180, y: 150, handle: "@you", self: true },
  { id: "a", x: 70, y: 70, handle: "@rin" },
  { id: "b", x: 292, y: 92, handle: "@kab" },
  { id: "c", x: 312, y: 214, handle: "@sol" },
  { id: "d", x: 150, y: 256, handle: "@miu" },
  { id: "e", x: 48, y: 196, handle: "@ito" },
  { id: "f", x: 232, y: 44, handle: "@nao" },
];

// エッジ = フレンド関係。承認済みの線だけを引く。
// 配列順 = ドローオン順。@you 接続を先頭、周辺リンクを末尾に置く。
const EDGES: ReadonlyArray<readonly [string, string]> = [
  ["me", "a"],
  ["me", "b"],
  ["me", "c"],
  ["me", "d"],
  ["me", "e"],
  ["a", "f"],
  ["b", "f"],
  ["c", "d"],
];

const NODE_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  NODES.map((n, i) => [n.id, i]),
);

// 各エッジが「引かれる」進捗の窓 [start, end]。
// 8 本を 0→1 の中に少しずつ重ねて並べ、中心→外の連鎖に見せる。
const EDGE_WINDOW = 0.62 / EDGES.length; // 1 本あたりの描画所要（進捗換算）
const edgeWindow = (i: number): readonly [number, number] => {
  const start = (i / EDGES.length) * 0.74;
  return [start, start + EDGE_WINDOW];
};

// ノードは「自分に届く最後のエッジ」の完了点で着地する。
const nodeArrival = (nodeId: string): number => {
  if (nodeId === "me") return 0.02; // 中心は最初に置く
  let last = 0;
  EDGES.forEach((edge, i) => {
    if (edge.includes(nodeId)) last = Math.max(last, edgeWindow(i)[1]);
  });
  return last;
};

// 進捗 p のときエッジ i の strokeDashoffset を [全長 → 0] にクランプ補間。
const edgeDashoffset = (i: number, len: number, p: number): number => {
  const [start, end] = edgeWindow(i);
  if (p <= start) return len;
  if (p >= end) return 0;
  return len * (1 - (p - start) / (end - start));
};

// ノード i の着地 opacity / scale を進捗 p から（窓幅 0.05）。
const nodeAppear = (arrival: number, p: number): { opacity: number; scale: number } => {
  const lo = Math.max(0, arrival - 0.05);
  if (p <= lo) return { opacity: 0, scale: 0.55 };
  if (p >= arrival) return { opacity: 1, scale: 1 };
  const t = (p - lo) / (arrival - lo);
  return { opacity: t, scale: 0.55 + t * 0.45 };
};

// 決定的擬似乱数（SSR / 再マウントで同じ漂いにする）。
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// 漂いパラメータ（軸ごとに位相・速度・振幅）。振幅は ±3〜6px（viewBox 単位）。
type Drift = {
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
  ampX: number;
  ampY: number;
};

function buildDrift(): Drift[] {
  const rng = makeRng(0x9e3779b1);
  return NODES.map(() => ({
    phaseX: rng() * Math.PI * 2,
    phaseY: rng() * Math.PI * 2,
    speedX: 0.45 + rng() * 0.4,
    speedY: 0.4 + rng() * 0.4,
    ampX: 3 + rng() * 3,
    ampY: 3 + rng() * 3,
  }));
}

// ノードの可視半径（ヒット判定・反発半径の基準）。
const nodeRadius = (n: Node) => (n.self ? 9 : 6);

// rAF 間で持ち越す可変状態。
type Live = {
  // 現在の表示座標（ベース + 漂い + 反発/ドラッグの合成結果）
  x: number[];
  y: number[];
  // ポインタ反発の現在オフセット（lerp で追従）
  pushX: number[];
  pushY: number[];
  // ドラッグ中ノードの index（-1 = なし）と目標座標
  dragIndex: number;
  dragTargetX: number;
  dragTargetY: number;
  // ドラッグ解放後にベースへ戻すための現在オフセット（lerp で 0 へ）
  releaseX: number[];
  releaseY: number[];
  // ポインタの SVG 座標（反発計算用。null = 圏外）
  pointer: { x: number; y: number } | null;
};

function createLive(): Live {
  return {
    x: NODES.map((n) => n.x),
    y: NODES.map((n) => n.y),
    pushX: NODES.map(() => 0),
    pushY: NODES.map(() => 0),
    dragIndex: -1,
    dragTargetX: 0,
    dragTargetY: 0,
    releaseX: NODES.map(() => 0),
    releaseY: NODES.map(() => 0),
    pointer: null,
  };
}

export default function Network() {
  const sectionRef = useReveal<HTMLElement>();
  const reduce = useReducedMotionSafe();
  const figureRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // セクション通過の進捗 0→1。図がビューに入ってから中央付近で描き切る。
  const { scrollYProgress } = useScroll({
    target: figureRef,
    offset: ["start 0.85", "center 0.5"],
  });
  // スクロール進捗をばねで緩衝してから draw-on に渡す。これでエッジの描かれ方・
  // ノードの着地がスクロールのカクつきに直結せず、遅れて滑らかに追従する。
  const drawProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    mass: 0.35,
    restDelta: 0.0005,
  });

  // 各要素の ref（命令的更新の対象）。circle/text は group に同梱して動かすため、
  // 位置更新の対象は group（transform）とエッジ line のみ。
  const groupRefs = useRef<Array<SVGGElement | null>>([]);
  const lineRefs = useRef<Array<SVGLineElement | null>>([]);

  const drift = useMemo(() => buildDrift(), []);

  // エッジ全長（直線なので静的に算出。SSR と一致）。
  const edgeLengths = useMemo(
    () =>
      EDGES.map(([from, to]) => {
        const a = NODES[NODE_INDEX[from]];
        const b = NODES[NODE_INDEX[to]];
        return Math.hypot(b.x - a.x, b.y - a.y);
      }),
    [],
  );

  const nodeArrivals = useMemo(() => NODES.map((n) => nodeArrival(n.id)), []);

  // ライブ状態（rAF 間で持ち越す可変バッファ）。ref に置いて命令的に書き換える。
  // useMemo の戻り値を変更すると react-hooks/immutability に触れるため ref を使い、
  // ref へのアクセスはレンダー外（effect / イベントハンドラ）に閉じる。
  const liveRef = useRef<Live | null>(null);
  const getLive = useCallback((): Live => {
    if (liveRef.current === null) liveRef.current = createLive();
    return liveRef.current;
  }, []);

  // クライアント座標 → viewBox 座標（reflow を避けるため CTM は使わず矩形比で換算）。
  const toViewBox = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      // viewBox は "0 0 360 300" 固定。preserveAspectRatio 既定（xMidYMid meet）だが
      // class h-auto w-full でアスペクト比が保たれるため単純な線形換算で足りる。
      return {
        x: ((clientX - rect.left) / rect.width) * 360,
        y: ((clientY - rect.top) / rect.height) * 300,
      };
    },
    [],
  );

  // ---- reduced-motion: 完成図を静的に書き込み、rAF は回さない -------------
  useEffect(() => {
    if (!reduce) return;
    NODES.forEach((_, i) => {
      const g = groupRefs.current[i];
      if (g) {
        g.style.opacity = "1";
        g.style.transform = "none";
      }
    });
    EDGES.forEach(([from, to], i) => {
      const a = NODES[NODE_INDEX[from]];
      const b = NODES[NODE_INDEX[to]];
      const ln = lineRefs.current[i];
      if (ln) {
        ln.setAttribute("x1", String(a.x));
        ln.setAttribute("y1", String(a.y));
        ln.setAttribute("x2", String(b.x));
        ln.setAttribute("y2", String(b.y));
        ln.style.strokeDashoffset = "0";
      }
    });
  }, [reduce]);

  // ---- 常時 rAF（漂い + draw-on + 反発 + ドラッグ） -----------------------
  useEffect(() => {
    if (reduce) return;

    const live = getLive();
    let raf = 0;
    let running = false;
    let startTime = 0;
    let lastDraw = 0;
    const FRAME_MS = 1000 / 30; // 軽量化: 30fps 上限（rAF は回すが更新を間引く）

    const REPULSE_RADIUS = 56; // この距離内のノードを反発（viewBox 単位）
    const REPULSE_STRENGTH = 26; // 最大押し出し量
    const PUSH_LERP = 0.12; // 反発の追従（ばね的減衰）
    const RELEASE_LERP = 0.1; // ドラッグ解放後ベースへ戻る速さ

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - lastDraw < FRAME_MS) return; // フレーム間引き
      lastDraw = now;
      if (startTime === 0) startTime = now;
      const t = (now - startTime) / 1000; // 秒
      const p = drawProgress.get();
      const pointer = live.pointer;

      for (let i = 0; i < NODES.length; i++) {
        const n = NODES[i];
        const d = drift[i];

        // ベース漂い（draw-on 着地が進むほど漂いを効かせ、未着地は静か）。
        const appear = nodeAppear(nodeArrivals[i], p).opacity;
        const driftX = Math.sin(t * d.speedX + d.phaseX) * d.ampX * appear;
        const driftY = Math.sin(t * d.speedY + d.phaseY) * d.ampY * appear;

        if (i === live.dragIndex) {
          // 掴んでいる間は pointer 目標へ素早く（でもばね的に）追従。
          live.x[i] += (live.dragTargetX - live.x[i]) * 0.35;
          live.y[i] += (live.dragTargetY - live.y[i]) * 0.35;
          // 解放時にベースから現在地までのオフセットを引き継ぐ。
          live.releaseX[i] = live.x[i] - (n.x + driftX);
          live.releaseY[i] = live.y[i] - (n.y + driftY);
          // 反発は掴み中は無効化（自然に減衰）。
          live.pushX[i] += (0 - live.pushX[i]) * PUSH_LERP;
          live.pushY[i] += (0 - live.pushY[i]) * PUSH_LERP;
        } else {
          // ポインタ反発の目標オフセットを算出。
          let targetPushX = 0;
          let targetPushY = 0;
          if (pointer && appear > 0.5) {
            const dx = n.x + driftX - pointer.x;
            const dy = n.y + driftY - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < REPULSE_RADIUS && dist > 0.001) {
              const falloff = 1 - dist / REPULSE_RADIUS; // 近いほど強い
              const f = (REPULSE_STRENGTH * falloff * falloff) / dist;
              targetPushX = dx * f;
              targetPushY = dy * f;
            }
          }
          live.pushX[i] += (targetPushX - live.pushX[i]) * PUSH_LERP;
          live.pushY[i] += (targetPushY - live.pushY[i]) * PUSH_LERP;
          // 解放後オフセットを 0 へ（ばねで base 復帰）。
          live.releaseX[i] += (0 - live.releaseX[i]) * RELEASE_LERP;
          live.releaseY[i] += (0 - live.releaseY[i]) * RELEASE_LERP;
          live.x[i] = n.x + driftX + live.pushX[i] + live.releaseX[i];
          live.y[i] = n.y + driftY + live.pushY[i] + live.releaseY[i];
        }

        // ノード group の更新: 位置オフセットは translate、着地は opacity / scale。
        // circle / text はベース座標のまま据え置き、group の transform で一体に動かす
        // （ラベルとノードが乖離しない）。エッジ用に live.x/y は絶対中心を保持。
        const g = groupRefs.current[i];
        if (g) {
          const { opacity, scale } = nodeAppear(nodeArrivals[i], p);
          const ox = live.x[i] - n.x;
          const oy = live.y[i] - n.y;
          g.style.opacity = String(opacity);
          g.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
        }
      }

      // エッジ: 端点を現在ノード位置へ、strokeDashoffset を draw-on 進捗で。
      for (let i = 0; i < EDGES.length; i++) {
        const ln = lineRefs.current[i];
        if (!ln) continue;
        const ai = NODE_INDEX[EDGES[i][0]];
        const bi = NODE_INDEX[EDGES[i][1]];
        ln.setAttribute("x1", String(live.x[ai]));
        ln.setAttribute("y1", String(live.y[ai]));
        ln.setAttribute("x2", String(live.x[bi]));
        ln.setAttribute("y2", String(live.y[bi]));
        ln.style.strokeDashoffset = String(edgeDashoffset(i, edgeLengths[i], p));
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      startTime = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };

    // オフスクリーンで停止（network-3d.tsx と同様の作法）。
    const figure = figureRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    if (figure) io.observe(figure);
    else start();

    return () => {
      io.disconnect();
      stop();
    };
  }, [reduce, drift, edgeLengths, nodeArrivals, getLive, drawProgress]);

  // ---- ポインタ反発: SVG 上の移動を viewBox 座標で記録 --------------------
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (reduce) return;
      const live = getLive();
      const pt = toViewBox(e.clientX, e.clientY);
      if (live.dragIndex >= 0) {
        if (pt) {
          live.dragTargetX = pt.x;
          live.dragTargetY = pt.y;
        }
        return;
      }
      live.pointer = pt;
    },
    [reduce, toViewBox, getLive],
  );

  const handlePointerLeave = useCallback(() => {
    getLive().pointer = null;
  }, [getLive]);

  // ---- ドラッグ: ノードを掴んで動かし、離すとベースへばね復帰 -------------
  const handleNodePointerDown = useCallback(
    (i: number) => (e: React.PointerEvent<SVGGElement>) => {
      if (reduce) return;
      // draw-on 未着地のノードは掴ませない（まだ“居ない”ため）。
      if (nodeAppear(nodeArrivals[i], drawProgress.get()).opacity < 0.5) return;
      e.stopPropagation();
      const pt = toViewBox(e.clientX, e.clientY);
      if (!pt) return;
      const live = getLive();
      live.dragIndex = i;
      live.dragTargetX = pt.x;
      live.dragTargetY = pt.y;
      live.pointer = null; // 掴み中は反発を切る
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [reduce, toViewBox, getLive, nodeArrivals, drawProgress],
  );

  const handleNodePointerUp = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      const live = getLive();
      if (live.dragIndex < 0) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* capture が無い場合は無視 */
      }
      // 解放: releaseX/Y は rAF が現値を保持済み。dragIndex を外せば lerp で base へ。
      live.dragIndex = -1;
    },
    [getLive],
  );

  return (
    <section
      id="network"
      ref={sectionRef}
      className="relative px-6 py-24 sm:px-10 sm:py-32"
    >
      {/* 流れる点線（装飾）。 */}
      <FlowLine className="absolute left-6 top-24 h-2 w-40 rotate-3 text-[#cfe1fb] opacity-35 sm:left-10" />
      <div className="mx-auto grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* 要旨 = テキスト。図の代替もここが担う。 */}
        <div className="max-w-xl">
          <SplitText
            as="h2"
            by="char"
            className="font-display text-3xl tracking-tight text-bg sm:text-4xl"
          >
            {copy.network.title}
          </SplitText>
          <p className="reveal mt-6 text-base leading-[1.9] text-bg/80 sm:text-lg">
            {withMark(copy.network.prose, "グラフ")}
          </p>
          <p className="reveal mt-6 font-mono text-[13px] leading-relaxed tracking-tight text-bg/70">
            {copy.network.caption}
          </p>
        </div>

        {/* 図 = 装飾。aria-hidden。bg-panel カードに収める。 */}
        <div
          ref={figureRef}
          aria-hidden
          className="lit-top reveal rounded-card border border-border bg-panel p-4 sm:p-6"
        >
          <svg
            ref={svgRef}
            viewBox="0 0 360 300"
            className="h-auto w-full"
            role="presentation"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            style={{ touchAction: reduce ? undefined : "none" }}
          >
            {/* エッジ — draw-on 進捗で引かれ、端点はノードの現在位置に追従。 */}
            <g fill="none" strokeLinecap="round">
              {EDGES.map(([from, to], i) => {
                const a = NODES[NODE_INDEX[from]];
                const b = NODES[NODE_INDEX[to]];
                const accent = from === "me" || to === "me";
                const len = edgeLengths[i];
                return (
                  <line
                    key={`${from}-${to}`}
                    ref={(el) => {
                      lineRefs.current[i] = el;
                    }}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={accent ? "var(--color-accent)" : "var(--color-border)"}
                    strokeWidth={accent ? 1.75 : 1.5}
                    strokeOpacity={accent ? 0.85 : 1}
                    strokeDasharray={len}
                    strokeDashoffset={reduce ? 0 : len}
                  />
                );
              })}
            </g>

            {/* ノード — 届いたエッジの完了点でフェード/スケール着地、その後ゆらぐ。 */}
            {NODES.map((node, i) => (
              <g
                key={node.id}
                ref={(el) => {
                  groupRefs.current[i] = el;
                }}
                onPointerDown={reduce ? undefined : handleNodePointerDown(i)}
                onPointerUp={reduce ? undefined : handleNodePointerUp}
                onPointerCancel={reduce ? undefined : handleNodePointerUp}
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  opacity: reduce ? 1 : 0,
                  cursor: reduce ? undefined : "grab",
                  touchAction: reduce ? undefined : "none",
                }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius(node)}
                  fill={node.self ? "var(--color-accent)" : "var(--color-panel)"}
                  stroke="var(--color-accent)"
                  strokeWidth={node.self ? 0 : 1.75}
                />
                <text
                  x={node.x}
                  y={node.self ? node.y - 16 : node.y - 12}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={node.self ? 11 : 10}
                  fill={node.self ? "var(--color-accent)" : "var(--color-muted)"}
                  fontWeight={node.self ? 600 : 400}
                  // ラベルはノード中心基準でスケールに追従（transformOrigin: center）。
                  style={{ pointerEvents: "none" }}
                >
                  {node.handle}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}
