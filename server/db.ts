import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { WEBSITE_REGISTRY } from "../src/utils/websiteRegistry";
import { normalizeHttpUrl } from "./linkValidation";
import type {
  AppSettings,
  AuditLogEntry,
  BusinessItem,
  ChatMessage,
  CompanyProfile,
  ConversationSummary,
  DesktopActionLog,
  MemoryItem,
  NoteItem,
  OwnerProfile,
  ProjectRecord,
  SavedLink,
  SavedLinkInput,
  SecurityStatus,
  SelfHealHistoryEntry,
  TaskItem,
  WebsiteRecord,
} from "../src/types/aurix";

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "aurix.db");
export const db = new DatabaseSync(DB_PATH);

/** Voice hotkeys are stored as key combinations, e.g. "Control+Shift+Space". */
export const DEFAULT_VOICE_SHORTCUTS: AppSettings["voiceShortcuts"] = {
  pushToTalk: "Space",
  cancel: "Escape",
  continuous: "Control+Space",
  activate: "Control+Shift+Space",
  mute: "Control+M",
};

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS websites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL,
    active_domain TEXT NOT NULL,
    domains_json TEXT NOT NULL,
    hosting_json TEXT NOT NULL,
    stack_json TEXT NOT NULL,
    files_json TEXT NOT NULL,
    features_json TEXT NOT NULL,
    pages TEXT NOT NULL,
    database_notes TEXT NOT NULL,
    api_integrations TEXT NOT NULL,
    deployment_history TEXT NOT NULL,
    known_bugs TEXT NOT NULL,
    pending_tasks TEXT NOT NULL,
    security_notes TEXT NOT NULL,
    future_improvements TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL,
    stack_json TEXT NOT NULL,
    location_or_url TEXT NOT NULL,
    known_bugs TEXT NOT NULL,
    pending_tasks TEXT NOT NULL,
    security_notes TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    project_scope TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    model TEXT NOT NULL,
    language TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    language TEXT,
    thinking_level TEXT,
    sources_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS business_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    client_name TEXT NOT NULL,
    status TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    details TEXT NOT NULL,
    verified_entry INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    due_date TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS security_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash TEXT,
    pin_salt TEXT,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    inactivity_minutes INTEGER NOT NULL DEFAULT 15,
    require_pin_on_boot INTEGER NOT NULL DEFAULT 0,
    windows_hello_status TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    detail TEXT NOT NULL,
    severity TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS desktop_actions (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    executed_in TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS self_heal_history (
    id TEXT PRIMARY KEY,
    overall_status TEXT NOT NULL,
    detected_count INTEGER NOT NULL DEFAULT 0,
    repaired_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saved_links (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Other',
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    is_favourite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// A URL can only be saved once. Created separately so an older database that
// somehow already holds a duplicate cannot stop the app from booting.
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_links_url ON saved_links (url COLLATE NOCASE)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_saved_links_created ON saved_links (created_at DESC)`);
} catch (error) {
  console.warn("[DEX MADE Link Vault] Could not create the saved_links indexes:", error);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function addAuditLog(
  eventType: string,
  actor: string,
  detail: string,
  severity: "info" | "warning" | "security" = "info"
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: uid("aud"),
    eventType,
    actor,
    detail,
    severity,
    createdAt: nowIso(),
  };
  db.prepare(
    `INSERT INTO audit_logs (id, event_type, actor, detail, severity, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(entry.id, entry.eventType, entry.actor, entry.detail, entry.severity, entry.createdAt);
  return entry;
}

function seedInitialData(): void {
  const ts = nowIso();

  const existingOwner = db.prepare(`SELECT value FROM kv_store WHERE key = 'owner_profile'`).get();
  if (!existingOwner) {
    const owner: OwnerProfile = {
      name: "Abdul Muheeb",
      role: "Founder & Software Developer",
      company: "AM VEYRONIX",
      background: [
        "Web development",
        "HTML, CSS and JavaScript knowledge",
        "Python development interests",
        "WordPress development",
        "Graphic design",
        "Website optimization",
        "AI integration",
        "Freelancing",
        "Business development",
      ],
      programmingSkills: ["HTML5", "CSS3", "JavaScript", "Python", "WordPress", "Node.js / Express"],
      designSkills: ["Graphic Design", "UI/UX Layout", "Brand Identity", "Responsive Web Design"],
      businessGoals: [
        "Establish AM VEYRONIX as a trusted technology, web, AI, and creative solutions company",
        "Deliver production client websites, e-commerce platforms, and AI integrations",
        "Build internal AM VEYRONIX digital products and tools",
      ],
      learningGoals: [
        "Advanced Python AI orchestration and machine learning",
        "C# .NET WPF native Windows desktop architecture",
        "Backend API security and scalable database engineering",
      ],
      preferences:
        "Prefers clear, calm, respectful, engineering-first answers; strict separation between project records; zero invented metrics.",
      ongoingTasks: [
        "Finalize active domain & Cloudflare configuration for AM NEXORA",
        "Expand AM DIGITAL HUB backend chat and admin workflows",
        "Architect AM VEYRONIX TEAM CONNECT registration-based messaging",
      ],
      updatedAt: ts,
    };
    db.prepare(`INSERT INTO kv_store (key, value, updated_at) VALUES ('owner_profile', ?, ?)`).run(
      JSON.stringify(owner),
      ts
    );
  }

  const existingCompany = db.prepare(`SELECT value FROM kv_store WHERE key = 'company_profile'`).get();
  if (!existingCompany) {
    const company: CompanyProfile = {
      name: "AM VEYRONIX",
      founder: "Abdul Muheeb",
      vision:
        "Build a professional technology company focused on digital solutions, software, websites, AI and creative services.",
      services: [
        "Website development",
        "WordPress development",
        "Custom frontend development",
        "E-commerce websites",
        "Website redesign",
        "Website optimization",
        "AI integration",
        "Graphic design",
        "Digital creative services",
      ],
      strategy:
        "Deliver high-craft websites and custom digital solutions while building internal AI tooling and directory products under AM VEYRONIX.",
      marketingPlan: "Document verified client case studies, showcase AM NEXORA, and offer clear service packages.",
      hiringPlan: "To be defined by founder Abdul Muheeb as verified client demand grows.",
      futureProducts: ["DEX MADE 2.0 Desktop AI Suite", "AM VEYRONIX Official Platform", "AM VEYRONIX TEAM CONNECT"],
      documents: [],
      updatedAt: ts,
    };
    db.prepare(`INSERT INTO kv_store (key, value, updated_at) VALUES ('company_profile', ?, ?)`).run(
      JSON.stringify(company),
      ts
    );
  }

  const DEFAULT_SETTINGS: AppSettings = {
    voiceName: "Charon",
    voiceShortcuts: { ...DEFAULT_VOICE_SHORTCUTS },
    voiceSpeed: 1.0,
    voicePitch: 1.0,
    voiceVolume: 2.0,
    language: "English",
    autoDetectLanguage: false,
    wakePhrase: "Hello Dex Made",
    voiceEnabled: true,
    micEnabled: true,
    pushToTalk: true,
    handsFreeVadEnabled: false,
    vadSensitivity: 60,
    micSensitivity: 65,
    theme: "light",
    activeModel: "gemini-4-hydrogen",
    thinkingLevel: "MEDIUM",
    performanceMode: "auto",
    offlineModeForced: false,
    cameraEnabled: true,
    lightweightAnimations: false,
    autoHealEnabled: true,
    autoLockEnabled: true,
    notificationsEnabled: true,
    startupBehavior: "Open Command Dashboard",
    startupAnimationEnabled: true,
    startupDurationSeconds: 8,
    startupSoundEnabled: true,
    startupSoundVolume: 70,
    autoVoiceGreetingEnabled: true,
    greetingLanguage: "English",
    greetingVolume: 85,
    autoStartEnabled: false,
    proactiveTalkEnabled: true,
    proactiveIntervalSeconds: 20,
    doNotDisturb: false,
    quietHoursEnabled: false,
    quietHoursStart: "23:00",
    quietHoursEnd: "07:00",
  };

  const existingSettings = db.prepare(`SELECT value FROM kv_store WHERE key = 'app_settings'`).get() as
    | { value: string }
    | undefined;
  if (!existingSettings) {
    db.prepare(`INSERT INTO kv_store (key, value, updated_at) VALUES ('app_settings', ?, ?)`).run(
      JSON.stringify(DEFAULT_SETTINGS),
      ts
    );
    db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('bright_ui_v2_migrated', '1', ?)`).run(ts);
  } else {
    const migrated = db.prepare(`SELECT value FROM kv_store WHERE key = 'bright_ui_v2_migrated'`).get();
    if (!migrated) {
      const parsed = JSON.parse(existingSettings.value) as Partial<AppSettings>;
      const upgraded: AppSettings = { ...DEFAULT_SETTINGS, ...parsed, theme: "light" };
      db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('app_settings', ?, ?)`).run(
        JSON.stringify(upgraded),
        ts
      );
      db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('bright_ui_v2_migrated', '1', ?)`).run(ts);
    }
  }

  const websiteCount = db.prepare(`SELECT COUNT(*) as cnt FROM websites`).get() as { cnt: number };
  if (websiteCount.cnt === 0) {
    const websites: WebsiteRecord[] = [
      {
        id: "web_am_nexora",
        name: "AM NEXORA",
        tagline: "Discover Smarter AI & Digital Tools",
        purpose: "AI and digital tools directory.",
        status: "active",
        activeDomain: "am-noxera-2510.infy.click",
        domains: ["am-noxera-123.ct.ws", "am-noxera-2510.infy.click"],
        hostingProviders: ["InfinityFree", "Netlify"],
        stack: ["HTML5", "CSS3", "Vanilla JavaScript"],
        files: ["index.html", "styles.css", "app.js"],
        features: [
          "AM branding",
          "AI tools directory",
          "Theme changer",
          "Responsive interface",
          "Search and categorization",
          "LocalStorage preferences",
          "Functional navigation",
          "Tool listings & meaningful CTAs",
          "Frontend-only and backend-powered feature labels",
        ],
        pages: "Directory Home, Categories, Tool Details, Theme Preferences",
        databaseNotes: "Client-side LocalStorage preferences; backend-powered labels distinguished cleanly.",
        apiIntegrations: "Cloudflare DNS & SSL setup under exploration.",
        deploymentHistory: "Explored InfinityFree (am-noxera-123.ct.ws, am-noxera-2510.infy.click) and Netlify.",
        knownBugs: "Verify active domain canonical URL and DNS propagation after Cloudflare setup.",
        pendingTasks: "Confirm primary production domain and finalize Cloudflare proxy settings.",
        securityNotes: "Enforce HTTPS via Cloudflare SSL and sanitize directory search inputs.",
        futureImprovements: "Add verified user submissions and backend search indexing.",
        updatedAt: ts,
      },
      {
        id: "web_am_digital_hub",
        name: "AM DIGITAL HUB",
        tagline: "Personal Communication & Freelance Business Hub",
        purpose: "Personal communication and freelance business website.",
        status: "active",
        activeDomain: "",
        domains: [],
        hostingProviders: ["Node.js Host (Planned)"],
        stack: ["HTML5", "CSS3", "JavaScript", "Node.js", "Express", "Supabase (Explored)"],
        files: ["index.html", "server.js", "admin.html"],
        features: [
          "Business presentation",
          "Direct communication",
          "Direct chat with the owner",
          "Contact form",
          "Admin interface",
          "Frontend and backend integration",
        ],
        pages: "index.html (Public Hub), admin.html (Owner Admin Console)",
        databaseNotes: "Supabase explored for persistent message & contact storage.",
        apiIntegrations: "Express backend API endpoints connecting frontend chat and admin panel.",
        deploymentHistory: "Core file architecture created (index.html, server.js, admin.html).",
        knownBugs: "Admin authentication hardening required before public launch.",
        pendingTasks: "Finalize Supabase persistence schema and deploy server.js.",
        securityNotes: "Protect admin.html routes with strict authentication and CSRF/rate limits.",
        futureImprovements: "Real-time notifications for incoming client inquiries.",
        updatedAt: ts,
      },
      {
        id: "web_am_team_connect",
        name: "AM VEYRONIX TEAM CONNECT",
        tagline: "Private Company Communication Platform",
        purpose: "Private company communication platform for AM VEYRONIX team members and owner.",
        status: "planned",
        activeDomain: "",
        domains: [],
        hostingProviders: [],
        stack: ["Web Frontend (Light Interface)", "Backend Auth & Messaging"],
        files: [],
        features: [
          "Company member registration",
          "Member-to-member communication",
          "Member-to-owner communication",
          "Desktop and mobile responsive support",
          "Light interface preference",
          "Registration-based access control",
        ],
        pages: "Registration / Login, Team Channels, Direct Messages to Founder",
        databaseNotes: "Requires authenticated user directory and encrypted message store.",
        apiIntegrations: "Role-verified messaging API.",
        deploymentHistory: "Specifications defined; awaiting build phase.",
        knownBugs: "",
        pendingTasks: "Design registration approval flow and light-mode UI specification.",
        securityNotes: "Strict registration-based access; only approved AM VEYRONIX members permitted.",
        futureImprovements: "File sharing and project channel scoping.",
        updatedAt: ts,
      },
      {
        id: "web_am_veyronix_main",
        name: "AM VEYRONIX Main Company Website",
        tagline: "Official AM VEYRONIX Digital Flagship",
        purpose: "Official company website presenting AM VEYRONIX services, vision, and client onboarding.",
        status: "planned",
        activeDomain: "",
        domains: [],
        hostingProviders: [],
        stack: [],
        files: [],
        features: [
          "Company identity & vision showcase",
          "Service catalog (Web, WordPress, E-commerce, AI, Design)",
          "Client inquiry workflow",
        ],
        pages: "Home, Services, Portfolio, About Abdul Muheeb, Contact",
        databaseNotes: "Not yet configured by owner.",
        apiIntegrations: "Not yet configured by owner.",
        deploymentHistory: "Record initialized; awaiting owner domain & hosting selection.",
        knownBugs: "",
        pendingTasks: "Owner to specify domain, hosting provider, and approved portfolio entries.",
        securityNotes: "Enforce TLS, CSP headers, and spam-protected contact submission.",
        futureImprovements: "Client portal integration.",
        updatedAt: ts,
      },
    ];

    const insertWeb = db.prepare(`
      INSERT INTO websites (
        id, name, tagline, purpose, status, active_domain, domains_json, hosting_json,
        stack_json, files_json, features_json, pages, database_notes, api_integrations,
        deployment_history, known_bugs, pending_tasks, security_notes, future_improvements, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const w of websites) {
      insertWeb.run(
        w.id,
        w.name,
        w.tagline,
        w.purpose,
        w.status,
        w.activeDomain,
        JSON.stringify(w.domains),
        JSON.stringify(w.hostingProviders),
        JSON.stringify(w.stack),
        JSON.stringify(w.files),
        JSON.stringify(w.features),
        w.pages,
        w.databaseNotes,
        w.apiIntegrations,
        w.deploymentHistory,
        w.knownBugs,
        w.pendingTasks,
        w.securityNotes,
        w.futureImprovements,
        w.updatedAt
      );
    }
  }

  const projectCount = db.prepare(`SELECT COUNT(*) as cnt FROM projects`).get() as { cnt: number };
  if (projectCount.cnt === 0) {
    const projects: ProjectRecord[] = [
      {
        id: "prj_aurix_ecosystem",
        name: "DEX MADE 2.0 Command Ecosystem",
        category: "AI Desktop & Web Platform",
        description:
          "Personal AI command center for Abdul Muheeb integrating Gemini 4 intelligence, voice synthesis, memory isolation, and native Windows 10/11 Python/C# WPF architecture.",
        status: "active",
        progress: 82,
        stack: ["TypeScript", "React", "Express", "SQLite", "Python", "C# .NET 8 WPF"],
        locationOrUrl: "Workspace + /native-windows",
        knownBugs: "Native Windows .exe compilation requires local Windows 10/11 SDK build.",
        pendingTasks: "Compile native WPF shell on Windows machine and verify Windows Hello hardware.",
        securityNotes: "scrypt/Argon2id PIN hashing, attempt lockouts, server-side AI credentials.",
        updatedAt: ts,
      },
      {
        id: "prj_am_nexora",
        name: "AM NEXORA Directory",
        category: "Web Product",
        description: "Curated AI and digital tools directory with theme switching and categorization.",
        status: "active",
        progress: 75,
        stack: ["HTML5", "CSS3", "Vanilla JS", "Cloudflare"],
        locationOrUrl: "am-noxera-2510.infy.click",
        knownBugs: "Dual InfinityFree domains need canonical redirect consolidation.",
        pendingTasks: "Complete Cloudflare SSL & active domain verification.",
        securityNotes: "Static frontend with LocalStorage preferences.",
        updatedAt: ts,
      },
      {
        id: "prj_am_digital_hub",
        name: "AM DIGITAL HUB",
        category: "Freelance Platform",
        description: "Direct owner communication, contact intake, and admin portal.",
        status: "active",
        progress: 65,
        stack: ["HTML5", "Express (server.js)", "Supabase"],
        locationOrUrl: "index.html / server.js / admin.html",
        knownBugs: "Admin login session protection pending completion.",
        pendingTasks: "Connect Supabase message store and deploy.",
        securityNotes: "Requires server-side admin verification.",
        updatedAt: ts,
      },
      {
        id: "prj_team_connect",
        name: "AM VEYRONIX TEAM CONNECT",
        category: "Internal Communications",
        description: "Private registration-based team and founder chat platform with light UI.",
        status: "planned",
        progress: 20,
        stack: ["Light Web UI", "Auth & Messaging API"],
        locationOrUrl: "Specification Phase",
        knownBugs: "",
        pendingTasks: "Implement invite/registration approval workflow.",
        securityNotes: "Closed access for verified AM VEYRONIX members only.",
        updatedAt: ts,
      },
    ];
    const insertProj = db.prepare(`
      INSERT INTO projects (
        id, name, category, description, status, progress, stack_json, location_or_url,
        known_bugs, pending_tasks, security_notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of projects) {
      insertProj.run(
        p.id,
        p.name,
        p.category,
        p.description,
        p.status,
        p.progress,
        JSON.stringify(p.stack),
        p.locationOrUrl,
        p.knownBugs,
        p.pendingTasks,
        p.securityNotes,
        p.updatedAt
      );
    }
  }

  const memCount = db.prepare(`SELECT COUNT(*) as cnt FROM memories`).get() as { cnt: number };
  if (memCount.cnt === 0) {
    const memories: MemoryItem[] = [
      {
        id: "mem_owner_core",
        category: "Owner Profile",
        title: "Primary Owner Identity — Abdul Muheeb",
        content:
          "Abdul Muheeb is the creator of DEX MADE and founder of AM VEYRONIX. Expertise spans web development, HTML/CSS/JS, Python interests, WordPress, graphic design, website optimization, AI integration, freelancing, and business development.",
        source: "Owner Initialization",
        projectScope: "Global",
        approved: true,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: "mem_nexora_scope",
        category: "Website Project",
        title: "AM NEXORA Technical Separation",
        content:
          "AM NEXORA is an HTML5/CSS3/vanilla JS AI tools directory ('Discover Smarter AI & Digital Tools') with domains am-noxera-123.ct.ws and am-noxera-2510.infy.click. Do not merge its files or stack with AM DIGITAL HUB (server.js / admin.html).",
        source: "Website Registry",
        projectScope: "AM NEXORA",
        approved: true,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: "mem_digital_hub_scope",
        category: "Website Project",
        title: "AM DIGITAL HUB Architecture",
        content:
          "AM DIGITAL HUB uses index.html, server.js, and admin.html with Supabase explored for database persistence, focused on direct client-to-owner chat and freelance business presentation.",
        source: "Website Registry",
        projectScope: "AM DIGITAL HUB",
        approved: true,
        createdAt: ts,
        updatedAt: ts,
      },
    ];
    const insertMem = db.prepare(`
      INSERT INTO memories (id, category, title, content, source, project_scope, approved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of memories) {
      insertMem.run(
        m.id,
        m.category,
        m.title,
        m.content,
        m.source,
        m.projectScope,
        m.approved ? 1 : 0,
        m.createdAt,
        m.updatedAt
      );
    }
  }

  const taskCount = db.prepare(`SELECT COUNT(*) as cnt FROM tasks`).get() as { cnt: number };
  if (taskCount.cnt === 0) {
    const tasks: TaskItem[] = [
      {
        id: "tsk_nexora_dns",
        title: "Verify AM NEXORA active domain and Cloudflare SSL routing",
        category: "business",
        priority: "high",
        status: "in_progress",
        dueDate: ts.slice(0, 10),
        notes: "Compare am-noxera-2510.infy.click vs am-noxera-123.ct.ws and mark canonical active domain.",
        createdAt: ts,
      },
      {
        id: "tsk_digital_hub_auth",
        title: "Add admin authentication guard to AM DIGITAL HUB server.js",
        category: "dev",
        priority: "high",
        status: "todo",
        dueDate: ts.slice(0, 10),
        notes: "Protect admin.html endpoint before connecting live Supabase tables.",
        createdAt: ts,
      },
      {
        id: "tsk_python_ai",
        title: "Review Python AI Router & SQLite schema in DEX MADE Native Deliverables",
        category: "study",
        priority: "medium",
        status: "todo",
        dueDate: ts.slice(0, 10),
        notes: "Inspect aurix_core.py and compile C# WPF desktop shell on Windows 10/11.",
        createdAt: ts,
      },
    ];
    const insertTask = db.prepare(`
      INSERT INTO tasks (id, title, category, priority, status, due_date, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of tasks) {
      insertTask.run(t.id, t.title, t.category, t.priority, t.status, t.dueDate, t.notes, t.createdAt);
    }
  }

  const noteCount = db.prepare(`SELECT COUNT(*) as cnt FROM notes`).get() as { cnt: number };
  if (noteCount.cnt === 0) {
    db.prepare(`INSERT INTO notes (id, title, category, content, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
      "note_welcome",
      "AM VEYRONIX Architecture Principles",
      "Company",
      "1. Maintain strict separation between AM NEXORA, AM DIGITAL HUB, TEAM CONNECT, and the main AM VEYRONIX website.\n2. Never invent company revenue, employees, or client testimonials.\n3. Always confirm before modifying critical project files or sending external proposals.",
      ts
    );
  }

  const pkgCount = db.prepare(`SELECT COUNT(*) as cnt FROM business_items`).get() as { cnt: number };
  if (pkgCount.cnt === 0) {
    db.prepare(`
      INSERT INTO business_items (id, kind, title, client_name, status, amount, currency, details, verified_entry, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "biz_pkg_web_starter",
      "package",
      "AM VEYRONIX Custom Website & Optimization Package",
      "Service Catalog",
      "Active Offering",
      0,
      "USD",
      "Custom responsive frontend development, WordPress or static/Node deployment, speed optimization, and SEO fundamentals. Pricing configured per client quotation.",
      1,
      ts,
      ts
    );
  }

  const secRow = db.prepare(`SELECT id FROM security_config WHERE id = 1`).get();
  if (!secRow) {
    db.prepare(`
      INSERT INTO security_config (
        id, pin_hash, pin_salt, failed_attempts, locked_until, inactivity_minutes,
        require_pin_on_boot, windows_hello_status, updated_at
      ) VALUES (1, NULL, NULL, 0, NULL, 15, 0, ?, ?)
    `).run("Available in Native Windows 10/11 WPF Build (WinRT UserConsentVerifier); Browser uses PIN + WebAuthn fallback", ts);
  }

  const auditCount = db.prepare(`SELECT COUNT(*) as cnt FROM audit_logs`).get() as { cnt: number };
  if (auditCount.cnt === 0) {
    addAuditLog("SYSTEM_INIT", "DEX MADE Core", "Initialized local SQLite knowledge store and AM VEYRONIX registry.", "info");
  }

  // Historical system labels and auto-generated conversation titles follow the
  // permanent identity. Chat message bodies are never rewritten.
  for (const legacy of ["AURIX", "Desk Mate"]) {
    db.prepare(`UPDATE audit_logs SET actor = REPLACE(actor, ?, 'DEX MADE') WHERE actor LIKE ?`).run(legacy, `%${legacy}%`);
    db.prepare(`UPDATE audit_logs SET detail = REPLACE(detail, ?, 'DEX MADE') WHERE detail LIKE ?`).run(legacy, `%${legacy}%`);
    db.prepare(`UPDATE conversations SET title = REPLACE(title, ?, 'DEX MADE') WHERE title LIKE ?`).run(legacy, `%${legacy}%`);
    db.prepare(`UPDATE tasks SET title = REPLACE(title, ?, 'DEX MADE') WHERE title LIKE ?`).run(legacy, `%${legacy}%`);
  }
}

/**
 * One-time Link Vault seed.
 *
 * The owner's existing spoken-command website registry already holds real,
 * verified URLs. Importing them once means Link Vault starts useful (and voice
 * commands keep working exactly as before) without inventing a single link.
 * A kv_store flag makes sure a vault the owner deliberately emptied stays empty.
 */
function seedLinkVault(): void {
  const seeded = db.prepare(`SELECT value FROM kv_store WHERE key = 'link_vault_seeded'`).get();
  if (seeded) return;

  const count = db.prepare(`SELECT COUNT(*) as cnt FROM saved_links`).get() as { cnt: number };
  if (count.cnt === 0) {
    const categoryMap: Record<string, string> = {
      social: "Social Media",
      work: "Business",
      business: "Business",
      tools: "AI Tools",
      learning: "Education",
      media: "Entertainment",
    };
    const insert = db.prepare(`
      INSERT OR IGNORE INTO saved_links (id, name, url, category, description, tags_json, notes, is_favourite, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', '[]', '', 0, ?, ?)
    `);
    const ts = nowIso();
    for (const entry of WEBSITE_REGISTRY) {
      if (!entry.url) continue;
      const normalized = normalizeHttpUrl(entry.url);
      if (!normalized.ok) continue;
      insert.run(
        `lnk_registry_${entry.id.replace(/[^a-z0-9_]/gi, "_")}`,
        entry.name,
        normalized.url,
        categoryMap[entry.category] ?? "Other",
        ts,
        ts
      );
    }
  }

  db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('link_vault_seeded', '1', ?)`).run(
    nowIso()
  );
}

seedInitialData();
seedLinkVault();
export const seedIfNeeded = seedInitialData;

// Data Access Helpers
export function getOwnerProfile(): OwnerProfile {
  const row = db.prepare(`SELECT value FROM kv_store WHERE key = 'owner_profile'`).get() as { value: string };
  return JSON.parse(row.value) as OwnerProfile;
}

export function saveOwnerProfile(profile: OwnerProfile): OwnerProfile {
  const updated = { ...profile, updatedAt: nowIso() };
  db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('owner_profile', ?, ?)`).run(
    JSON.stringify(updated),
    updated.updatedAt
  );
  addAuditLog("OWNER_UPDATE", "Abdul Muheeb", "Updated personal owner knowledge profile.", "info");
  return updated;
}

export function getCompanyProfile(): CompanyProfile {
  const row = db.prepare(`SELECT value FROM kv_store WHERE key = 'company_profile'`).get() as { value: string };
  return JSON.parse(row.value) as CompanyProfile;
}

export function saveCompanyProfile(company: CompanyProfile): CompanyProfile {
  const updated = { ...company, updatedAt: nowIso() };
  db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('company_profile', ?, ?)`).run(
    JSON.stringify(updated),
    updated.updatedAt
  );
  addAuditLog("COMPANY_UPDATE", "Abdul Muheeb", "Updated AM VEYRONIX company profile and documents.", "info");
  return updated;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  voiceName: "Charon",
  voiceShortcuts: { ...DEFAULT_VOICE_SHORTCUTS },
  voiceSpeed: 1.0,
  voicePitch: 1.0,
  voiceVolume: 2.0,
  language: "English",
  autoDetectLanguage: false,
  wakePhrase: "Hello Dex Made",
  voiceEnabled: true,
  micEnabled: true,
  pushToTalk: true,
  handsFreeVadEnabled: false,
  vadSensitivity: 60,
  micSensitivity: 65,
  theme: "light",
  activeModel: "gemini-4-hydrogen",
  thinkingLevel: "MEDIUM",
  performanceMode: "auto",
  offlineModeForced: false,
  cameraEnabled: true,
  lightweightAnimations: false,
  autoHealEnabled: true,
  autoLockEnabled: true,
  notificationsEnabled: true,
  startupBehavior: "Open Command Dashboard",
  startupAnimationEnabled: true,
  startupDurationSeconds: 8,
  startupSoundEnabled: true,
  startupSoundVolume: 70,
  autoVoiceGreetingEnabled: true,
  greetingLanguage: "English",
  greetingVolume: 85,
  autoStartEnabled: false,
  proactiveTalkEnabled: true,
  proactiveIntervalSeconds: 20,
  doNotDisturb: false,
  quietHoursEnabled: false,
  quietHoursStart: "23:00",
  quietHoursEnd: "07:00",
};

export function getAppSettings(): AppSettings {
  const row = db.prepare(`SELECT value FROM kv_store WHERE key = 'app_settings'`).get() as { value: string };
  const stored = JSON.parse(row.value) as Partial<AppSettings>;
  const merged: AppSettings = {
    ...DEFAULT_APP_SETTINGS,
    ...stored,
    voiceShortcuts: { ...DEFAULT_VOICE_SHORTCUTS, ...(stored.voiceShortcuts || {}) },
  };

  // One-time upgrade for installs that still hold the old identity defaults.
  const migrated = db.prepare(`SELECT value FROM kv_store WHERE key = 'dex_identity_migration'`).get();
  if (!migrated) {
    const storedWake = (stored.wakePhrase || "").trim();
    if (!storedWake || /^hello\s+(aurix|desk\s*mate)$/i.test(storedWake)) {
      merged.wakePhrase = DEFAULT_APP_SETTINGS.wakePhrase;
    }
    if (!stored.voiceVolume || stored.voiceVolume <= 1) {
      merged.voiceVolume = DEFAULT_APP_SETTINGS.voiceVolume;
    }
    db.prepare(
      `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('dex_identity_migration', '1', ?)`
    ).run(nowIso());
    saveAppSettings(merged);
  }

  // One-time louder default: earlier builds capped playback at 150%, which was
  // too quiet for the device fallback voice.
  const volumeBoost = db.prepare(`SELECT value FROM kv_store WHERE key = 'dex_voice_volume_boost'`).get();
  if (!volumeBoost) {
    if (!merged.voiceVolume || merged.voiceVolume < 2) {
      merged.voiceVolume = DEFAULT_APP_SETTINGS.voiceVolume;
    }
    db.prepare(
      `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('dex_voice_volume_boost', '1', ?)`
    ).run(nowIso());
    saveAppSettings(merged);
  }
  return merged;
}

export function saveAppSettings(settings: AppSettings): AppSettings {
  const ts = nowIso();
  db.prepare(`INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES ('app_settings', ?, ?)`).run(
    JSON.stringify(settings),
    ts
  );
  return settings;
}

export function listWebsites(): WebsiteRecord[] {
  const rows = db.prepare(`SELECT * FROM websites ORDER BY name ASC`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    tagline: String(r.tagline),
    purpose: String(r.purpose),
    status: r.status as WebsiteRecord["status"],
    activeDomain: String(r.active_domain),
    domains: JSON.parse(String(r.domains_json)),
    hostingProviders: JSON.parse(String(r.hosting_json)),
    stack: JSON.parse(String(r.stack_json)),
    files: JSON.parse(String(r.files_json)),
    features: JSON.parse(String(r.features_json)),
    pages: String(r.pages),
    databaseNotes: String(r.database_notes),
    apiIntegrations: String(r.api_integrations),
    deploymentHistory: String(r.deployment_history),
    knownBugs: String(r.known_bugs),
    pendingTasks: String(r.pending_tasks),
    securityNotes: String(r.security_notes),
    futureImprovements: String(r.future_improvements),
    updatedAt: String(r.updated_at),
  }));
}

export function upsertWebsite(w: WebsiteRecord): WebsiteRecord {
  const updated: WebsiteRecord = { ...w, id: w.id || uid("web"), updatedAt: nowIso() };
  db.prepare(`
    INSERT OR REPLACE INTO websites (
      id, name, tagline, purpose, status, active_domain, domains_json, hosting_json,
      stack_json, files_json, features_json, pages, database_notes, api_integrations,
      deployment_history, known_bugs, pending_tasks, security_notes, future_improvements, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    updated.id,
    updated.name,
    updated.tagline,
    updated.purpose,
    updated.status,
    updated.activeDomain,
    JSON.stringify(updated.domains),
    JSON.stringify(updated.hostingProviders),
    JSON.stringify(updated.stack),
    JSON.stringify(updated.files),
    JSON.stringify(updated.features),
    updated.pages,
    updated.databaseNotes,
    updated.apiIntegrations,
    updated.deploymentHistory,
    updated.knownBugs,
    updated.pendingTasks,
    updated.securityNotes,
    updated.futureImprovements,
    updated.updatedAt
  );
  addAuditLog("WEBSITE_SAVED", "Abdul Muheeb", `Saved isolated website record: ${updated.name}`, "info");
  return updated;
}

export function listProjects(): ProjectRecord[] {
  const rows = db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    category: String(r.category),
    description: String(r.description),
    status: r.status as ProjectRecord["status"],
    progress: Number(r.progress),
    stack: JSON.parse(String(r.stack_json)),
    locationOrUrl: String(r.location_or_url),
    knownBugs: String(r.known_bugs),
    pendingTasks: String(r.pending_tasks),
    securityNotes: String(r.security_notes),
    updatedAt: String(r.updated_at),
  }));
}

export function upsertProject(p: ProjectRecord): ProjectRecord {
  const updated: ProjectRecord = { ...p, id: p.id || uid("prj"), updatedAt: nowIso() };
  db.prepare(`
    INSERT OR REPLACE INTO projects (
      id, name, category, description, status, progress, stack_json, location_or_url,
      known_bugs, pending_tasks, security_notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    updated.id,
    updated.name,
    updated.category,
    updated.description,
    updated.status,
    updated.progress,
    JSON.stringify(updated.stack),
    updated.locationOrUrl,
    updated.knownBugs,
    updated.pendingTasks,
    updated.securityNotes,
    updated.updatedAt
  );
  addAuditLog("PROJECT_SAVED", "Abdul Muheeb", `Updated project: ${updated.name} (${updated.status})`, "info");
  return updated;
}

export function listMemories(): MemoryItem[] {
  const rows = db.prepare(`SELECT * FROM memories ORDER BY updated_at DESC`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    category: String(r.category),
    title: String(r.title),
    content: String(r.content),
    source: String(r.source),
    projectScope: String(r.project_scope),
    approved: Number(r.approved) === 1,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export function upsertMemory(m: Omit<MemoryItem, "createdAt" | "updatedAt"> & { createdAt?: string }): MemoryItem {
  const ts = nowIso();
  const item: MemoryItem = {
    id: m.id || uid("mem"),
    category: m.category,
    title: m.title,
    content: m.content,
    source: m.source || "Owner Entry",
    projectScope: m.projectScope || "Global",
    approved: m.approved ?? true,
    createdAt: m.createdAt || ts,
    updatedAt: ts,
  };
  db.prepare(`
    INSERT OR REPLACE INTO memories (id, category, title, content, source, project_scope, approved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id,
    item.category,
    item.title,
    item.content,
    item.source,
    item.projectScope,
    item.approved ? 1 : 0,
    item.createdAt,
    item.updatedAt
  );
  addAuditLog("MEMORY_SAVED", "Abdul Muheeb", `Saved memory [${item.projectScope}]: ${item.title}`, "info");
  return item;
}

export function deleteMemory(id: string): void {
  db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  addAuditLog("MEMORY_DELETED", "Abdul Muheeb", `Deleted memory entry ${id}`, "warning");
}

export function listConversations(): ConversationSummary[] {
  const rows = db.prepare(`SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 40`).all() as Record<
    string,
    unknown
  >[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    mode: String(r.mode),
    model: String(r.model),
    language: String(r.language),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export function getConversationMessages(conversationId: string): ChatMessage[] {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`)
    .all(conversationId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    conversationId: String(r.conversation_id),
    role: r.role as "user" | "assistant",
    content: String(r.content),
    modelUsed: r.model_used ? String(r.model_used) : undefined,
    language: r.language ? String(r.language) : undefined,
    thinkingLevel: r.thinking_level ? String(r.thinking_level) : undefined,
    sources: r.sources_json ? JSON.parse(String(r.sources_json)) : undefined,
    createdAt: String(r.created_at),
  }));
}

export function ensureConversation(id: string | undefined, title: string, mode: string, model: string, language: string): string {
  const ts = nowIso();
  if (id) {
    const found = db.prepare(`SELECT id FROM conversations WHERE id = ?`).get(id);
    if (found) {
      db.prepare(`UPDATE conversations SET updated_at = ?, model = ?, language = ? WHERE id = ?`).run(ts, model, language, id);
      return id;
    }
  }
  const newId = id || uid("conv");
  db.prepare(
    `INSERT INTO conversations (id, title, mode, model, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(newId, title.slice(0, 80) || "New DEX MADE Session", mode, model, language, ts, ts);
  return newId;
}

export function addMessage(msg: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  const saved: ChatMessage = {
    ...msg,
    id: uid("msg"),
    createdAt: nowIso(),
  };
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, model_used, language, thinking_level, sources_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    saved.id,
    saved.conversationId,
    saved.role,
    saved.content,
    saved.modelUsed ?? null,
    saved.language ?? null,
    saved.thinkingLevel ?? null,
    saved.sources ? JSON.stringify(saved.sources) : null,
    saved.createdAt
  );
  return saved;
}

export function listBusinessItems(): BusinessItem[] {
  const rows = db.prepare(`SELECT * FROM business_items ORDER BY updated_at DESC`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as BusinessItem["kind"],
    title: String(r.title),
    clientName: String(r.client_name),
    status: String(r.status),
    amount: Number(r.amount),
    currency: String(r.currency),
    details: String(r.details),
    verifiedEntry: Number(r.verified_entry) === 1,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export function upsertBusinessItem(
  item: Omit<BusinessItem, "createdAt" | "updatedAt"> & { createdAt?: string }
): BusinessItem {
  const ts = nowIso();
  const saved: BusinessItem = {
    ...item,
    id: item.id || uid("biz"),
    createdAt: item.createdAt || ts,
    updatedAt: ts,
  };
  db.prepare(`
    INSERT OR REPLACE INTO business_items (
      id, kind, title, client_name, status, amount, currency, details, verified_entry, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    saved.id,
    saved.kind,
    saved.title,
    saved.clientName,
    saved.status,
    saved.amount,
    saved.currency,
    saved.details,
    saved.verifiedEntry ? 1 : 0,
    saved.createdAt,
    saved.updatedAt
  );
  addAuditLog("BUSINESS_ENTRY", "Abdul Muheeb", `Saved ${saved.kind}: ${saved.title}`, "info");
  return saved;
}

export function listTasks(): TaskItem[] {
  const rows = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    category: r.category as TaskItem["category"],
    priority: r.priority as TaskItem["priority"],
    status: r.status as TaskItem["status"],
    dueDate: String(r.due_date),
    notes: String(r.notes),
    createdAt: String(r.created_at),
  }));
}

export function upsertTask(t: Omit<TaskItem, "createdAt"> & { createdAt?: string }): TaskItem {
  const saved: TaskItem = {
    ...t,
    id: t.id || uid("tsk"),
    createdAt: t.createdAt || nowIso(),
  };
  db.prepare(`
    INSERT OR REPLACE INTO tasks (id, title, category, priority, status, due_date, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(saved.id, saved.title, saved.category, saved.priority, saved.status, saved.dueDate, saved.notes, saved.createdAt);
  return saved;
}

export function deleteTask(id: string): void {
  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
}

export function listNotes(): NoteItem[] {
  const rows = db.prepare(`SELECT * FROM notes ORDER BY updated_at DESC`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    category: String(r.category),
    content: String(r.content),
    updatedAt: String(r.updated_at),
  }));
}

export function upsertNote(n: Omit<NoteItem, "updatedAt">): NoteItem {
  const saved: NoteItem = {
    ...n,
    id: n.id || uid("note"),
    updatedAt: nowIso(),
  };
  db.prepare(`INSERT OR REPLACE INTO notes (id, title, category, content, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
    saved.id,
    saved.title,
    saved.category,
    saved.content,
    saved.updatedAt
  );
  return saved;
}

export function deleteNote(id: string): void {
  db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
}

/* ------------------------------------------------------------------ */
/* Link Vault — saved_links                                            */
/* ------------------------------------------------------------------ */

export class DuplicateSavedLinkError extends Error {
  existing: SavedLink;
  constructor(existing: SavedLink) {
    super(`That URL is already saved as "${existing.name}".`);
    this.name = "DuplicateSavedLinkError";
    this.existing = existing;
  }
}

function mapSavedLinkRow(row: Record<string, unknown>): SavedLink {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(String(row.tags_json ?? "[]"));
    if (Array.isArray(parsed)) tags = parsed.map((tag) => String(tag));
  } catch {
    tags = [];
  }
  return {
    id: String(row.id),
    name: String(row.name),
    url: String(row.url),
    category: String(row.category || "Other"),
    description: String(row.description ?? ""),
    tags,
    notes: String(row.notes ?? ""),
    isFavourite: Number(row.is_favourite) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listSavedLinks(): SavedLink[] {
  const rows = db
    .prepare(`SELECT * FROM saved_links ORDER BY is_favourite DESC, name COLLATE NOCASE ASC`)
    .all() as Record<string, unknown>[];
  return rows.map(mapSavedLinkRow);
}

export function getSavedLink(id: string): SavedLink | null {
  const row = db.prepare(`SELECT * FROM saved_links WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? mapSavedLinkRow(row) : null;
}

function findSavedLinkByUrl(url: string, excludeId?: string): SavedLink | null {
  const row = excludeId
    ? db.prepare(`SELECT * FROM saved_links WHERE url = ? COLLATE NOCASE AND id != ?`).get(url, excludeId)
    : db.prepare(`SELECT * FROM saved_links WHERE url = ? COLLATE NOCASE`).get(url);
  return row ? mapSavedLinkRow(row as Record<string, unknown>) : null;
}

export function savedLinkCategories(): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT category FROM saved_links WHERE category != '' ORDER BY category COLLATE NOCASE ASC`)
    .all() as Array<{ category: string }>;
  return rows.map((row) => String(row.category));
}

export function createSavedLink(input: SavedLinkInput): SavedLink {
  const duplicate = findSavedLinkByUrl(input.url);
  if (duplicate) throw new DuplicateSavedLinkError(duplicate);

  const ts = nowIso();
  const link: SavedLink = { ...input, id: uid("lnk"), createdAt: ts, updatedAt: ts };
  db.prepare(`
    INSERT INTO saved_links (id, name, url, category, description, tags_json, notes, is_favourite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    link.id,
    link.name,
    link.url,
    link.category,
    link.description,
    JSON.stringify(link.tags),
    link.notes,
    link.isFavourite ? 1 : 0,
    link.createdAt,
    link.updatedAt
  );
  addAuditLog("LINK_SAVED", "Abdul Muheeb", `Saved link: ${link.name} (${link.category})`, "info");
  return link;
}

export function updateSavedLink(id: string, input: SavedLinkInput): SavedLink | null {
  const existing = getSavedLink(id);
  if (!existing) return null;

  const duplicate = findSavedLinkByUrl(input.url, id);
  if (duplicate) throw new DuplicateSavedLinkError(duplicate);

  const updated: SavedLink = { ...existing, ...input, id, createdAt: existing.createdAt, updatedAt: nowIso() };
  db.prepare(`
    UPDATE saved_links
    SET name = ?, url = ?, category = ?, description = ?, tags_json = ?, notes = ?, is_favourite = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updated.name,
    updated.url,
    updated.category,
    updated.description,
    JSON.stringify(updated.tags),
    updated.notes,
    updated.isFavourite ? 1 : 0,
    updated.updatedAt,
    id
  );
  addAuditLog("LINK_UPDATED", "Abdul Muheeb", `Updated link: ${updated.name} (${updated.category})`, "info");
  return updated;
}

export function deleteSavedLink(id: string): boolean {
  const existing = getSavedLink(id);
  if (!existing) return false;
  db.prepare(`DELETE FROM saved_links WHERE id = ?`).run(id);
  addAuditLog("LINK_DELETED", "Abdul Muheeb", `Deleted link: ${existing.name}`, "warning");
  return true;
}

export function setSavedLinkFavourite(id: string, isFavourite: boolean): SavedLink | null {
  const existing = getSavedLink(id);
  if (!existing) return null;
  const ts = nowIso();
  db.prepare(`UPDATE saved_links SET is_favourite = ?, updated_at = ? WHERE id = ?`).run(
    isFavourite ? 1 : 0,
    ts,
    id
  );
  return { ...existing, isFavourite, updatedAt: ts };
}

/**
 * Bulk import. Returns how many rows were written and how many were skipped
 * because the URL was already saved (or repeated inside the same batch).
 * Existing records are never overwritten.
 */
export function importSavedLinks(inputs: SavedLinkInput[]): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;
  const batchUrls = new Set<string>();
  for (const input of inputs) {
    const key = input.url.toLowerCase();
    if (batchUrls.has(key) || findSavedLinkByUrl(input.url)) {
      skipped += 1;
      continue;
    }
    batchUrls.add(key);
    createSavedLink(input);
    imported += 1;
  }
  if (imported > 0) {
    addAuditLog("LINKS_IMPORTED", "Abdul Muheeb", `Imported ${imported} link(s) into Link Vault.`, "info");
  }
  return { imported, skipped };
}

export function getSecurityStatus(): SecurityStatus {
  const row = db.prepare(`SELECT * FROM security_config WHERE id = 1`).get() as Record<string, unknown>;
  const lockedUntil = row.locked_until ? String(row.locked_until) : null;
  const isLockedOut = lockedUntil ? new Date(lockedUntil).getTime() > Date.now() : false;
  return {
    hasPin: Boolean(row.pin_hash),
    isLockedOut,
    lockedUntil,
    failedAttempts: Number(row.failed_attempts),
    inactivityMinutes: Number(row.inactivity_minutes),
    requirePinOnBoot: Number(row.require_pin_on_boot) === 1,
    windowsHelloStatus: String(row.windows_hello_status),
    updatedAt: String(row.updated_at),
  };
}

export function setSecurityPin(pin: string): SecurityStatus {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  const ts = nowIso();
  db.prepare(`
    UPDATE security_config SET pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = NULL, updated_at = ?
    WHERE id = 1
  `).run(hash, salt, ts);
  addAuditLog("PIN_CONFIGURED", "Abdul Muheeb", "Personal security PIN updated using scrypt cryptographic KDF.", "security");
  return getSecurityStatus();
}

export function verifySecurityPin(pin: string): { ok: boolean; status: SecurityStatus; message: string } {
  const row = db.prepare(`SELECT * FROM security_config WHERE id = 1`).get() as Record<string, unknown>;
  const lockedUntil = row.locked_until ? String(row.locked_until) : null;
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    addAuditLog("PIN_BLOCKED_LOCKOUT", "Security Gate", "Blocked PIN attempt during temporary lockout.", "security");
    return {
      ok: false,
      status: getSecurityStatus(),
      message: "Too many failed attempts. Temporary lockout active.",
    };
  }
  if (!row.pin_hash || !row.pin_salt) {
    return { ok: true, status: getSecurityStatus(), message: "No PIN configured." };
  }
  const derived = crypto.scryptSync(pin, String(row.pin_salt), 64);
  const stored = Buffer.from(String(row.pin_hash), "hex");
  const match = derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
  const ts = nowIso();
  if (match) {
    db.prepare(`UPDATE security_config SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = 1`).run(ts);
    addAuditLog("PIN_VERIFIED", "Abdul Muheeb", "Session unlocked via personal PIN verification.", "security");
    return { ok: true, status: getSecurityStatus(), message: "Verified." };
  } else {
    const attempts = Number(row.failed_attempts) + 1;
    const nextLock = attempts >= 5 ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null;
    db.prepare(`UPDATE security_config SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = 1`).run(
      attempts,
      nextLock,
      ts
    );
    addAuditLog(
      "PIN_FAILED",
      "Security Gate",
      `Failed PIN attempt (${attempts}/5)${nextLock ? " — 2 minute lockout triggered." : "."}`,
      "security"
    );
    return {
      ok: false,
      status: getSecurityStatus(),
      message: nextLock
        ? "5 failed attempts reached. Locked out for 2 minutes."
        : `Incorrect PIN (${attempts}/5 attempts).`,
    };
  }
}

export function updateSecurityPreferences(inactivityMinutes: number, requirePinOnBoot: boolean): SecurityStatus {
  const ts = nowIso();
  db.prepare(`UPDATE security_config SET inactivity_minutes = ?, require_pin_on_boot = ?, updated_at = ? WHERE id = 1`).run(
    Math.max(1, Math.min(120, inactivityMinutes)),
    requirePinOnBoot ? 1 : 0,
    ts
  );
  addAuditLog(
    "SECURITY_PREFS_UPDATED",
    "Abdul Muheeb",
    `Set inactivity timeout to ${inactivityMinutes}m; boot PIN ${requirePinOnBoot ? "enabled" : "disabled"}.`,
    "security"
  );
  return getSecurityStatus();
}

/**
 * Owner-initiated full security reset: wipes face/voice templates, the PIN and
 * every lockout/attempt counter so the owner can enroll again from scratch.
 * Personal app data (projects, notes, memories) is left untouched.
 */
export function resetSecurityState(): SecurityStatus {
  const ts = nowIso();
  db.prepare(`DELETE FROM biometric_profiles`).run();
  db.prepare(`DELETE FROM auth_events`).run();
  db.prepare(
    `UPDATE biometric_session SET status = 'locked', method = NULL, verified_at = NULL, locked_at = ?, last_seen = ? WHERE id = 1`
  ).run(ts, ts);
  db.prepare(
    `UPDATE biometric_settings SET require_biometric_on_boot = 0, auth_phrase = 'DEX MADE authorize my voice', updated_at = ? WHERE id = 1`
  ).run(ts);
  db.prepare(
    `UPDATE security_config SET pin_hash = NULL, pin_salt = NULL, failed_attempts = 0, locked_until = NULL, require_pin_on_boot = 0, updated_at = ? WHERE id = 1`
  ).run(ts);
  addAuditLog(
    "SECURITY_RESET",
    "Abdul Muheeb",
    "Security system reset: face and voice templates, PIN, lockout state and authentication history cleared for fresh enrollment.",
    "security"
  );
  return getSecurityStatus();
}

export function listAuditLogs(): AuditLogEntry[] {
  const rows = db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 60`).all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    eventType: String(r.event_type),
    actor: String(r.actor),
    detail: String(r.detail),
    severity: r.severity as AuditLogEntry["severity"],
    createdAt: String(r.created_at),
  }));
}

export function addDesktopActionLog(
  entry: Omit<DesktopActionLog, "id" | "createdAt">
): DesktopActionLog {
  const saved: DesktopActionLog = {
    ...entry,
    id: uid("act"),
    createdAt: nowIso(),
  };
  db.prepare(`
    INSERT INTO desktop_actions (id, action, target, status, executed_in, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(saved.id, saved.action, saved.target, saved.status, saved.executedIn, saved.detail, saved.createdAt);
  return saved;
}

export function listDesktopActionLogs(): DesktopActionLog[] {
  const rows = db
    .prepare(`SELECT * FROM desktop_actions ORDER BY created_at DESC LIMIT 60`)
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    action: String(r.action),
    target: String(r.target),
    status: r.status as DesktopActionLog["status"],
    executedIn: String(r.executed_in),
    detail: String(r.detail),
    createdAt: String(r.created_at),
  }));
}

export function addSelfHealHistory(
  entry: Omit<SelfHealHistoryEntry, "id" | "createdAt">
): SelfHealHistoryEntry {
  const saved: SelfHealHistoryEntry = {
    ...entry,
    id: uid("heal"),
    createdAt: nowIso(),
  };
  db.prepare(`
    INSERT INTO self_heal_history (id, overall_status, detected_count, repaired_count, failed_count, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    saved.id,
    saved.overallStatus,
    saved.detectedCount,
    saved.repairedCount,
    saved.failedCount,
    saved.summary,
    saved.createdAt
  );
  return saved;
}

export function listSelfHealHistory(): SelfHealHistoryEntry[] {
  const rows = db
    .prepare(`SELECT * FROM self_heal_history ORDER BY created_at DESC LIMIT 40`)
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    overallStatus: String(r.overall_status),
    detectedCount: Number(r.detected_count),
    repairedCount: Number(r.repaired_count),
    failedCount: Number(r.failed_count),
    summary: String(r.summary),
    createdAt: String(r.created_at),
  }));
}

export function exportFullBackup() {
  return {
    exportedAt: nowIso(),
    system: "DEX MADE 2.0 — AM VEYRONIX",
    owner: getOwnerProfile(),
    company: getCompanyProfile(),
    websites: listWebsites(),
    projects: listProjects(),
    memories: listMemories(),
    links: listSavedLinks(),
    business: listBusinessItems(),
    tasks: listTasks(),
    notes: listNotes(),
    settings: getAppSettings(),
    desktopActions: listDesktopActionLogs(),
    selfHealHistory: listSelfHealHistory(),
  };
}

