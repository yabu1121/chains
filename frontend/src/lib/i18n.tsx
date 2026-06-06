"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Supported UI languages. Japanese is the default (see I18nProvider).
export type Lang = "ja" | "en";

const STORAGE_KEY = "chains.lang";

// English dictionary. This is the *reference* shape: `type Dict = typeof en`,
// so the Japanese dictionary below must match it key-for-key (a missing or
// extra key is a compile error — that's our "did I forget to translate?" guard).
// Entries are usually strings, but a few are small functions when a value needs
// to interpolate a number or word.
const en = {
  common: {
    loading: "Loading…",
    back: "Back",
    cancel: "Cancel",
    close: "Close",
    remove: "Remove",
    addFriend: "Add friend",
    requested: "Requested",
    language: "Language",
    somethingWrong: "Something went wrong",
    couldNotSend: "Could not send request",
  },
  addFriendDialog: {
    title: "Send a friend request",
    to: (name: string) => `To ${name}`,
    commentLabel: "Comment (optional)",
    commentPlaceholder: "Add a hello or how you know each other…",
    chars: (n: number) => `${n}/150`,
    send: "Send request",
    sending: "Sending…",
  },
  legal: {
    terms: "Terms",
    privacy: "Privacy policy",
  },
  nav: {
    friends: "Friends",
    network: "Network",
    news: "News",
    settings: "Settings",
    logout: "Log out",
    viewProfile: "View your profile",
    comingSoon: "Coming soon",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    back: "Settings",
  },
  friendsTabs: {
    friends: "Friends",
    requests: "Requests",
    find: "Find",
  },
  settingsTabs: {
    profile: "Profile settings",
    changelog: "Changelog",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    language: "Language",
  },
  login: {
    eyebrow: "Friends only · invite-based",
    title: "Log in",
    email: "Email",
    password: "Password",
    submit: "Log in",
    submitting: "Logging in…",
    noAccount: "No account?",
    createOne: "Create one",
    or: "or",
    withGithub: "Continue with GitHub",
    withGoogle: "Continue with Google",
    oauthError: "Could not sign in with that provider. Please try again.",
  },
  register: {
    title: "Create account",
    displayName: "Display name",
    username: "Username (handle for others to find you)",
    usernamePlaceholder: "e.g. taro_yamada",
    email: "Email",
    password: "Password (min 8 characters)",
    submit: "Create account",
    submitting: "Creating…",
    haveAccount: "Already have an account?",
    login: "Log in",
    agreePre: "I have read and agree to the ",
    agreeTermsLink: "Terms",
    agreePost: ".",
    agreeError: "Please agree to the Terms before creating an account.",
  },
  friends: {
    yourFriends: "Your friends",
    allLanguages: "All languages",
    filterByLanguage: "Filter friends by language",
    noFriends: "No friends yet. Head to “Find people” to connect.",
    noFriendsLang: (lang: string) => `No friends use ${lang}.`,
    block: "Block",
    incomingRequests: "Incoming requests",
    noIncoming: "No incoming requests.",
    accept: "Accept",
    decline: "Decline",
    sentRequests: "Sent requests",
    noSent: "No pending sent requests.",
    pending: "Pending…",
  },
  bridge: {
    title: "You connected two circles",
    body: (a: number, b: number) =>
      `${a} on your side and ${b} on theirs are one network now.`,
  },
  find: {
    title: "Find people",
    searchPlaceholder: "Search by name or email",
    anyLanguage: "Any language",
    filterByLanguage: "Filter by language",
    search: "Search",
    noUsers: "No users found.",
    errTypeNameOrLang: "Type a name or pick a language",
    errMin2: "Type at least 2 characters",
    errSearchFailed: "Search failed",
  },
  qr: {
    title: "Your QR code",
    desc: "Have someone scan this with their camera to add you as a friend.",
    copied: "Copied ✓",
    copyLink: "Copy link",
  },
  profileModal: {
    couldNotLoad: "Could not load this profile.",
    editProfile: "Edit profile",
    thisIsYou: "This is you.",
    youAreFriends: "You are friends ✓",
  },
  profileView: {
    details: "Details",
    age: "Age",
    born: "Born",
    joined: "Joined",
    languages: "Languages",
    links: "Links",
    noLinks: "No links to show.",
  },
  network: {
    title: "Global network",
    highlightByLanguage: "Highlight by language",
    allLanguages: "All languages",
    legendYou: "You",
    legendFriends: "Friends",
    legendEveryone: "Everyone",
    legendPending: "Pending",
    couldNotLoad: "Could not load the network.",
    loading: "Loading the network…",
    empty: "No one is here yet.",
  },
  add: {
    notFound: "We couldn't find that person.",
    couldNotLoad: "Could not load this profile.",
    backToChains: "← Back to chains",
    ownCode: "This is your own code — open chains",
    alreadyFriends: "You are already friends ✓",
    requestSent: "Friend request sent ✓",
    backToChainsPlain: "Back to chains",
  },
  editor: {
    title: "Your profile",
    photo: "Photo",
    uploading: "Uploading…",
    changePhoto: "Change photo",
    displayName: "Display name",
    jobTitle: "Job title",
    jobPlaceholder: "Software Engineer",
    statusMessage: (n: number) => `Status message (${n}/100)`,
    statusPlaceholder: "What are you up to?",
    birthDate: "Birth date",
    showAge: "Show my age",
    showBirthDate: "Show my birth date",
    languagesLabel: "Languages (programming languages you've worked with)",
    addLanguage: "Add a language…",
    maxLanguages: "Maximum 30 languages",
    addLanguageAria: "Add a programming language",
    removeLang: (lang: string) => `Remove ${lang}`,
    linksVisibility: "Links & visibility",
    linksVisibilityDesc:
      "Choose who can see each link: everyone, friends only, or just you.",
    save: "Save profile",
    saving: "Saving…",
    saved: "Saved ✓",
    couldNotSave: "Could not save profile",
    imageTooBig: "Image must be 15MB or less",
    uploadFailed: "Upload failed",
    deleteFailed: "Delete failed",
    visEveryone: "Everyone",
    visFriends: "Friends only",
    visPrivate: "Only me",
    xHandle: "X handle (without @)",
    githubHandle: "GitHub handle",
    zennHandle: "Zenn handle",
    linkedinUrl: "LinkedIn URL",
    portfolioUrl: "Portfolio URL",
    linkVisibilityAria: (label: string) => `${label} visibility`,
    deleteAccount: "Delete account",
    deleteDesc:
      "Permanently delete your account and all associated data (profile, friendships, requests and avatar). This cannot be undone.",
    deleteMyAccount: "Delete my account",
    confirmPassword: "Confirm your password",
    permanentlyDelete: "Permanently delete",
    deleting: "Deleting…",
    couldNotDelete: "Could not delete account.",
  },
  cropper: {
    title: "Crop photo",
    desc: "Drag to reposition · slide to zoom. The circle shows your avatar.",
    usePhoto: "Use photo",
  },
};

// The dictionary shape, inferred from English. The Japanese object must satisfy it.
type Dict = typeof en;

const ja: Dict = {
  common: {
    loading: "読み込み中…",
    back: "戻る",
    cancel: "キャンセル",
    close: "閉じる",
    remove: "削除",
    addFriend: "フレンド申請",
    requested: "申請済み",
    language: "言語",
    somethingWrong: "エラーが発生しました",
    couldNotSend: "リクエストを送信できませんでした",
  },
  addFriendDialog: {
    title: "フレンド申請を送る",
    to: (name: string) => `${name} さんへ`,
    commentLabel: "コメント（任意）",
    commentPlaceholder: "ひとことや、どこで知り合ったかなど…",
    chars: (n: number) => `${n}/150`,
    send: "申請を送る",
    sending: "送信中…",
  },
  legal: {
    terms: "利用規約",
    privacy: "プライバシーポリシー",
  },
  nav: {
    friends: "フレンド",
    network: "ネットワーク",
    news: "ニュース",
    settings: "設定",
    logout: "ログアウト",
    viewProfile: "プロフィールを表示",
    comingSoon: "Coming soon",
    collapse: "サイドバーをとじる",
    expand: "サイドバーをひらく",
    back: "設定",
  },
  friendsTabs: {
    friends: "フレンド",
    requests: "リクエスト",
    find: "さがす",
  },
  settingsTabs: {
    profile: "プロフィール設定",
    changelog: "バージョン履歴",
    terms: "利用規約",
    privacy: "プライバシーポリシー",
    language: "言語設定",
  },
  login: {
    eyebrow: "友だち限定 · 招待制",
    title: "ログイン",
    email: "メールアドレス",
    password: "パスワード",
    submit: "ログイン",
    submitting: "ログイン中…",
    noAccount: "アカウントをお持ちでない方は",
    createOne: "新規登録",
    or: "または",
    withGithub: "GitHub で続ける",
    withGoogle: "Google で続ける",
    oauthError: "そのアカウントでのログインに失敗しました。もう一度お試しください。",
  },
  register: {
    title: "アカウント作成",
    displayName: "表示名",
    username: "ユーザー名（他の人があなたを見つけるためのID）",
    usernamePlaceholder: "例: taro_yamada",
    email: "メールアドレス",
    password: "パスワード（8文字以上）",
    submit: "アカウントを作成",
    submitting: "作成中…",
    haveAccount: "すでにアカウントをお持ちの方は",
    login: "ログイン",
    agreePre: "",
    agreeTermsLink: "利用規約",
    agreePost: "を読み、同意します。",
    agreeError: "アカウント作成の前に利用規約への同意が必要です。",
  },
  friends: {
    yourFriends: "フレンド",
    allLanguages: "すべての言語",
    filterByLanguage: "言語でフレンドを絞り込む",
    noFriends: "まだフレンドがいません。「さがす」から繋がりましょう。",
    noFriendsLang: (lang: string) => `${lang} を使うフレンドはいません。`,
    block: "ブロック",
    incomingRequests: "受信したリクエスト",
    noIncoming: "受信したリクエストはありません。",
    accept: "承認",
    decline: "拒否",
    sentRequests: "送信したリクエスト",
    noSent: "保留中の送信リクエストはありません。",
    pending: "保留中…",
  },
  bridge: {
    title: "2つの輪が、ひとつに",
    body: (a: number, b: number) =>
      `あなた側の${a}人と相手側の${b}人が、いま初めてつながりました。`,
  },
  find: {
    title: "人をさがす",
    searchPlaceholder: "名前またはメールで検索",
    anyLanguage: "すべての言語",
    filterByLanguage: "言語で絞り込む",
    search: "検索",
    noUsers: "ユーザーが見つかりませんでした。",
    errTypeNameOrLang: "名前を入力するか、言語を選んでください",
    errMin2: "2文字以上入力してください",
    errSearchFailed: "検索に失敗しました",
  },
  qr: {
    title: "あなたのQRコード",
    desc: "カメラで読み取ってもらうと、フレンド申請ができます。",
    copied: "コピーしました ✓",
    copyLink: "リンクをコピー",
  },
  profileModal: {
    couldNotLoad: "プロフィールを読み込めませんでした。",
    editProfile: "プロフィールを編集",
    thisIsYou: "これはあなたです。",
    youAreFriends: "フレンドです ✓",
  },
  profileView: {
    details: "詳細",
    age: "年齢",
    born: "生年月日",
    joined: "登録日",
    languages: "言語",
    links: "リンク",
    noLinks: "表示するリンクはありません。",
  },
  network: {
    title: "グローバルネットワーク",
    highlightByLanguage: "言語でハイライト",
    allLanguages: "すべての言語",
    legendYou: "あなた",
    legendFriends: "フレンド",
    legendEveryone: "全員",
    legendPending: "保留中",
    couldNotLoad: "ネットワークを読み込めませんでした。",
    loading: "ネットワークを読み込み中…",
    empty: "まだ誰もいません。",
  },
  add: {
    notFound: "その人が見つかりませんでした。",
    couldNotLoad: "このプロフィールを読み込めませんでした。",
    backToChains: "← chains に戻る",
    ownCode: "これはあなた自身のコードです — chains を開く",
    alreadyFriends: "すでにフレンドです ✓",
    requestSent: "フレンド申請を送信しました ✓",
    backToChainsPlain: "chains に戻る",
  },
  editor: {
    title: "プロフィール",
    photo: "写真",
    uploading: "アップロード中…",
    changePhoto: "写真を変更",
    displayName: "表示名",
    jobTitle: "職種",
    jobPlaceholder: "ソフトウェアエンジニア",
    statusMessage: (n: number) => `ひとこと（${n}/100）`,
    statusPlaceholder: "いま何してる？",
    birthDate: "生年月日",
    showAge: "年齢を公開する",
    showBirthDate: "生年月日を公開する",
    languagesLabel: "言語（使ったことのあるプログラミング言語）",
    addLanguage: "言語を追加…",
    maxLanguages: "最大30言語まで",
    addLanguageAria: "プログラミング言語を追加",
    removeLang: (lang: string) => `${lang} を削除`,
    linksVisibility: "リンクと公開範囲",
    linksVisibilityDesc:
      "各リンクを誰に見せるか選べます：全員 / フレンドのみ / 自分のみ。",
    save: "プロフィールを保存",
    saving: "保存中…",
    saved: "保存しました ✓",
    couldNotSave: "プロフィールを保存できませんでした",
    imageTooBig: "画像は15MBまでにしてください",
    uploadFailed: "アップロードに失敗しました",
    deleteFailed: "削除に失敗しました",
    visEveryone: "全員",
    visFriends: "フレンドのみ",
    visPrivate: "自分のみ",
    xHandle: "X のユーザー名（@なし）",
    githubHandle: "GitHub のユーザー名",
    zennHandle: "Zenn のユーザー名",
    linkedinUrl: "LinkedIn の URL",
    portfolioUrl: "ポートフォリオの URL",
    linkVisibilityAria: (label: string) => `${label} の公開範囲`,
    deleteAccount: "アカウントを削除",
    deleteDesc:
      "アカウントと、それに紐づくすべてのデータ（プロフィール・フレンド・リクエスト・アイコン）を完全に削除します。この操作は取り消せません。",
    deleteMyAccount: "アカウントを削除する",
    confirmPassword: "パスワードを確認",
    permanentlyDelete: "完全に削除",
    deleting: "削除中…",
    couldNotDelete: "アカウントを削除できませんでした。",
  },
  cropper: {
    title: "写真を切り抜く",
    desc: "ドラッグで移動・スライドで拡大。円の中がアイコンになります。",
    usePhoto: "この写真を使う",
  },
};

const DICTS: Record<Lang, Dict> = { en, ja };

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start as the default (Japanese) on both the server and the first client
  // render so the markup matches and React doesn't warn about a hydration
  // mismatch. We then read the saved choice from localStorage in an effect.
  const [lang, setLangState] = useState<Lang>("ja");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ja" || saved === "en") setLangState(saved);
  }, []);

  // Keep <html lang> in sync for accessibility and correct font/hyphenation.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage may be unavailable (private mode); ignore */
    }
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t: DICTS[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Access the current language, a setter, and the active dictionary `t`. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
