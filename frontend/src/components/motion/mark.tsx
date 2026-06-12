import type { ReactNode } from "react";

/**
 * Mark — キーワードに蛍光ペン風のハイライトを敷く（装飾）。
 * 文字の下 ~42% だけに淡い明色をのせる本物のマーカーの質感。藍地の明色テキスト前提。
 * 複数行に跨っても各行に色がつくよう box-decoration-clone。
 */
export function Mark({ children }: { children: ReactNode }) {
  return (
    <span className="box-decoration-clone rounded-[2px] px-0.5 [background:linear-gradient(transparent_58%,rgba(207,225,251,0.34)_58%)]">
      {children}
    </span>
  );
}

/** text 中の keyword 初出を Mark で囲んで返す（見つからなければ素のまま）。 */
export function withMark(text: string, keyword: string): ReactNode {
  const i = text.indexOf(keyword);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <Mark>{keyword}</Mark>
      {text.slice(i + keyword.length)}
    </>
  );
}
