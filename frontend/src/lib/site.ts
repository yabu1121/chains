/**
 * サイト共通の定数。
 * LP の CTA は本体 chains アプリの登録画面へ送る（LP 自身は登録を受け付けない）。
 * デプロイ先が決まったら NEXT_PUBLIC_APP_URL を設定するか、ここを直接書き換える。
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://chains.app";
export const APP_REGISTER_URL = `${APP_URL}/register`;
