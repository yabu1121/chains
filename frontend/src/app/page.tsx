import { MotionConfig } from "framer-motion";
import ScrollProgress from "@/components/motion/scroll-progress";
import { Network3DBackground } from "@/components/hero/network-3d-bg";
import Hero from "@/components/sections/hero";
import How from "@/components/sections/how";
import Showcase from "@/components/sections/showcase";
import Profile from "@/components/sections/profile";
import Network from "@/components/sections/network";
import Quiet from "@/components/sections/quiet";
import News from "@/components/sections/news";
import Faq from "@/components/sections/faq";
import Cta from "@/components/sections/cta";
import Footer from "@/components/sections/footer";

/**
 * 公開ルート（/）のランディングページ。暗い・手書き書体のマーケ LP。
 * `.lp` でスコープし、アプリ本体（紙地 / JetBrains+Plex）には影響させない
 * （暗い地・Klee 書体・LP 用 CSS は globals の `.lp` 配下に閉じてある）。
 * 3D ネットワークは固定背景。ログイン状態に関わらず表示する（自動遷移はしない）。
 */
export default function Home() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="lp">
        <ScrollProgress />
        <Network3DBackground />
        <Hero />
        <main className="relative flex flex-col gap-3 px-3 pb-3 sm:gap-4 sm:px-4 lg:gap-5 lg:px-6 lg:pb-6">
          <How />
          <Showcase />
          <Profile />
          <Network />
          <Quiet />
          <News />
          <Faq />
          <Cta />
          <Footer />
        </main>
      </div>
    </MotionConfig>
  );
}
