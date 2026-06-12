"use client";

import { Canvas } from "@react-three/fiber";
import { Text3D, Center, Float } from "@react-three/drei";
// three 同梱の typeface フォント（押し出し用）。追加アセット不要。
import helvetiker from "three/examples/fonts/helvetiker_regular.typeface.json";
import { useReducedMotionSafe } from "./use-reduced-motion-safe";
import { useMounted } from "./use-mounted";

function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Name3D — ブランド名を「本物の 3D 押し出し文字」で表示し、ゆっくり浮遊・回転させる。
 * drei Text3D（three 同梱フォントで extrude）＋ Float（揺れ・回転）。
 * SSR / 初回描画 / reduced-motion / WebGL 非対応ではプレーンなテキストにフォールバック
 * （aria 的にも常に語が読める）。
 */
export function Name3D({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduced = useReducedMotionSafe();
  const mounted = useMounted();
  const show3d = mounted && !reduced && hasWebGL();

  if (!show3d) {
    return (
      <span className={className} aria-label={text}>
        {text}
      </span>
    );
  }

  return (
    <span role="img" aria-label={text} className="inline-block align-middle leading-none">
      <span aria-hidden className="block h-10 w-[168px]">
        <Canvas
          camera={{ position: [0, 0, 4.4], fov: 30 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 4, 6]} intensity={1.2} />
          <directionalLight position={[-5, -2, 1]} intensity={0.3} />
          <Float speed={2.2} rotationIntensity={0.8} floatIntensity={0.6}>
            <Center>
              <Text3D
                font={helvetiker as never}
                size={0.62}
                height={0.18}
                bevelEnabled
                bevelSize={0.012}
                bevelThickness={0.02}
                bevelSegments={3}
                curveSegments={5}
              >
                {text}
                <meshStandardMaterial
                  color="#eef2f8"
                  roughness={0.42}
                  metalness={0.12}
                />
              </Text3D>
            </Center>
          </Float>
        </Canvas>
      </span>
    </span>
  );
}
