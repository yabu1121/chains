"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/*
 * 3D ネットワーク星座（R3F）。「紙の上で生きている藍のインク」。
 *
 * コンセプト: chains は「つながりのネットワーク」。3D 空間に藍インクのノード（エンジニア）が
 * 緩やかなスラブ状に漂い、近いもの同士が線で結ばれて生きた星座になる。網は静止せず、
 * 信号が走り、ノードが呼吸し、ときどき火花が散り、波紋が広がって再構成され続ける。
 *
 * アニメーション層（多層）:
 *  1. 漂い (drift): 位相をずらした sin の合成 + 二次の遅い波で有機的に揺らぐ。
 *  2. 呼吸 (breathing): ノードのスケール/明度が位相ずれで波打つ。
 *  3. 信号パルス (signal pulses): エッジ上を光点が source→target へ流れる。プール化・上限管理。
 *     到達時に target ノードを小さく明滅させ、確率で隣接エッジへ伝播。
 *  4. accent フレア (flares): ときどきノードが藍 #2d4f7c に強く点灯してフェード（火花）。
 *  5. 波紋リング (ripples): フレア/信号到達からリングが広がって消える。プール化。
 *  6. 視差/被写界深度: 奥行きでサイズ・明度・揺らぎ速度を変え 2.5D 感を強める。
 *  7. ポインタ反応: カーソル近傍のノードが寄って光り、近傍エッジが濃くなる。
 *     ポインタが速く動くと近傍ノードから信号がバーストする。
 *  8. 全体: ゆっくり自転 + ポインタ視差（ばね lerp）。
 *
 * 設計:
 *  - ノード = instancedMesh（小球）。色は instanceColor を毎フレーム更新（呼吸/フレア/ホット反映）。
 *  - エッジ = 1 本の THREE.LineSegments（vertexColors）。端点・色を毎フレーム更新、draw call 1。
 *  - 信号 = instancedMesh（プール）。リング = instancedMesh（プール）。いずれも上限固定。
 *  - 配色 = 藍 #2d4f7c 主役、一部 ink / muted。地色は紙 #faf8f4。発光に頼らず形と奥行きで品質を出す。
 *  - 性能 = dpr [1,2] / instancing / バッファ再利用 / useFrame 内でオブジェクト生成しない /
 *    オフスクリーンで frameloop 停止 / モバイルはノード・信号数を削減。
 *  - reducedMotion = すべての層を止め、静止した 1 枚を描く（frameloop="never"）。
 */

// 地が藍（body bg = #2d4f7c）になったので、3D 網も明色へ反転（藍の上で生きる）。
const COLORS = {
  bg: new THREE.Color("#1e3556"),
  accent: new THREE.Color("#cfe1fb"), // 主役ノード = 明るい青白
  accentBright: new THREE.Color("#ffffff"), // フレア/信号のピーク = 白
  ink: new THREE.Color("#eef2f8"), // 明るい紙
  muted: new THREE.Color("#9fb6d8"), // 中間の淡い青
};

// ライン基準色（藍の上で見える淡い青）と、ホット時に寄せる明色
const EDGE_BASE = new THREE.Color("#b7c8e6");
const EDGE_HOT = new THREE.Color("#dceafb");

// 流れる点線（一部のエッジを一方向フローの破線にする）。
const FLOW_COLOR = new THREE.Color("#e3f0ff");
const FLOW_DASH = 0.16; // 破線の長さ（world 単位）
const FLOW_GAP = 0.14; // 隙間
const FLOW_SPEED = 0.9; // lineDistance/秒（一方向の流れ速度）
/** どのエッジを「流れる点線」にするか（決定的・約 1/3）。 */
function isFlowEdge(e: number): boolean {
  return e % 3 === 0;
}

// ── 入場（バウンス）: ノードと線が弾みながら順に現れる ──────────────────────
const INTRO_NODE_DUR = 0.62; // 1 ノードが現れる時間（秒）
const INTRO_EDGE_DUR = 0.5; // 1 エッジが伸びる時間（秒）
const INTRO_SPREAD = 0.85; // 全ノードに散らす遅延の幅（秒）
const INTRO_BOUNCE = 4.2; // outBack のオーバーシュート量（大きいほど弾む）

/** outBack: 終端で行き過ぎてから戻る＝ぽんっと弾む。x:0..1、戻り値はピークで >1。 */
function outBack(x: number, s = INTRO_BOUNCE): number {
  const c1 = s;
  const c3 = c1 + 1;
  const p = x - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}
/** smoothstep（線の伸びは行き過ぎさせず滑らかに）。 */
function smoothStep(x: number): number {
  return x * x * (3 - 2 * x);
}
/** ノード i の入場遅延（秒）。決定的に散らす。 */
function nodeIntroDelay(i: number, total: number): number {
  return total > 1 ? (i / (total - 1)) * INTRO_SPREAD : 0;
}

interface Network3DProps {
  reducedMotion: boolean;
  className?: string;
}

/** 決定的擬似乱数（SSR / 再マウントで同じ星座にする） */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface NodeDatum {
  /** ベース位置 */
  base: THREE.Vector3;
  /** 漂いの位相・速度・振幅（軸ごと） */
  phase: THREE.Vector3;
  speed: THREE.Vector3;
  amp: THREE.Vector3;
  /** 二次（遅い）漂いの位相・速度・振幅 — 星座の再編成感 */
  phase2: THREE.Vector3;
  speed2: THREE.Vector3;
  amp2: THREE.Vector3;
  /** 呼吸の位相・速度 */
  breathPhase: number;
  breathSpeed: number;
  /** 基本半径スケール */
  size: number;
  /** ベース色（藍 / ink / muted の階調） */
  color: THREE.Color;
  /** accent ノードか（フレアの起点になりやすい） */
  isAccent: boolean;
}

function buildNodes(count: number, spread: number, depth: number): NodeDatum[] {
  const rng = makeRng(0x9e3779b1);
  const nodes: NodeDatum[] = [];
  for (let i = 0; i < count; i++) {
    // カメラに向いた緩いスラブ（x,y は広く、z は浅く）。中央寄りを密に。
    const x = (rng() - 0.5) * 2 * spread;
    const y = (rng() - 0.5) * 2 * spread * 0.62;
    const z = (rng() - 0.5) * 2 * depth;
    // accent は火花。一部だけ藍、残りは ink / muted の控えめな階調。
    const roll = rng();
    const isAccent = roll < 0.22;
    const color = isAccent
      ? COLORS.accent.clone()
      : roll < 0.55
        ? COLORS.ink.clone()
        : COLORS.muted.clone();
    nodes.push({
      base: new THREE.Vector3(x, y, z),
      phase: new THREE.Vector3(
        rng() * Math.PI * 2,
        rng() * Math.PI * 2,
        rng() * Math.PI * 2,
      ),
      speed: new THREE.Vector3(
        0.18 + rng() * 0.22,
        0.16 + rng() * 0.22,
        0.12 + rng() * 0.18,
      ),
      amp: new THREE.Vector3(
        0.22 + rng() * 0.3,
        0.22 + rng() * 0.3,
        0.14 + rng() * 0.22,
      ),
      phase2: new THREE.Vector3(
        rng() * Math.PI * 2,
        rng() * Math.PI * 2,
        rng() * Math.PI * 2,
      ),
      speed2: new THREE.Vector3(
        0.045 + rng() * 0.06,
        0.04 + rng() * 0.06,
        0.035 + rng() * 0.05,
      ),
      amp2: new THREE.Vector3(
        0.3 + rng() * 0.45,
        0.3 + rng() * 0.45,
        0.12 + rng() * 0.2,
      ),
      breathPhase: rng() * Math.PI * 2,
      breathSpeed: 0.5 + rng() * 0.7,
      size: isAccent ? 0.85 + rng() * 0.5 : 0.5 + rng() * 0.5,
      color,
      isAccent,
    });
  }
  return nodes;
}

interface EdgeDatum {
  a: number;
  b: number;
}

/** 近接ノード対を結線（各ノードは最大 maxPerNode 本まで。重複排除）。 */
function buildEdges(
  nodes: NodeDatum[],
  maxDist: number,
  maxPerNode: number,
): EdgeDatum[] {
  const edges: EdgeDatum[] = [];
  const seen = new Set<string>();
  const degree = new Int16Array(nodes.length);
  const maxD2 = maxDist * maxDist;
  for (let i = 0; i < nodes.length; i++) {
    // i に近い候補を距離順で集める
    const candidates: Array<{ j: number; d2: number }> = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d2 = nodes[i].base.distanceToSquared(nodes[j].base);
      if (d2 < maxD2) candidates.push({ j, d2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    for (const c of candidates) {
      if (degree[i] >= maxPerNode) break;
      if (degree[c.j] >= maxPerNode) continue;
      const key = i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: i, b: c.j });
      degree[i]++;
      degree[c.j]++;
    }
  }
  return edges;
}

/** 各ノードから伸びるエッジ index のリスト（信号の伝播に使う）。 */
function buildAdjacency(
  edgeCount: number,
  edges: EdgeDatum[],
  nodeCount: number,
): number[][] {
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let e = 0; e < edgeCount; e++) {
    adj[edges[e].a].push(e);
    adj[edges[e].b].push(e);
  }
  return adj;
}

/* ------------------------------------------------------------------ */
/* シーン本体                                                          */
/* ------------------------------------------------------------------ */

interface ConstellationProps {
  reducedMotion: boolean;
  count: number;
  spread: number;
  depth: number;
  maxSignals: number;
  maxRipples: number;
  pointer: React.RefObject<{ x: number; y: number; vx: number; vy: number }>;
}

/** 信号（エッジ上を流れる光点）のプール要素。 */
interface Signal {
  active: boolean;
  edge: number; // 走っているエッジ index
  from: number; // 進行方向の始点ノード
  to: number; // 終点ノード
  t: number; // 0..1 進捗
  speed: number;
}

/** 波紋リングのプール要素。 */
interface Ripple {
  active: boolean;
  node: number; // 起点ノード
  t: number; // 0..1（寿命）
  speed: number;
  maxR: number;
}

/**
 * フレーム間で「直接プロパティ代入」で持ち越す可変状態。
 * useMemo 戻り値への直接代入（obj.x = / arr[i] =）は React の immutability ルールに触れるため、
 * これらは素のファクトリで生成し useRef に保持して、コールバック内でのみ変異させる。
 * （THREE オブジェクトはメソッド経由の変異なので useMemo のままで良い。）
 */
interface DynState {
  /** ノードごとの動的状態 */
  nodeState: { flare: number; flash: number; hot: number }[];
  /** エッジの動的ホット */
  edgeHot: Float32Array;
  signals: Signal[];
  ripples: Ripple[];
  spawnRng: () => number;
  spawnState: { nextSignalAt: number; nextFlareAt: number };
}

function buildDynState(
  nodeCount: number,
  edgeCount: number,
  maxSignals: number,
  maxRipples: number,
): DynState {
  return {
    nodeState: Array.from({ length: nodeCount }, () => ({
      flare: 0,
      flash: 0,
      hot: 0,
    })),
    edgeHot: new Float32Array(edgeCount),
    signals: Array.from({ length: maxSignals }, () => ({
      active: false,
      edge: 0,
      from: 0,
      to: 0,
      t: 0,
      speed: 0,
    })),
    ripples: Array.from({ length: maxRipples }, () => ({
      active: false,
      node: 0,
      t: 0,
      speed: 0,
      maxR: 0,
    })),
    spawnRng: makeRng(0x1234abcd),
    spawnState: { nextSignalAt: 0.6, nextFlareAt: 1.2 },
  };
}

function Constellation({
  reducedMotion,
  count,
  spread,
  depth,
  maxSignals,
  maxRipples,
  pointer,
}: ConstellationProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const flowLinesRef = useRef<THREE.LineSegments>(null);
  const flowOffsetRef = useRef(0);
  const signalsRef = useRef<THREE.InstancedMesh>(null);
  const ripplesRef = useRef<THREE.InstancedMesh>(null);
  // 入場の基準時刻（最初のフレームの t を記録し、そこからの経過で登場させる）。
  const introRef = useRef(-1);
  const invalidate = useThree((s) => s.invalidate);

  // THREE オブジェクト（メソッド変異のみ）は useMemo。決定的なので毎回同じ星座。
  const nodes = useMemo(
    () => buildNodes(count, spread, depth),
    [count, spread, depth],
  );
  const edges = useMemo(
    () => buildEdges(nodes, spread * 0.42, 3),
    [nodes, spread],
  );
  const adjacency = useMemo(
    () => buildAdjacency(edges.length, edges, nodes.length),
    [edges, nodes.length],
  );
  const edgeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(edges.length * 2 * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(
        new Float32Array(edges.length * 2 * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    return geo;
  }, [edges.length]);
  // 流れる点線（破線）用ジオメトリ。position と lineDistance を毎フレーム書き換える。
  const flowGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(edges.length * 2 * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      "lineDistance",
      new THREE.BufferAttribute(
        new Float32Array(edges.length * 2),
        1,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    return geo;
  }, [edges.length]);
  const livePositions = useMemo(
    () => nodes.map(() => new THREE.Vector3()),
    [nodes],
  );
  const tmp = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      quat: new THREE.Quaternion(),
      scaleV: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      lerpColor: new THREE.Color(),
      targetRot: new THREE.Euler(),
    }),
    [],
  );

  // 直接プロパティ代入する可変状態は ref に保持し、変異はコールバック内（helper の引数経由）でのみ。
  // 初回は遅延 null 初期化、以降は依存変化時に effect で作り直す（render 中の ref 読みを避ける）。
  // 作り直しが反映されるまでの 1 フレームは useFrame 側で長さ不一致を検出してスキップする。
  const dynRef = useRef<DynState | null>(null);
  if (dynRef.current === null) {
    dynRef.current = buildDynState(
      nodes.length,
      edges.length,
      maxSignals,
      maxRipples,
    );
  }
  useEffect(() => {
    dynRef.current = buildDynState(
      nodes.length,
      edges.length,
      maxSignals,
      maxRipples,
    );
  }, [nodes.length, edges.length, maxSignals, maxRipples]);

  /** 信号をプールから 1 つ拾って起動する。空きが無ければ何もしない。 */
  const spawnSignal = (
    dyn: DynState,
    edge: number,
    from: number,
    to: number,
    speed: number,
  ) => {
    const signals = dyn.signals;
    for (let i = 0; i < signals.length; i++) {
      if (!signals[i].active) {
        const sg = signals[i];
        sg.active = true;
        sg.edge = edge;
        sg.from = from;
        sg.to = to;
        sg.t = 0;
        sg.speed = speed;
        return true;
      }
    }
    return false;
  };

  /** リングをプールから 1 つ拾って起動する。 */
  const spawnRipple = (
    dyn: DynState,
    node: number,
    maxR: number,
    speed: number,
  ) => {
    const ripples = dyn.ripples;
    for (let i = 0; i < ripples.length; i++) {
      if (!ripples[i].active) {
        const rp = ripples[i];
        rp.active = true;
        rp.node = node;
        rp.t = 0;
        rp.speed = speed;
        rp.maxR = maxR;
        return true;
      }
    }
    return false;
  };

  // 初期インスタンス色（呼吸/フレアで上書きするので毎フレーム更新するが、初期値も入れる）
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < nodes.length; i++) {
      mesh.setColorAt(i, nodes[i].color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodes]);

  // 信号・リングの色は material 側で固定（藍）。instanceColor は使わない。

  /* ---- ノード位置・色を計算して書き込む。
     pull=true のときポインタ見かけ位置 (pwx,pwy) へ hot 比例で引き寄せる。
     reduced の静止画は pull=false / t=0 で 1 回呼ぶ（呼吸 0）。 ---- */
  const computeNodes = (
    dyn: DynState,
    t: number,
    pwx: number,
    pwy: number,
    pull: boolean,
    intro: number,
  ) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const nodeState = dyn.nodeState;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const st = nodeState[i];
      const lp = livePositions[i];
      // 一次（速い）+ 二次（遅い・再編成）の漂い合成
      let lx =
        n.base.x +
        Math.sin(t * n.speed.x + n.phase.x) * n.amp.x +
        Math.sin(t * n.speed2.x + n.phase2.x) * n.amp2.x;
      let ly =
        n.base.y +
        Math.sin(t * n.speed.y + n.phase.y) * n.amp.y +
        Math.sin(t * n.speed2.y + n.phase2.y) * n.amp2.y;
      const lz =
        n.base.z +
        Math.sin(t * n.speed.z + n.phase.z) * n.amp.z +
        Math.sin(t * n.speed2.z + n.phase2.z) * n.amp2.z;

      // ポインタ誘引: hot に比例して見かけ位置へ寄せる（触ると応える）
      if (pull && st.hot > 0.001) {
        lx += (pwx - lx) * st.hot * 0.18;
        ly += (pwy - ly) * st.hot * 0.18;
      }
      lp.set(lx, ly, lz);

      // 奥行きスケール（手前ほど大きい）+ 呼吸 + フレア + ホット + 到達明滅
      const depthScale = 1 + (lp.z / depth) * 0.22;
      const breath = pull
        ? Math.sin(t * n.breathSpeed + n.breathPhase) * 0.14
        : 0;
      const grow = 1 + st.hot * 0.85 + st.flare * 0.5 + st.flash * 0.6 + breath;
      // 入場: 遅延後に 0→1（バウンス）。ピークで >1 になりぽんっと弾けて出る。
      const delay = nodeIntroDelay(i, nodes.length);
      const ap = (intro - delay) / INTRO_NODE_DUR;
      const appear = ap <= 0 ? 0 : ap >= 1 ? 1 : outBack(ap);
      const s = n.size * 0.13 * depthScale * grow * appear;
      tmp.scaleV.set(s, s, s);
      tmp.matrix.compose(lp, tmp.quat, tmp.scaleV);
      mesh.setMatrixAt(i, tmp.matrix);

      // 色: ベース色から、フレア/ホット/明滅で明るい藍へ寄せる
      const lift = Math.min(1, st.flare * 1.0 + st.hot * 0.7 + st.flash * 0.8);
      if (lift > 0.001) {
        tmp.lerpColor.copy(n.color).lerp(COLORS.accentBright, lift);
        mesh.setColorAt(i, tmp.lerpColor);
      } else {
        mesh.setColorAt(i, n.color);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  /* ---- エッジ端点 + 頂点色を書き込む ---- */
  const computeEdges = (dyn: DynState, intro: number) => {
    const lines = linesRef.current;
    if (!lines) return;
    const edgeHot = dyn.edgeHot;
    const posAttr = lines.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const colAttr = lines.geometry.getAttribute("color") as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    const nodeCount = nodes.length;
    for (let e = 0; e < edges.length; e++) {
      const pa = livePositions[edges[e].a];
      const pb = livePositions[edges[e].b];
      const o = e * 6;
      // 流れる点線にする edge は、ソリッド側では潰して描かない（破線側で描く）。
      if (isFlowEdge(e)) {
        pos[o] = pa.x;
        pos[o + 1] = pa.y;
        pos[o + 2] = pa.z;
        pos[o + 3] = pa.x;
        pos[o + 4] = pa.y;
        pos[o + 5] = pa.z;
        col[o] = 0;
        col[o + 1] = 0;
        col[o + 2] = 0;
        col[o + 3] = 0;
        col[o + 4] = 0;
        col[o + 5] = 0;
        continue;
      }
      // 入場: 両端ノードが出た後に、a から b へ線が伸びる（行き過ぎさせず滑らかに）。
      const eDelay =
        Math.max(
          nodeIntroDelay(edges[e].a, nodeCount),
          nodeIntroDelay(edges[e].b, nodeCount),
        ) + 0.12;
      const eap = (intro - eDelay) / INTRO_EDGE_DUR;
      const eg = eap <= 0 ? 0 : eap >= 1 ? 1 : smoothStep(eap);
      pos[o] = pa.x;
      pos[o + 1] = pa.y;
      pos[o + 2] = pa.z;
      pos[o + 3] = pa.x + (pb.x - pa.x) * eg;
      pos[o + 4] = pa.y + (pb.y - pa.y) * eg;
      pos[o + 5] = pa.z + (pb.z - pa.z) * eg;
      // ホットに応じて罫色→濃藍へ補間
      const h = edgeHot[e];
      if (h > 0.002) {
        tmp.lerpColor.copy(EDGE_BASE).lerp(EDGE_HOT, Math.min(1, h));
        col[o] = tmp.lerpColor.r;
        col[o + 1] = tmp.lerpColor.g;
        col[o + 2] = tmp.lerpColor.b;
        col[o + 3] = tmp.lerpColor.r;
        col[o + 4] = tmp.lerpColor.g;
        col[o + 5] = tmp.lerpColor.b;
      } else {
        col[o] = EDGE_BASE.r;
        col[o + 1] = EDGE_BASE.g;
        col[o + 2] = EDGE_BASE.b;
        col[o + 3] = EDGE_BASE.r;
        col[o + 4] = EDGE_BASE.g;
        col[o + 5] = EDGE_BASE.b;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  /* ---- 流れる点線（破線）edge を描く。lineDistance を時間オフセットして一方向に流す ---- */
  const computeFlowEdges = (dyn: DynState, intro: number) => {
    void dyn;
    const lines = flowLinesRef.current;
    if (!lines) return;
    const posAttr = lines.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const distAttr = lines.geometry.getAttribute(
      "lineDistance",
    ) as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const dist = distAttr.array as Float32Array;
    const nodeCount = nodes.length;
    const off = flowOffsetRef.current;
    for (let e = 0; e < edges.length; e++) {
      const o = e * 6;
      const d = e * 2;
      const pa = livePositions[edges[e].a];
      if (!isFlowEdge(e)) {
        // 非フロー edge は破線側では潰す（描かない）。
        pos[o] = pa.x;
        pos[o + 1] = pa.y;
        pos[o + 2] = pa.z;
        pos[o + 3] = pa.x;
        pos[o + 4] = pa.y;
        pos[o + 5] = pa.z;
        dist[d] = 0;
        dist[d + 1] = 0;
        continue;
      }
      const pb = livePositions[edges[e].b];
      const eDelay =
        Math.max(
          nodeIntroDelay(edges[e].a, nodeCount),
          nodeIntroDelay(edges[e].b, nodeCount),
        ) + 0.12;
      const eap = (intro - eDelay) / INTRO_EDGE_DUR;
      const eg = eap <= 0 ? 0 : eap >= 1 ? 1 : smoothStep(eap);
      const bx = pa.x + (pb.x - pa.x) * eg;
      const by = pa.y + (pb.y - pa.y) * eg;
      const bz = pa.z + (pb.z - pa.z) * eg;
      pos[o] = pa.x;
      pos[o + 1] = pa.y;
      pos[o + 2] = pa.z;
      pos[o + 3] = bx;
      pos[o + 4] = by;
      pos[o + 5] = bz;
      // lineDistance に時間オフセットを引いて、破線が a→b 方向へ一定速度で流れる。
      const len = Math.hypot(bx - pa.x, by - pa.y, bz - pa.z);
      dist[d] = -off;
      dist[d + 1] = len - off;
    }
    posAttr.needsUpdate = true;
    distAttr.needsUpdate = true;
  };

  /* ---- 信号インスタンスを描く（非アクティブは原点で 0 スケール） ---- */
  const computeSignals = (dyn: DynState) => {
    const sm = signalsRef.current;
    if (!sm) return;
    const signals = dyn.signals;
    for (let i = 0; i < signals.length; i++) {
      const sg = signals[i];
      if (!sg.active) {
        tmp.scaleV.set(0, 0, 0);
        tmp.pos.set(0, 0, 0);
        tmp.matrix.compose(tmp.pos, tmp.quat, tmp.scaleV);
        sm.setMatrixAt(i, tmp.matrix);
        continue;
      }
      const pa = livePositions[sg.from];
      const pb = livePositions[sg.to];
      tmp.pos.lerpVectors(pa, pb, sg.t);
      // 端では小さく、中間で僅かに大きく（流れの粒として）
      const fade = Math.sin(sg.t * Math.PI);
      const s = 0.09 + fade * 0.07;
      tmp.scaleV.set(s, s, s);
      tmp.matrix.compose(tmp.pos, tmp.quat, tmp.scaleV);
      sm.setMatrixAt(i, tmp.matrix);
    }
    sm.instanceMatrix.needsUpdate = true;
  };

  /* ---- リングインスタンスを描く ---- */
  const computeRipples = (dyn: DynState) => {
    const rm = ripplesRef.current;
    if (!rm) return;
    const ripples = dyn.ripples;
    for (let i = 0; i < ripples.length; i++) {
      const rp = ripples[i];
      if (!rp.active) {
        tmp.scaleV.set(0, 0, 0);
        tmp.pos.set(0, 0, 0);
        tmp.matrix.compose(tmp.pos, tmp.quat, tmp.scaleV);
        rm.setMatrixAt(i, tmp.matrix);
        continue;
      }
      const lp = livePositions[rp.node];
      tmp.pos.copy(lp);
      const r = rp.t * rp.maxR;
      tmp.scaleV.set(r, r, r);
      tmp.matrix.compose(tmp.pos, tmp.quat, tmp.scaleV);
      rm.setMatrixAt(i, tmp.matrix);
    }
    rm.instanceMatrix.needsUpdate = true;
  };

  /* ---- 静止フレーム（reducedMotion） ---- */
  const computeStill = (dyn: DynState) => {
    // 全状態をゼロにして t=0 の素の網を描く
    for (const st of dyn.nodeState) {
      st.flare = 0;
      st.flash = 0;
      st.hot = 0;
    }
    dyn.edgeHot.fill(0);
    for (const sg of dyn.signals) sg.active = false;
    for (const rp of dyn.ripples) rp.active = false;
    // reduced/静止は入場を完了状態（intro 大）で描く。
    computeNodes(dyn, 0, 0, 0, false, 999);
    computeEdges(dyn, 999);
    computeFlowEdges(dyn, 999);
    computeSignals(dyn);
    computeRipples(dyn);
  };

  useEffect(() => {
    if (!reducedMotion) return;
    const dyn = dynRef.current;
    if (!dyn) return;
    const g = groupRef.current;
    if (g) g.rotation.set(0.12, -0.18, 0);
    computeStill(dyn);
    // メッシュ生成直後の 1 フレームは ref が未準備のことがあり、原点に潰れた塊に
    // 見えることがある。次フレームでもう一度描いて確実に静止網を出す。
    const id = requestAnimationFrame(() => {
      computeStill(dyn);
      invalidate();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, nodes, edges, invalidate]);

  /* ---- アニメーションループ ---- */
  useFrame((state, delta) => {
    if (reducedMotion) return;
    const dyn = dynRef.current;
    if (!dyn) return;
    // 星座サイズ変更直後の 1 フレーム、dyn が旧長さのことがある。整合まで描画を待つ。
    if (dyn.nodeState.length !== nodes.length || dyn.edgeHot.length !== edges.length)
      return;
    const { nodeState, edgeHot, signals, ripples, spawnState, spawnRng } = dyn;

    const t = state.clock.elapsedTime;
    // 入場の基準時刻を最初のフレームで記録し、そこからの経過で登場させる。
    if (introRef.current < 0) introRef.current = t;
    const intro = t - introRef.current;
    // 暴れ防止に dt をクランプ（タブ復帰時の跳ね対策）
    const dt = Math.min(delta, 0.05);

    const g = groupRef.current;

    // --- ポインタ近接の算出（world 空間でノードへ寄せる） ---
    // pointer は -1..1。カメラ前方の平面に投影した近似ターゲットを作る。
    const px = pointer.current.x;
    const py = pointer.current.y;
    const pvMag = Math.hypot(pointer.current.vx, pointer.current.vy);
    // group のローカルへ変換せず、近似で x/y の見かけ位置にマップ（spread 基準）
    const pointerWorldX = px * spread * 0.95;
    const pointerWorldY = -py * spread * 0.6;

    // --- 信号スポーン（周期 + ポインタ速度でバースト） ---
    if (edges.length > 0) {
      if (t >= spawnState.nextSignalAt) {
        const e = Math.floor(spawnRng() * edges.length);
        const ed = edges[e];
        const dir = spawnRng() < 0.5;
        spawnSignal(
          dyn,
          e,
          dir ? ed.a : ed.b,
          dir ? ed.b : ed.a,
          0.4 + spawnRng() * 0.5,
        );
        // 次回まで 0.35〜1.1s（生命感のあるばらつき）
        spawnState.nextSignalAt = t + 0.35 + spawnRng() * 0.75;
      }
      // ポインタが速く動いたら近傍ノードから信号バースト
      if (pvMag > 0.06) {
        let bursts = 0;
        for (let i = 0; i < nodes.length && bursts < 2; i++) {
          const lp = livePositions[i];
          const dx = lp.x - pointerWorldX;
          const dy = lp.y - pointerWorldY;
          if (dx * dx + dy * dy < 5.5 && adjacency[i].length > 0) {
            if (spawnRng() < 0.5) {
              const e = adjacency[i][Math.floor(spawnRng() * adjacency[i].length)];
              const ed = edges[e];
              const to = ed.a === i ? ed.b : ed.a;
              if (spawnSignal(dyn, e, i, to, 0.6 + spawnRng() * 0.5)) bursts++;
            }
          }
        }
      }
    }

    // --- フレア（火花）スポーン ---
    if (t >= spawnState.nextFlareAt && nodes.length > 0) {
      // accent ノードを優先的に選ぶ
      let idx = Math.floor(spawnRng() * nodes.length);
      for (let tries = 0; tries < 4 && !nodes[idx].isAccent; tries++) {
        idx = Math.floor(spawnRng() * nodes.length);
      }
      nodeState[idx].flare = 1;
      spawnRipple(dyn, idx, 1.4 + spawnRng() * 0.8, 0.7 + spawnRng() * 0.5);
      spawnState.nextFlareAt = t + 1.6 + spawnRng() * 2.4;
    }

    // --- ノード状態の更新（フレア減衰・明滅減衰・ホット補間） ---
    for (let i = 0; i < nodes.length; i++) {
      const st = nodeState[i];
      st.flare = Math.max(0, st.flare - dt * 1.4);
      st.flash = Math.max(0, st.flash - dt * 3.2);
      // ポインタ近接 hot（world 近似）
      const lp = livePositions[i];
      const dx = lp.x - pointerWorldX;
      const dy = lp.y - pointerWorldY;
      const d2 = dx * dx + dy * dy;
      const RAD2 = 9; // 近接半径^2
      let target = 0;
      if (d2 < RAD2 && Math.abs(px) + Math.abs(py) > 0.001) {
        target = 1 - Math.sqrt(d2) / 3;
        target = Math.max(0, Math.min(1, target));
      }
      st.hot += (target - st.hot) * (target > st.hot ? 0.25 : 0.07);
    }

    // --- 信号の更新（進捗・到達処理） ---
    for (let i = 0; i < signals.length; i++) {
      const sg = signals[i];
      if (!sg.active) continue;
      sg.t += dt * sg.speed;
      // 通過中のエッジを少し温める
      edgeHot[sg.edge] = Math.min(1, edgeHot[sg.edge] + dt * 2.2);
      if (sg.t >= 1) {
        sg.active = false;
        // 到達: target を明滅、確率で隣接エッジへ伝播
        const dst = sg.to;
        nodeState[dst].flash = 1;
        if (spawnRng() < 0.4) spawnRipple(dyn, dst, 1.0 + spawnRng() * 0.6, 0.9);
        const adj = adjacency[dst];
        if (adj.length > 0 && spawnRng() < 0.55) {
          const ne = adj[Math.floor(spawnRng() * adj.length)];
          const ned = edges[ne];
          const nto = ned.a === dst ? ned.b : ned.a;
          spawnSignal(dyn, ne, dst, nto, sg.speed * (0.85 + spawnRng() * 0.2));
        }
      }
    }

    // --- エッジホットの減衰 + ポインタ近傍エッジの強調 ---
    for (let e = 0; e < edges.length; e++) {
      // ポインタ近傍は両端ノードの hot から温める
      const hostHot = Math.max(
        nodeState[edges[e].a].hot,
        nodeState[edges[e].b].hot,
      );
      if (hostHot > edgeHot[e]) {
        edgeHot[e] += (hostHot - edgeHot[e]) * 0.2;
      }
      edgeHot[e] = Math.max(0, edgeHot[e] - dt * 0.9);
    }

    // --- リングの更新 ---
    for (let i = 0; i < ripples.length; i++) {
      const rp = ripples[i];
      if (!rp.active) continue;
      rp.t += dt * rp.speed;
      if (rp.t >= 1) rp.active = false;
    }
    // リングの opacity は寿命で薄れる（material は 1 つなので代表値で良い）
    const rm = ripplesRef.current;
    if (rm) {
      let maxLife = 0;
      for (const rp of ripples) if (rp.active) maxLife = Math.max(maxLife, 1 - rp.t);
      const mat = rm.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.05 + maxLife * 0.22;
    }

    // --- 描画: ノード → エッジ → 流れる点線 → 信号 → リング ---
    computeNodes(dyn, t, pointerWorldX, pointerWorldY, true, intro);
    computeEdges(dyn, intro);
    flowOffsetRef.current += dt * FLOW_SPEED;
    computeFlowEdges(dyn, intro);
    computeSignals(dyn);
    computeRipples(dyn);

    // --- 全体回転 + ポインタ視差（ばね lerp） ---
    if (g) {
      tmp.targetRot.set(
        py * 0.2 + Math.sin(t * 0.05) * 0.04,
        px * 0.3 + t * 0.035,
        0,
      );
      g.rotation.x += (tmp.targetRot.x - g.rotation.x) * 0.045;
      g.rotation.y += (tmp.targetRot.y - g.rotation.y) * 0.045;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 16, 16]} />
        {/* インク質感: 適度なラフネス、メタリックなし。色は instanceColor で上書き。 */}
        <meshStandardMaterial roughness={0.55} metalness={0} envMapIntensity={0.3} />
      </instancedMesh>

      <lineSegments ref={linesRef} geometry={edgeGeometry} frustumCulled={false}>
        {/* vertexColors でエッジごとにホット強調。発光に頼らず色面で。 */}
        <lineBasicMaterial vertexColors transparent opacity={0.6} depthWrite={false} />
      </lineSegments>

      {/* 流れる点線（一部のエッジ）。lineDistance を時間で動かして一方向フロー。 */}
      <lineSegments ref={flowLinesRef} geometry={flowGeometry} frustumCulled={false}>
        <lineDashedMaterial
          color={FLOW_COLOR}
          dashSize={FLOW_DASH}
          gapSize={FLOW_GAP}
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </lineSegments>

      {/* 信号パルス（プール）。明るい藍の小球。加算ではなく素の色で控えめに。 */}
      <instancedMesh
        ref={signalsRef}
        args={[undefined, undefined, maxSignals]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          color={COLORS.accentBright}
          transparent
          opacity={0.92}
          depthWrite={false}
        />
      </instancedMesh>

      {/* 波紋リング（プール）。薄い藍の輪。opacity は寿命で material 側を可変。 */}
      <instancedMesh
        ref={ripplesRef}
        args={[undefined, undefined, maxRipples]}
        frustumCulled={false}
      >
        <ringGeometry args={[0.86, 1, 40]} />
        <meshBasicMaterial
          color={COLORS.accent}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* WebGL 判定 + フォールバック                                         */
/* ------------------------------------------------------------------ */

function detectWebGL(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/** WebGL 非対応時の静止フォールバック（簡素な藍の星座 SVG）。 */
function StaticFallback({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <svg
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        style={{ background: "#1e3556" }}
      >
        <g stroke="#b7c8e6" strokeWidth="1" opacity="0.5">
          <line x1="180" y1="150" x2="320" y2="220" />
          <line x1="320" y1="220" x2="470" y2="170" />
          <line x1="470" y1="170" x2="600" y2="260" />
          <line x1="320" y1="220" x2="380" y2="380" />
          <line x1="380" y1="380" x2="540" y2="420" />
          <line x1="540" y1="420" x2="600" y2="260" />
          <line x1="180" y1="150" x2="260" y2="330" />
          <line x1="260" y1="330" x2="380" y2="380" />
        </g>
        {[
          [180, 150, 6, "#cfe1fb"],
          [320, 220, 5, "#eef2f8"],
          [470, 170, 5, "#9fb6d8"],
          [600, 260, 6, "#cfe1fb"],
          [380, 380, 5, "#eef2f8"],
          [540, 420, 6, "#cfe1fb"],
          [260, 330, 4, "#9fb6d8"],
        ].map(([cx, cy, r, c], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={c as string} />
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* エクスポート                                                        */
/* ------------------------------------------------------------------ */

interface Capabilities {
  webglOk: boolean;
  count: number;
  maxSignals: number;
  maxRipples: number;
}

/**
 * クライアント能力（WebGL 可否 + ノード/信号数）を 1 度だけ算出して返す。
 * SSR と初回描画はデフォルト（webglOk=true / desktop 値）で一致させ、マウント後に実値へ。
 */
function useClientCapabilities(): Capabilities {
  const caps = useSyncExternalStore(
    () => () => {},
    () => {
      const narrow = window.matchMedia("(max-width: 640px)").matches;
      // 信号パルス（光球）と波紋リングは廃止（オーナー指示）。プールを 0 にして
      // スポーンを no-op 化し、ノード/線の登場アニメに主役を譲る。
      return JSON.stringify(
        narrow
          ? { webglOk: detectWebGL(), count: 40, maxSignals: 0, maxRipples: 0 }
          : { webglOk: detectWebGL(), count: 72, maxSignals: 0, maxRipples: 0 },
      );
    },
    () =>
      JSON.stringify({
        webglOk: true,
        count: 72,
        maxSignals: 0,
        maxRipples: 0,
      }),
  );
  return useMemo(() => JSON.parse(caps) as Capabilities, [caps]);
}

export default function Network3D({ reducedMotion, className }: Network3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const { webglOk, count, maxSignals, maxRipples } = useClientCapabilities();

  // ポインタ視差（-1..1 に正規化 + 速度を保持。reducedMotion 時は購読しない）
  useEffect(() => {
    if (reducedMotion) return;
    let lastX = 0;
    let lastY = 0;
    let lastT = performance.now();
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      const now = performance.now();
      const dt = Math.max(16, now - lastT) / 1000;
      pointer.current.vx = (nx - lastX) / dt;
      pointer.current.vy = (ny - lastY) / dt;
      pointer.current.x = nx;
      pointer.current.y = ny;
      lastX = nx;
      lastY = ny;
      lastT = now;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  // 速度は移動が止まれば減衰させる（バースト判定が張り付かないように）
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      pointer.current.vx *= 0.6;
      pointer.current.vy *= 0.6;
    }, 100);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  // WebGL 非対応、または reduced-motion では静止フォールバック（藍の星座 SVG）を出す。
  // reduced を Canvas の computeStill で描くとメッシュ準備タイミングで原点に潰れた塊に
  // 見えることがあるため、確実に静止する SVG にする（動きゼロで reduced にも適う）。
  if (!webglOk || reducedMotion) {
    return <StaticFallback className={className} />;
  }

  return (
    <div ref={containerRef} className={className}>
      <Canvas
        dpr={[1, 1.5]}
        // オーナー指示: ヒーロー背景は止めず常時稼働（オフスクリーンでも回し続ける）。
        frameloop="always"
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 13], fov: 42, near: 0.1, far: 60 }}
        style={{ background: "transparent" }}
      >
        {/* 紙地に溶ける藍寄りフォグで奥行きを出す */}
        <fogExp2 attach="fog" args={["#1e3556", 0.052]} />

        {/* 控えめなライティング。インク球の陰影で形を立てる（過度な発光なし）。 */}
        <ambientLight intensity={1.05} />
        <directionalLight position={[4, 6, 8]} intensity={0.85} />
        <directionalLight position={[-6, -3, 2]} intensity={0.25} />

        <Constellation
          reducedMotion={reducedMotion}
          count={count}
          spread={11}
          depth={3.2}
          maxSignals={maxSignals}
          maxRipples={maxRipples}
          pointer={pointer}
        />
      </Canvas>
    </div>
  );
}
