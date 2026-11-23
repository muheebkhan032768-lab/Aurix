/**
 * Central website command registry.
 *
 * Every website DEX MADE can open by voice lives here — one place to add a site,
 * change a URL or add a spoken alias. The voice command parser reads this list,
 * so adding an entry is enough to make a new site voice-accessible.
 *
 * Keep URLs exactly as supplied by the owner. Never invent a URL: use
 * `placeholder: true` with `url: null` until the real link is provided.
 */

export type WebsiteCategory = "social" | "work" | "business" | "tools" | "learning" | "media";

export interface WebsiteAccount {
  label: string;
  url: string;
  note?: string;
}

export interface WebsiteEntry {
  id: string;
  name: string;
  /** null means the owner has not supplied the link yet (see `placeholder`). */
  url: string | null;
  /** Full spoken phrases that map to this site. */
  commands: string[];
  /** Short words that map to this site when combined with an opening verb. */
  keywords: string[];
  category: WebsiteCategory;
  action: "open_new_tab";
  accounts?: WebsiteAccount[];
  authNote?: string;
  placeholder?: boolean;
}

export const WEBSITE_REGISTRY: WebsiteEntry[] = [
  {
    id: "facebook",
    name: "Facebook",
    url: "https://www.facebook.com/",
    commands: [
      "open my facebook",
      "open facebook",
      "launch facebook",
      "access facebook",
      "facebook kholo",
      "facebook on karo",
    ],
    keywords: ["facebook", "fb"],
    category: "social",
    action: "open_new_tab",
    accounts: [
      {
        label: "Website Developer",
        url: "https://www.facebook.com/",
        note: "Opens the shared Facebook URL; use the signed-in Chrome profile for this account.",
      },
      {
        label: "Abdul Muheeb",
        url: "https://www.facebook.com/",
        note: "Opens the shared Facebook URL; use the signed-in Chrome profile for this account.",
      },
    ],
    authNote:
      "Only one Facebook URL is configured. Sign in to the right account in Chrome; DEX MADE never asks for or stores the password.",
  },
  {
    id: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com/",
    commands: [
      "open instagram",
      "launch instagram",
      "access instagram",
      "open my instagram account",
      "open my instagram",
      "instagram kholo",
      "instagram on karo",
    ],
    keywords: ["instagram", "insta", "ig"],
    category: "social",
    action: "open_new_tab",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    url: "https://www.linkedin.com/mynetwork/grow/",
    commands: [
      "open linkedin",
      "launch linkedin",
      "open my linkedin account",
      "open my linkedin",
      "linkedin kholo",
    ],
    keywords: ["linkedin"],
    category: "work",
    action: "open_new_tab",
  },
  {
    id: "tiktok",
    name: "TikTok",
    url: "https://www.tiktok.com/foryou?lang=en",
    commands: ["open tiktok", "launch tiktok", "access tiktok", "open my tiktok", "tiktok kholo"],
    keywords: ["tiktok"],
    category: "social",
    action: "open_new_tab",
  },
  {
    id: "daraz",
    name: "Daraz",
    url: "https://www.daraz.pk/#?",
    commands: ["open daraz", "launch daraz", "access daraz", "open my daraz", "daraz kholo"],
    keywords: ["daraz"],
    category: "business",
    action: "open_new_tab",
  },
  {
    id: "messenger",
    name: "Facebook Messenger",
    url: "https://www.messenger.com/",
    commands: [
      "open messenger",
      "launch facebook messenger",
      "open facebook messenger",
      "open my messages",
      "messenger kholo",
    ],
    keywords: ["messenger", "my messages"],
    category: "social",
    action: "open_new_tab",
  },
  {
    id: "fiverr-gigs",
    name: "Fiverr Gigs",
    url: "https://www.fiverr.com/users/muheebkhan897/manage_gigs",
    commands: [
      "open my fiverr gigs",
      "open fiverr gig management",
      "manage my fiverr gigs",
      "open my fiverr",
      "fiverr gigs kholo",
    ],
    keywords: ["fiverr gigs", "fiverr gig", "fiverr gig management", "gig management"],
    category: "work",
    action: "open_new_tab",
  },
  {
    id: "fiverr-profile",
    name: "Fiverr Seller Profile",
    url: "https://www.fiverr.com/sellers/muheebkhan897/edit",
    commands: [
      "open my fiverr profile",
      "open my seller profile",
      "edit my fiverr profile",
      "open fiverr seller profile",
    ],
    keywords: ["fiverr profile", "seller profile", "fiverr seller profile"],
    category: "work",
    action: "open_new_tab",
  },
  {
    id: "adsterra",
    name: "Adsterra Publisher Dashboard",
    url: "https://beta.publishers.adsterra.com/websites",
    commands: [
      "open adsterra",
      "open my adsterra dashboard",
      "open my publisher account",
      "open my adsterra publisher account",
    ],
    keywords: ["adsterra", "publisher dashboard", "publisher account"],
    category: "business",
    action: "open_new_tab",
  },
  {
    id: "meta-business",
    name: "Meta Business Suite",
    url: "https://business.facebook.com/latest/home?business_id=1110347994869325&asset_id=1265518616654327",
    commands: [
      "open meta business suite",
      "open my meta business dashboard",
      "open my business suite",
      "open meta business",
    ],
    keywords: ["meta business", "business suite", "meta business suite"],
    category: "business",
    action: "open_new_tab",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    commands: ["open chatgpt", "launch chatgpt", "open my ai chatgpt", "chatgpt kholo"],
    keywords: ["chatgpt", "chat gpt"],
    category: "tools",
    action: "open_new_tab",
  },
  {
    id: "google",
    name: "Google",
    url: "https://www.google.com",
    commands: ["open google", "launch google", "google kholo", "google on karo"],
    keywords: ["google", "google search"],
    category: "tools",
    action: "open_new_tab",
  },
  {
    id: "gmail",
    name: "Gmail",
    url: "https://mail.google.com",
    commands: ["open gmail", "open my gmail", "open my email", "open my inbox", "gmail kholo"],
    keywords: ["gmail", "my email", "my inbox"],
    category: "work",
    action: "open_new_tab",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Web",
    url: "https://web.whatsapp.com",
    commands: ["open whatsapp", "open whatsapp web", "whatsapp kholo"],
    keywords: ["whatsapp", "whats app"],
    category: "social",
    action: "open_new_tab",
  },
  {
    id: "am-nexora",
    name: "AM Nexora",
    url: "https://am-nexora.wasmer.app/",
    commands: [
      "open am nexora",
      "launch my ai tools website",
      "open my ai tools platform",
      "open my am website",
      "open am nexora website",
    ],
    keywords: ["am nexora", "nexora", "ai tools website", "ai tools platform"],
    category: "tools",
    action: "open_new_tab",
  },
  {
    id: "github",
    name: "GitHub",
    url: "https://github.com/",
    commands: ["open github", "launch github", "open my coding platform", "open my github"],
    keywords: ["github", "coding platform"],
    category: "work",
    action: "open_new_tab",
  },
  {
    id: "ais-portal",
    name: "College AIS Portal",
    url: "https://student.apms.pk/",
    commands: ["open my ais portal", "open my college portal", "launch ais", "open ais portal"],
    keywords: ["ais portal", "college portal", "ais"],
    category: "learning",
    action: "open_new_tab",
  },
  {
    id: "youtube",
    name: "YouTube",
    url: "https://www.youtube.com",
    commands: ["open youtube", "launch youtube", "youtube kholo", "youtube on karo"],
    keywords: ["youtube"],
    category: "media",
    action: "open_new_tab",
  },
  {
    id: "youtube-favourite",
    name: "My Favourite Song",
    url: "https://www.youtube.com/watch?v=TCQ7ijIUskk&list=RDTCQ7ijIUskk&start_radio=1",
    commands: [
      "play my favourite song",
      "play my favorite song",
      "play my favourite music",
      "play my favorite music",
      "my favourite song",
      "my favorite song",
    ],
    keywords: ["favourite song", "favorite song", "favourite music", "favorite music"],
    category: "media",
    action: "open_new_tab",
    authNote:
      "Playback may need a click on the YouTube tab — browsers block autoplay until the user interacts.",
  },
  {
    id: "youtube-channel",
    name: "My YouTube Channel",
    url: "https://www.youtube.com/@MuheebWebStudio",
    commands: ["open my youtube channel", "open youtube channel", "my youtube channel"],
    keywords: ["youtube channel", "my channel"],
    category: "media",
    action: "open_new_tab",
  },
  // Placeholders — the owner will supply these links. Never invent a URL.
  {
    id: "business-registration-pakistan",
    name: "Pakistan Business Registration",
    url: null,
    commands: [
      "open pakistan business registration",
      "register my company in pakistan",
      "open my pakistan company registration",
    ],
    keywords: ["pakistan business registration", "pakistan company registration"],
    category: "business",
    action: "open_new_tab",
    placeholder: true,
    authNote: "URL not supplied yet. Add it to src/utils/websiteRegistry.ts.",
  },
  {
    id: "business-registration-texas",
    name: "Texas Company Registration",
    url: null,
    commands: [
      "open texas company registration",
      "register my company in texas",
      "open my texas company registration",
    ],
    keywords: ["texas company registration", "texas business registration"],
    category: "business",
    action: "open_new_tab",
    placeholder: true,
    authNote: "URL not supplied yet. Add it to src/utils/websiteRegistry.ts.",
  },
];

/** Intents that must win over the generic keyword match. */
const SPECIAL_COMMANDS: Array<{ id: string; pattern: RegExp }> = [
  { id: "youtube-favourite", pattern: /\b(favou?rite (song|music)|play my favou?rite)\b/i },
  { id: "youtube-channel", pattern: /\b(youtube channel|my channel)\b/i },
  { id: "fiverr-profile", pattern: /\b(fiverr profile|seller profile)\b/i },
  { id: "fiverr-gigs", pattern: /\b(fiverr gigs?|gig management|manage_gigs)\b/i },
];

const OPENING_VERB =
  /\b(open|launch|access|start|go to|goto|show|bring up|take me to|kholo|khol|karo|on karo|manage|edit)\b/i;

const ACCOUNT_HINTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Website Developer", pattern: /\b(website developer|developer account|dev account)\b/i },
  { label: "Abdul Muheeb", pattern: /\b(abdul|muheeb|personal account)\b/i },
];

export interface WebsiteMatch {
  entry: WebsiteEntry;
  account?: WebsiteAccount;
  needsAccount: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findByAccountText(entry: WebsiteEntry, text: string): WebsiteAccount | undefined {
  if (!entry.accounts?.length) return undefined;
  const hinted = ACCOUNT_HINTS.find((hint) => hint.pattern.test(text))?.label;
  if (!hinted) return undefined;
  return entry.accounts.find((account) => account.label === hinted);
}

/** Resolves a spoken account name (e.g. "Abdul Muheeb") for a pending site. */
export function resolveAccountFromText(entry: WebsiteEntry, raw: string): WebsiteAccount | undefined {
  return findByAccountText(entry, normalize(raw));
}

/**
 * Matches a spoken/typed phrase against the registry.
 * Returns null when the phrase is not a website-opening command.
 */
export function matchWebsiteCommand(raw: string): WebsiteMatch | null {
  const text = normalize(raw);
  if (!text) return null;

  for (const special of SPECIAL_COMMANDS) {
    if (special.pattern.test(text)) {
      const entry = WEBSITE_REGISTRY.find((item) => item.id === special.id);
      if (entry) return { entry, account: findByAccountText(entry, text), needsAccount: false };
    }
  }

  const hasVerb = OPENING_VERB.test(text);
  let best: { entry: WebsiteEntry; score: number } | null = null;

  for (const entry of WEBSITE_REGISTRY) {
    for (const command of entry.commands) {
      const phrase = normalize(command);
      if (text === phrase || text.includes(phrase)) {
        const score = 1000 + phrase.length;
        if (!best || score > best.score) best = { entry, score };
      }
    }
    if (!hasVerb) continue;
    for (const keyword of entry.keywords) {
      if (new RegExp(`\\b${escapeRegExp(normalize(keyword))}\\b`).test(text)) {
        const score = normalize(keyword).length;
        if (!best || score > best.score) best = { entry, score };
      }
    }
  }

  if (!best) return null;
  const account = findByAccountText(best.entry, text);
  return {
    entry: best.entry,
    account,
    needsAccount: !account && (best.entry.accounts?.length ?? 0) > 0,
  };
}

/**
 * Opens a URL in a new tab and reports whether the browser allowed it.
 * The handle is opened first so a blocked popup can be detected; `noopener`
 * is applied by hand because passing it in the feature string returns null.
 */
export function openInNewTab(url: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    // Cross-origin about:blank in some browsers — navigation below still works.
  }
  win.location.href = url;
  return true;
}
