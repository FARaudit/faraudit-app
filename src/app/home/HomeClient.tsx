"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { isPieeUrl, getPieeInstructions } from "@/lib/piee-detector";
import { createBrowserClient } from "@/lib/supabase-browser";
import { STORAGE_UPLOAD_THRESHOLD_BYTES } from "@/lib/validators";
import type {
  HeaderCounter,
  OpportunityRow,
  AuditRow,
  KORow,
  AgencyRow,
  DefenseSpendingRow
} from "@/lib/bd-os/queries";
import { auditDisplayName, auditHref, displaySolicitationId } from "@/lib/audit-display";
import NaicsCombobox from "@/components/NaicsCombobox";
import FeedbackWidget from "@/app/_components/feedback-widget";

type TabKey =
  | "home" | "audit" | "past-audits" | "pipeline" | "capability"
  | "opportunities" | "defense-spending" | "news" | "contracting-officers" | "agencies"
  | "protests" | "regulatory" | "cmmc" | "wages" | "teaming";

// Legacy hash redirect map · keeps CEO bookmarks + LinkedIn links alive after
// the Prompt 8 sidebar IA restructure. Old hashes silently rewrite to their
// new equivalents on /home page mount.
const LEGACY_HASH_MAP: Record<string, TabKey> = {
  sam: "opportunities",
  budget: "defense-spending",
  ko: "contracting-officers",
  "ko-intelligence": "contracting-officers",
  agency: "agencies",
  "agency-intelligence": "agencies",
  protest: "protests",
  rfi: "opportunities",
  "rfi-response": "opportunities",
  subcontracts: "home",
  labor: "wages",
  reports: "past-audits"
};
type FilterKey = "All" | "P0 · P1" | "≤7 Days" | "Small Business" | "IDIQ" | "Pre-Sol";

interface Props {
  user: { email: string; id: string };
  counter: HeaderCounter;
  opportunities: OpportunityRow[];
  recentAudits: AuditRow[];
  kos: KORow[];
  agencies: AgencyRow[];
  defenseSpending: DefenseSpendingRow[];
}

const FILTERS: FilterKey[] = ["All", "P0 · P1", "≤7 Days", "Small Business", "IDIQ", "Pre-Sol"];

const TAB_KEYS: TabKey[] = [
  "home", "audit", "past-audits", "pipeline", "capability",
  "opportunities", "defense-spending", "news", "contracting-officers", "agencies",
  "protests", "regulatory", "cmmc", "wages", "teaming"
];

export default function HomeClient({ user, counter, opportunities: initialOpportunities, recentAudits: initialRecentAudits, kos, agencies, defenseSpending }: Props) {
  const router = useRouter();
  // Locally-mutable audit list — pinning/unpinning from Past Audits flips
  // in_pipeline on the matching row so the Pipeline Kanban re-derives without
  // a page reload. Initial value seeded from server-fetched prop.
  const [recentAudits, setRecentAudits] = useState<AuditRow[]>(initialRecentAudits);
  const updateAudit = useCallback((id: string, patch: Partial<AuditRow>) => {
    setRecentAudits((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);
  // FA-89: opportunities lifted to state so Watch/Pipeline toggles in the
  // Opportunities tab can optimistically reflect without a page reload.
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>(initialOpportunities);
  const updateOpportunity = useCallback((noticeId: string, patch: Partial<OpportunityRow>) => {
    setOpportunities((prev) => prev.map((o) => (o.notice_id === noticeId ? { ...o, ...patch } : o)));
  }, []);
  // FA-89 Opportunities tab filters
  const [oppSearch, setOppSearch] = useState("");
  const [oppSetAside, setOppSetAside] = useState<string>("All");
  const [oppDeadline, setOppDeadline] = useState<"active" | "all" | "<=3" | "<=7" | "<=30" | "expired" | "watched">("active");
  const [oppValue, setOppValue] = useState<string>("all");
  const [oppSort, setOppSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "signal", dir: "asc" });
  // FA-89i: collapsible filter bar + per-row hover state for action overflow.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  // FA-89e: ephemeral per-row "just pinned" confirmation — keyed by notice_id,
  // value is Date.now() of the pin event. Used to render "Pinned ✓" + a "View
  // in Pipeline →" link for ~2s after a successful pin, then revert to the
  // normal "Pinned" label.
  const [pinConfirmedAt, setPinConfirmedAt] = useState<Record<string, number>>({});
  // Mount-gate: SSR + first client paint both render null, then hydration completes
  // and the real UI mounts. Eliminates React hydration mismatch from bare `new Date()`
  // / `Date.now()` calls in render path (enrichRow, hoursUntilNextSamIngest, and the
  // DeadlineCalendar / BudgetPanel components). /home is auth-walled so the SSR-loss
  // tradeoff is invisible to public visitors.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [tab, setTabState] = useState<TabKey>("home");
  const [filter, setFilter] = useState<FilterKey>("All");
  const [naics, setNaics] = useState<string>("all");
  const [feedTs, setFeedTs] = useState<string>("just now");
  const [auditPrefill, setAuditPrefill] = useState<{ notice_id: string; title: string | null; agency: string | null; naics_code: string | null } | null>(null);
  // Lifted so the Today tab's "Critical — Act Today" card can pre-apply the
  // P0 filter when it switches to past-audits. Counter (auditP0Count) and
  // PastAuditsPanel's "p0" filter both use compliance_score < 40 so the math
  // is identical · numbers stay consistent across the click.
  const [pastAuditsFilter, setPastAuditsFilter] = useState<"all" | "p0" | "user">("all");
  // Phase 5 1c: avatar account-menu popover (replaces the old Account nav group).
  const [acctMenuOpen, setAcctMenuOpen] = useState(false);

  // FA-89i FIX 4: reset Opportunities filters whenever the tab becomes active —
  // returning to a clean default view instead of stale filter state from a
  // prior visit (which often hid the seeded demo rows behind a forgotten chip).
  useEffect(() => {
    if (tab === "opportunities") {
      setOppDeadline("active");
      setOppSearch("");
      setOppSetAside("All");
      setOppValue("all");
      setFiltersOpen(false);
    }
  }, [tab]);

  // FA-89i FIX 5: sync local recentAudits with refreshed prop. After a pin/
  // unpin POST, togglePatch calls router.refresh() which re-runs page.tsx and
  // delivers a fresh initialRecentAudits prop with the new stub row included.
  // useState's lazy initializer would otherwise ignore the new prop, so we
  // explicitly sync here so the Pipeline Kanban picks up the new audit.
  useEffect(() => {
    setRecentAudits(initialRecentAudits);
  }, [initialRecentAudits]);

  const setTab = (next: TabKey) => {
    setTabState(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${next}`);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const raw = window.location.hash.replace("#", "");
      // Legacy hash → new hash (silent rewrite, preserves bookmarks).
      if (raw && raw in LEGACY_HASH_MAP) {
        const next = LEGACY_HASH_MAP[raw];
        window.history.replaceState(null, "", `#${next}`);
        setTabState(next);
        return;
      }
      const h = raw as TabKey;
      if (TAB_KEYS.includes(h)) setTabState(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  useEffect(() => {
    let s = 0;
    const t = setInterval(() => {
      s++;
      setFeedTs(s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`);
      if (s >= 90) s = 0;
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const naicsOptions = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((o) => { if (o.naics_code) set.add(o.naics_code); });
    return Array.from(set).sort();
  }, [opportunities]);

  const enriched = useMemo(() => opportunities.map(enrichRow), [opportunities]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (naics && naics !== "all" && r.row.naics_code !== naics) return false;
      if (filter === "P0 · P1") return r.risk === "rp0" || r.risk === "rp1";
      if (filter === "≤7 Days") return r.daysNum != null && r.daysNum >= 0 && r.daysNum <= 7;
      if (filter === "Small Business") return ["SB", "SDVOSB", "WOSB", "8(a)"].includes(r.saLabel);
      if (filter === "IDIQ") {
        const dt = (r.row.document_type || "").toUpperCase();
        const nt = (r.row.notice_type || "").toUpperCase();
        return dt.includes("IDIQ") || nt.includes("IDIQ") || nt.includes("COMBINED SYNOPSIS") || dt.includes("COMBINED SYNOPSIS");
      }
      if (filter === "Pre-Sol") {
        const nt = (r.row.notice_type || "").toLowerCase().replace(/[_-]/g, "");
        const dt = (r.row.document_type || "").toLowerCase().replace(/[_-]/g, "");
        return nt.includes("presol") || nt.includes("presolicitation") || nt.includes("sourcessought")
          || dt.includes("presol") || dt.includes("presolicitation") || dt.includes("sourcessought");
      }
      return true;
    });
  }, [enriched, filter, naics]);

  // FA-89: Opportunities tab-specific filter + sort. Independent from the
  // Today-tab "filter" chip enum above. Composes 4 dimensions (search,
  // set-aside, deadline, sort) and excludes rows without a real solicitation
  // number so the demo never lands on a UUID-prefilled audit.
  // FA-89g: compact USD formatter for award_ceiling. $1.2M / $450K / $1,234.
  const formatValue = (v: number | null): string => {
    if (v == null) return "";
    if (v >= 1000000) return "$" + (v / 1000000).toFixed(1) + "M";
    if (v >= 1000)    return "$" + Math.round(v / 1000) + "K";
    return "$" + v;
  };

  // P2 polish: acronym guard for the naive word-by-word title-case below —
  // "USMS" must not become "Usms", "AQ HQ" not "Aq Hq". Tokens in the set
  // (and tokens containing digits, e.g. FY26 / D07 / 15M10226QA4700149)
  // keep their original uppercase form.
  const TITLE_ACRONYMS = new Set([
    "USMS","USCG","USAF","USMC","USN","USA","USDA","USPS","US","U.S.",
    "DLA","DFAS","DISA","DCMA","DCSA","DOD","DOJ","DOE","DOT","DOI","DOL","DOC","DHS","HHS",
    "IRS","FBI","ATF","DEA","ICE","CBP","TSA","FAA","FEMA","NIH","CDC","VA","GSA","NASA","NOAA",
    "HQ","AQ","AFB","AFMC","AFLCMC","NAVSUP","NAVAIR","NAVSEA",
    "RFQ","RFP","IFB","RFI","IDIQ","BPA","PWS","SOW","SOO","CLIN","NSN","FOB",
    "FAR","DFARS","CFR","USC","II","III","IV"
  ]);
  const caseToken = (t: string): string => {
    const m = /^([A-Za-z0-9.&-]+)(.*)$/.exec(t);
    const core = m ? m[1] : t;
    const rest = m ? m[2] : "";
    if (TITLE_ACRONYMS.has(core.toUpperCase())) return core.toUpperCase() + rest;
    if (/\d/.test(core)) return core.toUpperCase() + rest;
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  };

  // FA-89j: agency short-name display. pending_audits.agency arrives as
  // "DEPT OF DEFENSE · DEPT OF THE AIR FORCE" from resolveAgency in sam-ingest
  // helpers (two segments joined by " · "). Take first segment, strip prefix/
  // suffix decorations, title-case, then look up a 2-3 letter short-name in
  // the map. "Defense" mapping handles the post-strip DoD case where
  // "DEPT OF DEFENSE" → "DEFENSE" → "Defense"; the literal "Dept Of Defense"
  // entry per spec is also present for any pre-strip variant.
  const agencyShort = (raw: string | null): string => {
    if (!raw || !raw.trim()) return "—";
    let s = raw.split("·")[0].trim();
    s = s.replace(/,\s*DEPARTMENT\s+OF\s+THE\s*$/i, "").trim();
    s = s.replace(/,\s*DEPARTMENT\s+OF\s*$/i, "").trim();
    s = s.replace(/,\s*DEPT\s+OF\s*$/i, "").trim();
    s = s.replace(/^DEPARTMENT\s+OF\s+/i, "").trim();
    s = s.replace(/^DEPT\s+OF\s+/i, "").trim();
    if (!s) return "—";
    const titled = s.replace(/\w\S*/g, caseToken);
    const shortMap: Record<string, string> = {
      "Defense": "Dept of Defense",
      "Dept Of Defense": "Dept of Defense",
      "Veterans Affairs": "VA",
      "Health And Human Services": "HHS",
      "Homeland Security": "DHS",
      "Transportation": "DOT",
      "Agriculture": "USDA",
      "Interior": "DOI",
      "Justice": "DOJ",
      "Energy": "DOE",
      "Commerce": "DOC",
      "Labor": "DOL",
      "National Aeronautics And Space Administration": "NASA",
      "General Services Administration": "GSA"
    };
    return shortMap[titled] ?? titled;
  };

  // FA-89 display helpers — strip SAM PSC prefix (e.g. "N083--", "Y1BG--") and
  // title-case the result so the demo shows readable solicitation titles.
  const cleanTitle = (raw: string | null): string => {
    if (!raw) return "—";
    const stripped = raw.replace(/^[A-Z0-9]{2,6}--\s*/i, "");
    return stripped.replace(/\w\S*/g, caseToken);
  };

    const oppRows = useMemo(() => {
    let rows = enriched.filter((r) => !!r.row.solicitation_number);
    if (naics && naics !== "all") {
      rows = rows.filter((r) => r.row.naics_code === naics);
    }
    if (oppSearch.trim()) {
      const q = oppSearch.toLowerCase();
      rows = rows.filter((r) =>
        (r.row.title ?? "").toLowerCase().includes(q) ||
        (r.row.title_plain ?? "").toLowerCase().includes(q) ||
        (r.row.agency ?? "").toLowerCase().includes(q) ||
        (r.row.solicitation_number ?? "").toLowerCase().includes(q) ||
        (r.row.notice_id ?? "").toLowerCase().includes(q)
      );
    }
    if (oppSetAside !== "All") {
      rows = rows.filter((r) => r.saLabel === oppSetAside);
    }
    if (oppDeadline === "active")  rows = rows.filter((r) => r.daysNum == null || r.daysNum >= 0);
    if (oppDeadline === "<=3")     rows = rows.filter((r) => r.daysNum != null && r.daysNum >= 0 && r.daysNum <= 3);
    if (oppDeadline === "<=7")     rows = rows.filter((r) => r.daysNum != null && r.daysNum >= 0 && r.daysNum <= 7);
    if (oppDeadline === "<=30")    rows = rows.filter((r) => r.daysNum != null && r.daysNum >= 0 && r.daysNum <= 30);
    if (oppDeadline === "expired") rows = rows.filter((r) => r.daysNum != null && r.daysNum < 0);
    if (oppDeadline === "watched") rows = rows.filter((r) => r.row.watched === true);
    if (oppValue === "<100k")     rows = rows.filter((r) => r.row.award_ceiling != null && r.row.award_ceiling < 100000);
    if (oppValue === "100k-500k") rows = rows.filter((r) => r.row.award_ceiling != null && r.row.award_ceiling >= 100000 && r.row.award_ceiling <= 500000);
    if (oppValue === "500k-1m")   rows = rows.filter((r) => r.row.award_ceiling != null && r.row.award_ceiling > 500000 && r.row.award_ceiling <= 1000000);
    if (oppValue === ">1m")       rows = rows.filter((r) => r.row.award_ceiling != null && r.row.award_ceiling > 1000000);
    const riskOrder: Record<string, number> = { rp0: 0, rp1: 1, rp2: 2, "": 3 };
    rows = [...rows].sort((a, b) => {
      if (oppSort.key === "risk" || oppSort.key === "signal") {
        const rDiff = (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3);
        if (rDiff !== 0) return oppSort.dir === "asc" ? rDiff : -rDiff;
        return (a.daysNum ?? 9999) - (b.daysNum ?? 9999);
      }
      if (oppSort.key === "deadline") {
        const d = (a.daysNum ?? 9999) - (b.daysNum ?? 9999);
        return oppSort.dir === "asc" ? d : -d;
      }
      if (oppSort.key === "posted") {
        const d = new Date(a.row.created_at ?? 0).getTime() - new Date(b.row.created_at ?? 0).getTime();
        return oppSort.dir === "asc" ? d : -d;
      }
      if (oppSort.key === "agency") {
        return oppSort.dir === "asc"
          ? (a.row.agency ?? "").localeCompare(b.row.agency ?? "")
          : (b.row.agency ?? "").localeCompare(a.row.agency ?? "");
      }
      if (oppSort.key === "title") {
        return oppSort.dir === "asc"
          ? (a.row.title ?? "").localeCompare(b.row.title ?? "")
          : (b.row.title ?? "").localeCompare(a.row.title ?? "");
      }
      return 0;
    });
    return rows;
  }, [enriched, naics, oppSearch, oppSetAside, oppDeadline, oppValue, oppSort]);

  const p0Rows = filtered.filter((r) => r.risk === "rp0");
  const otherRows = filtered.filter((r) => r.risk !== "rp0");

  const stats = useMemo(() => {
    const total = enriched.length;
    const p0 = enriched.filter((r) => r.risk === "rp0").length;
    const exp = enriched.filter((r) => r.daysNum != null && r.daysNum >= 0 && r.daysNum <= 7).length;
    return { total, p0, exp };
  }, [enriched]);

  // Audit-derived P0 count for the situation card header. Different data
  // source than stats.p0 (which counts queue opportunities); the cards
  // below render badges from recentAudits, so the counter must read the
  // same source to stay consistent.
  const auditP0Count = useMemo(
    () => recentAudits.filter((a) => a.compliance_score != null && a.compliance_score < 40).length,
    [recentAudits]
  );

  const pipelineCount = useMemo(
    () => recentAudits.filter((a) => a.in_pipeline === true).length,
    [recentAudits]
  );

  const initials = (user.email[0] || "?").toUpperCase() + (user.email.split("@")[0]?.[1] || "").toUpperCase();
  const handle = (user.email.split("@")[0] || "").slice(0, 18);

  // Conditional return AFTER all hooks have executed — preserves hook order across
  // mount/post-mount renders. Returning null pre-hydration matches the SSR output
  // (no DOM diff), then the effect flips `mounted` and the real tree renders.
  if (!mounted) return null;

  return (
    <div className="bd-home">
      <div className="app">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="tb-brand">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L24 7V15C24 20.5 19.5 25 14 26C8.5 25 4 20.5 4 15V7L14 2Z" stroke="#C9A84C" strokeWidth="1.4" fill="rgba(201,168,76,.1)" opacity=".9"/>
              <line x1="10" y1="13" x2="18" y2="13" stroke="#C9A84C" strokeWidth=".9" opacity=".7"/>
              <line x1="10" y1="16" x2="16" y2="16" stroke="#C9A84C" strokeWidth=".9" opacity=".5"/>
            </svg>
            <div className="tb-wordmark">FAR<span>audit</span></div>
          </div>
          <div className="tb-center">
            <div className="tb-stats">
              {counter.audits.toLocaleString()} solicitations audited · {counter.traps.toLocaleString()} traps detected
            </div>
          </div>
          <div className="tb-right">
            <div className="tb-live"><div className="live-dot" />Live · <span>{stats.total}</span> Active</div>
            <FeedbackWidget userEmail={user.email ?? null} />
            <a className="tb-user" href="/home" title={user.email}>
              <div className="user-av">{initials || "U"}</div>
              <div className="user-nm">{handle || "user"}</div>
            </a>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="sidebar">
          {/* GROUP 1 — Daily */}
          <div className="nav-label">Daily</div>
          <button className={`nav-item ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Today
          </button>
          <button className={`nav-item ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M4 2h8l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <line x1="6" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/>
              <line x1="6" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity=".5"/>
            </svg>
            Run Audit
            <span className="nav-ct ct-gold">New</span>
          </button>
          <button className={`nav-item ${tab === "past-audits" ? "active" : ""}`} onClick={() => setTab("past-audits")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Past Audits
            <span className="nav-ct ct-gold">{recentAudits.length}</span>
          </button>
          <button className={`nav-item ${tab === "pipeline" ? "active" : ""}`} onClick={() => setTab("pipeline")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <polyline points="2,11 5,7 8,9 11,4 14,6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Pipeline
            {pipelineCount > 0 && <span className="nav-ct ct-red">{pipelineCount}</span>}
          </button>

          {/* GROUP 2 — Find & Track */}
          <div className="nav-label">Find &amp; Track</div>
          <button className={`nav-item ${tab === "opportunities" ? "active" : ""}`} onClick={() => setTab("opportunities")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Opportunities
            <span className="nav-ct ct-green">Live</span>
          </button>
          <button className={`nav-item ${tab === "capability" ? "active" : ""}`} onClick={() => setTab("capability")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Capability Statement
          </button>

          {/* GROUP 3 — Market Intel */}
          <div className="nav-label">Market Intel</div>
          <button className={`nav-item ${tab === "news" ? "active" : ""}`} onClick={() => setTab("news")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M2 2h12v2L8 10 2 4V2z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Defense Intel
          </button>
          <button className={`nav-item ${tab === "agencies" ? "active" : ""}`} onClick={() => setTab("agencies")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M2 14h12M3 14V6l5-3 5 3v8M6 14V9h4v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Defense Agencies
            {agencies.length > 0 && <span className="nav-ct ct-gold">{agencies.length}</span>}
          </button>
          <button className={`nav-item ${tab === "contracting-officers" ? "active" : ""}`} onClick={() => setTab("contracting-officers")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M3 14c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Contracting Officers
            {kos.length > 0 && <span className="nav-ct ct-gold">{kos.length}</span>}
          </button>

          {/* GROUP 4 — Compliance */}
          <div className="nav-label">Compliance</div>
          <button className={`nav-item ${tab === "cmmc" ? "active" : ""}`} onClick={() => setTab("cmmc")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L13 4V8C13 11 11 13 8 14C5 13 3 11 3 8V4L8 2Z" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 8l1.5 1.5L10 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            CMMC Readiness
          </button>
          <button className={`nav-item ${tab === "teaming" ? "active" : ""}`} onClick={() => setTab("teaming")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M2 13c0-2 1.5-3 3-3s3 1 3 3M8 13c0-2 1.5-3 3-3s3 1 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Teaming Partners
          </button>

          {/* GROUP 5 — Reference */}
          <div className="nav-label">Reference</div>
          <button className="nav-item" onClick={() => router.push("/naics")}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h10"/>
            </svg>
            NAICS Codes
          </button>
          <button className={`nav-item ${tab === "regulatory" ? "active" : ""}`} onClick={() => setTab("regulatory")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M4 2h6l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <line x1="6" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="6" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            FAR/DFARS Updates
          </button>
          <button className={`nav-item ${tab === "wages" ? "active" : ""}`} onClick={() => setTab("wages")}>
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
              <path d="M2 13h12M3 13V8h2v5M7 13V5h2v8M11 13v-3h2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Wage Benchmarks
          </button>

          {/* ACCOUNT — avatar menu (replaces old Account nav group) */}
          <div className="nav-avatar-wrap">
            <button className="nav-avatar-btn" onClick={() => setAcctMenuOpen(v => !v)} aria-haspopup="true" aria-expanded={acctMenuOpen}>
              <span className="nav-avatar">JR</span><span className="nav-avatar-name">Jose Rodriguez</span>
            </button>
            {acctMenuOpen && (
              <div className="nav-avatar-menu">
                <button className="nav-am-item" onClick={() => router.push("/settings")}>Profile &amp; Settings</button>
                <SignOutButton />
              </div>
            )}
          </div>

          <div className="sb-footer">
            <div className="sb-plan">Design Partner · $1,250/mo</div>
            <div className="sb-days">Free during T1 sprint</div>
            <a href="/pricing" className="sb-upgrade" style={{ display: "block", textDecoration: "none" }}>Upgrade to Standard</a>
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          {/* PAGE TABS */}
          <div className="page-tabs">
            <button className={`ptab ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
              <div className="ptab-dot red" />Today
            </button>
            <button className={`ptab ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
              <div className="ptab-dot gold" />Run Audit
            </button>
            <button className={`ptab ${tab === "opportunities" ? "active" : ""}`} onClick={() => setTab("opportunities")}>
              <div className="ptab-dot green" />Opportunities
              <span className="ptab-count green">{stats.total}</span>
            </button>
            <button className={`ptab ${tab === "defense-spending" ? "active" : ""}`} onClick={() => setTab("defense-spending")}>
              <div className="ptab-dot blue" />Defense Spending
            </button>
            <button className={`ptab ${tab === "news" ? "active" : ""}`} onClick={() => setTab("news")}>
              <div className="ptab-dot red" />Defense News
            </button>
            <button className={`ptab ${tab === "pipeline" ? "active" : ""}`} onClick={() => setTab("pipeline")}>
              <div className="ptab-dot gold" />Pipeline
              {stats.p0 > 0 && <span className="ptab-count gold">{stats.p0}</span>}
            </button>
          </div>

          {/* TAB PANELS */}
          <div className="tab-panels">
            {/* HOME */}
            <div className={`tab-panel ${tab === "home" ? "active" : ""}`}>
              <div className="situation-board">
                <button className="sit-card urgent" onClick={() => { setPastAuditsFilter("p0"); setTab("past-audits"); }}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--red)", marginBottom: 8 }}>⚠ Critical — Act Today</div>
                  {auditP0Count === 0 && recentAudits.length === 0 ? (
                    <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--gold)", lineHeight: 1.4, padding: "8px 0" }}>Run your first audit to see traps.</div>
                  ) : auditP0Count === 0 ? (
                    <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--green)", lineHeight: 1.4, padding: "8px 0" }}>0 high-severity traps in your recent audits.</div>
                  ) : (
                    <div className="sit-value red">{auditP0Count}</div>
                  )}
                  <div className="sit-sub" style={{ fontSize: 11, color: "rgba(245,240,232,.85)", lineHeight: 1.55, marginTop: 6 }}>Solicitations with compliance traps that could disqualify your bid or cost you money on delivery.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--red)", marginTop: 10, borderTop: "1px solid rgba(220,38,38,.15)", paddingTop: 8 }}>Review P0 Flags →</div>
                </button>
                <button className="sit-card" style={{ borderTop: "3px solid var(--amber)" }} onClick={() => setFilter("≤7 Days")}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--amber)", marginBottom: 8 }}>⏱ Expiring This Week</div>
                  <div className="sit-value gold">{stats.exp}</div>
                  <div className="sit-sub" style={{ fontSize: 11, color: "rgba(245,240,232,.85)", lineHeight: 1.55, marginTop: 6 }}>Submission deadlines closing in 7 days or less. Missed windows are permanent — no extensions after closing time.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--amber)", marginTop: 10, borderTop: "1px solid rgba(245,158,11,.15)", paddingTop: 8 }}>View Expiring →</div>
                </button>
                <button className="sit-card" style={{ borderTop: "3px solid var(--gold)" }} onClick={() => setTab("opportunities")}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--gold2)", marginBottom: 8 }}>● Live on SAM.gov Now</div>
                  <div className="sit-value gold">{stats.total}</div>
                  <div className="sit-sub" style={{ fontSize: 11, color: "rgba(245,240,232,.85)", lineHeight: 1.55, marginTop: 6 }}>Active federal solicitations posted right now across your NAICS codes. Updated by sam-ingest cron — every one is a potential contract.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gold)", marginTop: 10, borderTop: "1px solid rgba(201,168,76,.15)", paddingTop: 8 }}>Open SAM.gov Feed →</div>
                </button>
                <button className="sit-card" style={{ borderTop: "3px solid var(--green)" }} onClick={() => setTab("past-audits")}>
                  <div className="sit-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--green)", marginBottom: 8 }}>✓ Your Audit Activity</div>
                  <div className="sit-value green">{counter.audits}</div>
                  <div className="sit-sub" style={{ fontSize: 11, color: "rgba(245,240,232,.85)", lineHeight: 1.55, marginTop: 6 }}>Audits completed total. {counter.traps} compliance traps caught — every clause read, every trap flagged, every KO email drafted.</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--green)", marginTop: 10, borderTop: "1px solid rgba(74,222,128,.15)", paddingTop: 8 }}>View Recent Audits →</div>
                </button>
              </div>

              {/* Upload bar */}
              <button className="upload-bar" onClick={() => setTab("audit")}>
                <div className="upload-icon-wrap">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2v11M6 6l4-4 4 4" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
                  </svg>
                </div>
                <div className="upload-copy">
                  <div className="upload-hed">Start a New Audit — Drop Any Solicitation PDF</div>
                  <div className="upload-sub">FARaudit reads every clause · FAR · DFARS · Section L · Section M · CLIN Structure · P0/P1/P2 risk ranking · KO email drafted</div>
                  <div className="upload-tags">
                    <span className="utag">RFQ</span><span className="utag">RFP</span><span className="utag">IDIQ</span><span className="utag">IFB</span><span className="utag">Any Page Count</span><span className="utag">Any Agency</span>
                  </div>
                </div>
                <span className="upload-cta-btn">Run Audit →</span>
              </button>

              {/* Two col body */}
              <div className="two-col">
                <div className="feed-wrap">
                  <div className="feed-hdr">
                    <div className="feed-hdr-l">
                      <div className="feed-title">Intelligence Feed</div>
                      <div className="feed-sub">Filtered to your NAICS · {feedTs}</div>
                    </div>
                    <div className="live-chip"><div className="live-dot" />LIVE</div>
                  </div>
                  <div className="feed-filters">
                    {FILTERS.map((f) => (
                      <button key={f} className={`ff ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
                    ))}
                  </div>
                  <div className="feed-cols">
                    <div className="fcol">NAICS</div><div className="fcol">Solicitation</div>
                    <div className="fcol">Agency</div><div className="fcol">Days</div>
                    <div className="fcol">Type</div><div className="fcol">Set-Aside</div>
                    <div className="fcol">Risk</div>
                  </div>
                  <div className="feed-scroll">
                    {filtered.length === 0 && (
                      <div className="empty-state">
                        {opportunities.length === 0
                          ? `Feed populates daily at 06:00 CDT · sam-ingest cron next run in ${hoursUntilNextSamIngest()} hour${hoursUntilNextSamIngest() === 1 ? "" : "s"}`
                          : "No solicitations match this filter."}
                      </div>
                    )}
                    {p0Rows.length > 0 && filter === "All" && (
                      <div className="feed-section-hdr">
                        <div className="fsh-label">⚠ Requires Immediate Action</div>
                        <div className="fsh-count">{p0Rows.length} P0</div>
                      </div>
                    )}
                    {p0Rows.filter((r) => r.row.solicitation_number).map((r) => <FeedRowCmp key={r.row.id} r={r} onClick={() => {
                      setAuditPrefill({
                        // solicitation_number is guaranteed non-null by the
                        // upstream .filter() — pre-solicitation notices without
                        // a real sol# are filtered out of the feed entirely so
                        // the demo never lands on a UUID prefill.
                        notice_id: r.row.solicitation_number as string,
                        title: r.row.title ?? null,
                        agency: r.row.agency ?? null,
                        naics_code: r.row.naics_code ?? null
                      });
                      setTab("audit");
                    }} />)}
                    {otherRows.filter((r) => r.row.solicitation_number).map((r) => <FeedRowCmp key={r.row.id} r={r} onClick={() => {
                      setAuditPrefill({
                        notice_id: r.row.solicitation_number as string,
                        title: r.row.title ?? null,
                        agency: r.row.agency ?? null,
                        naics_code: r.row.naics_code ?? null
                      });
                      setTab("audit");
                    }} />)}
                  </div>
                </div>

                <div className="right-col">
                  <div className="rc-section">
                    <div className="rc-hdr"><div className="rc-title">Recent Audits</div><div className="rc-sub">Last {Math.min(5, recentAudits.length)}</div></div>
                    {recentAudits.length === 0 && (
                      <div className="empty-state">No audits yet.</div>
                    )}
                    <div className="ra-dark ra-list">
                    {recentAudits.slice(0, 5).map((a) => {
                      // FA-167 — Design-lead "Recently Audited" card. Whole card
                      // links to the report; verdict drives badge + pill colour
                      // from the spec --vd-* tokens (one is-* class).
                      const v = raVerdict(a);
                      const insight = raInsight(a);
                      const office = a.office_display || "";
                      const sol = displaySolicitationId(a) || "—";
                      const hasScore = a.compliance_score != null;
                      return (
                        <a key={a.id} className={`rac ${v.cls}`} href={auditHref(a)}>
                          <div className="rac-badge">
                            <span className="rac-score">{hasScore ? a.compliance_score : "—"}</span>
                            {hasScore && <span className="rac-of">/ 100</span>}
                          </div>
                          <div className="rac-main">
                            <div className="rac-metarow">
                              <span className="rac-id">{sol}</span>
                              {office && <span className="rac-office">{office}</span>}
                            </div>
                            <div className="rac-title">{auditDisplayName(a)}</div>
                            {insight && (
                              <div className="rac-insight"><span className="rac-spark" />{insight}</div>
                            )}
                          </div>
                          <div className="rac-right">
                            <span className="rac-pill"><span className="rac-pill-dot" />{v.label}</span>
                            <span className="rac-ago">{timeAgo(a.created_at)}</span>
                            <span className="rac-chev">→</span>
                          </div>
                        </a>
                      );
                    })}
                    </div>
                  </div>
                  <div className="rc-section">
                    <div className="rc-hdr"><div className="rc-title">Account Intelligence</div></div>
                    <div className="acct-grid">
                      <div className="acct-stat"><div className="as-n">{counter.audits}</div><div className="as-l">Audits Run</div></div>
                      <div className="acct-stat"><div className="as-n red">{counter.traps}</div><div className="as-l">Traps Caught</div></div>
                      <div className="acct-stat"><div className="as-n">$0</div><div className="as-l">audited · pending first solicitation</div></div>
                      <div className="acct-stat"><div className="as-n green">$0</div><div className="as-l">Compliance Risk</div></div>
                    </div>
                    <div className="days-wrap">
                      <div className="days-top"><span className="days-lbl">Design Partner Period</span><span className="days-val">62d left</span></div>
                      <div className="days-track"><div className="days-fill" /></div>
                    </div>
                  </div>
                  <CustomerMetricsCard counter={counter} recentAudits={recentAudits} />
                </div>
              </div>
            </div>

            {/* AUDIT */}
            <div className={`tab-panel ${tab === "audit" ? "active" : ""}`}>
              <RunAuditPanel prefill={auditPrefill} active={tab === "audit"} onPrefillClear={() => setAuditPrefill(null)} />
            </div>

            {/* SAM */}
            <div className={`tab-panel ${tab === "opportunities" ? "active" : ""}`}>
              <div className="intel-tab-content">
                <div className="intel-section">
                  <div className="is-header">
                    <div className="is-title">SAM.gov · Live Opportunity Feed</div>
                    <div className="is-refresh">
                      <NaicsCombobox
                        value={naics === "all" ? "" : naics}
                        onChange={(c) => setNaics(c || "all")}
                        options={naicsOptions}
                        includeAll
                      />
                      <span>Last updated <span>{feedTs}</span> · {oppRows.length} matching</span>
                    </div>
                  </div>

                  {/* KPI strip — totals from the unfiltered enriched set */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                    {[
                      { label: "Active", value: enriched.filter((r) => !!r.row.solicitation_number && (r.daysNum == null || r.daysNum >= 0)).length, color: "var(--text)" },
                      { label: "P0 Risk", value: enriched.filter((r) => r.risk === "rp0").length, color: "var(--red)" },
                      { label: "Expiring ≤7d", value: enriched.filter((r) => r.daysNum != null && r.daysNum >= 0 && r.daysNum <= 7).length, color: "var(--amber)" },
                      { label: "In Pipeline", value: opportunities.filter((o) => o.in_pipeline === true).length, color: "var(--blue)" }
                    ].map((k) => (
                      <div key={k.label} style={{ background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 14px" }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 2 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* FA-89i CHANGE 1: collapsible filter bar — search always visible,
                       chip rows hidden by default behind a FILTERS toggle. */}
                  {(() => {
                    const anyActive = oppSetAside !== "All" || oppDeadline !== "active" || oppValue !== "all";
                    return (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <input
                          type="text"
                          placeholder="Search by title, agency, or solicitation number..."
                          value={oppSearch}
                          onChange={(e) => setOppSearch(e.target.value)}
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: ".5px solid var(--border2)",
                            background: "var(--void3)",
                            color: "var(--text)",
                            outline: "none"
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setFiltersOpen((v) => !v)}
                          style={{
                            fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
                            letterSpacing: ".08em", textTransform: "uppercase",
                            color: anyActive ? "var(--amber)" : "var(--t40)",
                            background: "transparent", border: "none", cursor: "pointer",
                            padding: "4px 8px", display: "flex", alignItems: "center", gap: 4
                          }}
                        >
                          Filters {filtersOpen ? "▲" : "▼"}{anyActive && <span style={{ color: "var(--amber)", fontSize: 14, lineHeight: 1 }}>•</span>}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Chip rows — collapsed by default */}
                  {filtersOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>

                    {/* Set-aside filter */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--t40)", whiteSpace: "nowrap", minWidth: 70 }}>
                        Set-Aside
                      </span>
                      {([
                        ["All", "All"],
                        ["SB", "Small Business"],
                        ["SDVOSB", "Service-Disabled Veteran"],
                        ["WOSB", "Women-Owned"],
                        ["8(a)", "8(a) Program"],
                        ["HUBZone", "HUBZone"]
                      ] as const).map(([val, lbl]) => {
                        const active = oppSetAside === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setOppSetAside(val)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              border: active ? "1px solid var(--blue)" : "1px solid var(--border)",
                              background: active ? "rgba(96,165,250,.14)" : "transparent",
                              color: active ? "var(--blue)" : "var(--t40)",
                              transition: "all .15s"
                            }}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>

                    {/* Deadline filter */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--t40)", whiteSpace: "nowrap", minWidth: 70 }}>
                        Deadline
                      </span>
                      {([
                        ["active", "Active"],
                        ["all", "All (incl. expired)"],
                        ["<=3", "≤ 3 Days"],
                        ["<=7", "≤ 7 Days"],
                        ["<=30", "≤ 30 Days"],
                        ["expired", "Expired"],
                        ["watched", "Watched"]
                      ] as const).map(([val, lbl]) => {
                        const active = oppDeadline === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setOppDeadline(val)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              border: active ? "1px solid var(--amber)" : "1px solid var(--border)",
                              background: active ? "rgba(245,158,11,.14)" : "transparent",
                              color: active ? "var(--amber)" : "var(--t40)",
                              transition: "all .15s"
                            }}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>

                    {/* Value filter */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--t40)", whiteSpace: "nowrap", minWidth: 70 }}>
                        Value
                      </span>
                      {([
                        ["all", "All"],
                        ["<100k", "Under $100K"],
                        ["100k-500k", "$100K–$500K"],
                        ["500k-1m", "$500K–$1M"],
                        [">1m", "Over $1M"]
                      ] as const).map(([val, lbl]) => {
                        const active = oppValue === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setOppValue(val)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              border: active ? "1px solid var(--green)" : "1px solid var(--border)",
                              background: active ? "rgba(16,185,129,.14)" : "transparent",
                              color: active ? "var(--green)" : "var(--t40)",
                              transition: "all .15s"
                            }}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>

                  </div>
                  )}

                  {/* Sortable column header — FA-89i: 7 cols (DEADLINE+RISK merged into SIGNAL) */}
                  <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 150px 90px 110px 100px 180px", gap: 8, padding: "8px 10px", fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--t40)", borderBottom: "1px solid var(--border)" }}>
                    {[
                      { key: "sol",       label: "Sol #",     sortable: false },
                      { key: "title",     label: "Title / AI Summary", sortable: true },
                      { key: "agency",    label: "Agency",    sortable: true },
                      { key: "set-aside", label: "Set-Aside", sortable: false },
                      { key: "signal",    label: "Signal",    sortable: true },
                      { key: "audit",     label: "Audit",     sortable: false },
                      { key: "actions",   label: "Actions",   sortable: false }
                    ].map((col) => (
                      <div
                        key={col.key}
                        onClick={() => {
                          if (!col.sortable) return;
                          setOppSort((s) => s.key === col.key ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: "asc" });
                        }}
                        style={{ cursor: col.sortable ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, userSelect: "none" }}
                      >
                        {col.label}
                        {col.sortable && oppSort.key === col.key && <span style={{ fontSize: 8, color: "var(--gold)" }}>{oppSort.dir === "asc" ? "↑" : "↓"}</span>}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div style={{ maxHeight: "calc(100vh - 360px)", overflowY: "auto", paddingBottom: 20 }}>
                    {oppRows.length === 0 && (
                      <div className="empty-state">
                        {opportunities.length === 0
                          ? `Feed populates daily at 06:00 CDT · sam-ingest cron next run in ${hoursUntilNextSamIngest()} hour${hoursUntilNextSamIngest() === 1 ? "" : "s"}`
                          : "No opportunities match your filters."}
                      </div>
                    )}
                    {oppRows.map((r) => {
                      const solNum = r.row.solicitation_number as string;
                      const agency = agencyShort(r.row.agency);
                      const saColors: Record<string, { bg: string; fg: string }> = {
                        SB:       { bg: "rgba(74,222,128,.14)",  fg: "var(--green)" },
                        SDVOSB:   { bg: "rgba(96,165,250,.14)",  fg: "var(--blue)" },
                        WOSB:     { bg: "rgba(168,85,247,.14)",  fg: "#C084FC" },
                        "8(a)":   { bg: "rgba(249,115,22,.14)",  fg: "#FB923C" },
                        HUBZone:  { bg: "rgba(234,179,8,.14)",   fg: "#FACC15" },
                        UNREST:   { bg: "rgba(148,163,184,.10)", fg: "var(--t60)" }
                      };
                      const saC = saColors[r.saLabel] ?? saColors.UNREST;
                      const auditColors: Record<string, { bg: string; fg: string }> = {
                        complete:   { bg: "rgba(74,222,128,.14)",  fg: "var(--green)" },
                        processing: { bg: "rgba(245,158,11,.14)",  fg: "var(--amber)" },
                        failed:     { bg: "rgba(220,38,38,.14)",   fg: "var(--red)" },
                        pending:    { bg: "rgba(148,163,184,.10)", fg: "var(--t60)" },
                        none:       { bg: "transparent",           fg: "var(--t40)" }
                      };
                      const auC = auditColors[r.auditStatusCls] ?? auditColors.none;
                      const dlColors: Record<string, string> = { urg: "var(--red)", soon: "var(--amber)", ok: "var(--t60)", exp: "var(--t40)", none: "var(--t40)" };
                      const rc = r.risk === "rp0" ? "var(--red)" : r.risk === "rp1" ? "var(--amber)" : r.risk === "rp2" ? "var(--blue)" : "var(--gold)";
                      const rb = r.risk === "rp0" ? "rgba(220,38,38,.14)" : r.risk === "rp1" ? "rgba(245,158,11,.11)" : r.risk === "rp2" ? "rgba(96,165,250,.10)" : "rgba(201,168,76,.08)";

                      const onOpenAudit = () => {
                        setAuditPrefill({
                          notice_id: solNum,
                          title: r.row.title ?? null,
                          agency: r.row.agency ?? null,
                          naics_code: r.row.naics_code ?? null
                        });
                        setTab("audit");
                      };

                      const togglePatch = async (field: "in_pipeline" | "watched") => {
                        const next = !r.row[field];
                        updateOpportunity(r.row.notice_id, { [field]: next });
                        // FA-89h: in_pipeline now routes through dedicated pin/unpin
                        // endpoints that also create a stub audit row so the row
                        // appears in the Pipeline Kanban. Watched still uses the
                        // generic PATCH endpoint — single-table flip only.
                        const url =
                          field === "in_pipeline" && next === true
                            ? `/api/opportunities/${encodeURIComponent(r.row.notice_id)}/pin`
                          : field === "in_pipeline" && next === false
                            ? `/api/opportunities/${encodeURIComponent(r.row.notice_id)}/unpin`
                          : `/api/opportunities/${encodeURIComponent(r.row.notice_id)}`;
                        const method = field === "in_pipeline" ? "POST" : "PATCH";
                        const body = field === "in_pipeline" ? "{}" : JSON.stringify({ [field]: next });
                        try {
                          const res = await fetch(url, {
                            method,
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body
                          });
                          if (!res.ok) {
                            // FA-89h.1: surface partial-failure details from the
                            // pin/unpin saga response so silent half-states are
                            // visible during testing instead of disappearing
                            // into a generic optimistic rollback.
                            if (field === "in_pipeline") {
                              try {
                                const detail = await res.json();
                                console.warn(`[togglePatch] ${next ? "pin" : "unpin"} failed for ${r.row.notice_id}: status=${res.status}`, detail);
                              } catch {
                                console.warn(`[togglePatch] ${next ? "pin" : "unpin"} failed for ${r.row.notice_id}: status=${res.status} (no JSON body)`);
                              }
                            }
                            updateOpportunity(r.row.notice_id, { [field]: !next });
                            return;
                          }
                          // FA-89i FIX 5: refresh page Server Component so the
                          // Pipeline Kanban picks up the new/removed stub audit
                          // row immediately. Pairs with the initialRecentAudits
                          // sync useEffect at the top of HomeClient.
                          if (field === "in_pipeline") {
                            router.refresh();
                          }
                          // Flash "Pinned ✓ → View in Pipeline" for ~2s on pipeline pin success.
                          if (field === "in_pipeline" && next === true) {
                            const ts = Date.now();
                            setPinConfirmedAt((prev) => ({ ...prev, [r.row.notice_id]: ts }));
                            setTimeout(() => {
                              setPinConfirmedAt((prev) => {
                                if (prev[r.row.notice_id] !== ts) return prev;
                                const nextMap = { ...prev };
                                delete nextMap[r.row.notice_id];
                                return nextMap;
                              });
                            }, 2000);
                          }
                        } catch {
                          updateOpportunity(r.row.notice_id, { [field]: !next });
                        }
                      };
                      const isJustPinned = pinConfirmedAt[r.row.notice_id] != null && Date.now() - pinConfirmedAt[r.row.notice_id] < 2000;

                      const isHovered = hoveredRowId === r.row.notice_id;
                      // FA-PIEE-01: PIEE-hosted solicitations can't be auto-fetched.
                      const isPiee = isPieeUrl(r.row.pdf_url ?? "");
                      return (
                        <Fragment key={r.row.id}>
                        <div
                          onMouseEnter={() => setHoveredRowId(r.row.notice_id)}
                          onMouseLeave={() => setHoveredRowId((curr) => curr === r.row.notice_id ? null : curr)}
                          style={{
                            display: "grid", gridTemplateColumns: "130px 1fr 150px 90px 110px 100px 180px", gap: 8,
                            padding: "8px 10px", borderBottom: "1px solid var(--border)", alignItems: "center",
                            background: r.row.in_pipeline ? "rgba(96,165,250,.06)" : r.row.watched ? "rgba(245,158,11,.04)" : "transparent",
                            transition: "background .15s"
                          }}
                        >
                          <span onClick={onOpenAudit} title={r.row.title || displaySolicitationId(r.row)} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--gold)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{displaySolicitationId(r.row)}</span>
                          <div onClick={onOpenAudit} title={r.row.title || ""} style={{ display: "flex", flexDirection: "column", gap: 1, overflow: "hidden", cursor: "pointer", minWidth: 0 }}>
                            {isPiee && (
                              <span style={{ alignSelf: "flex-start", fontSize: 8, background: "rgba(168,85,247,.15)", color: "#C084FC", padding: "1px 5px", borderRadius: 2, marginBottom: 2, fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: ".08em", lineHeight: 1, flexShrink: 0 }} title="Hosted on PIEE — manual download + upload required">PIEE</span>
                            )}
                            {r.row.title_plain ? (
                              <>
                                <div style={{ display: "flex", alignItems: "baseline", overflow: "hidden" }}>
                                  <span style={{ fontSize: 8, background: "rgba(96,165,250,.15)", color: "var(--blue)", padding: "1px 4px", borderRadius: 2, marginRight: 4, fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: ".08em", flexShrink: 0, lineHeight: 1 }}>AI</span>
                                  <span style={{ fontFamily: "var(--serif)", fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.row.title_plain}</span>
                                </div>
                                <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontStyle: "italic", color: "var(--t40)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanTitle(r.row.title)}</span>
                              </>
                            ) : (
                              <span style={{ fontFamily: "var(--serif)", fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanTitle(r.row.title)}</span>
                            )}
                          </div>
                          <span title={r.row.agency || ""} style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agency}</span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 2, background: saC.bg, color: saC.fg, textAlign: "center", letterSpacing: ".04em" }}>{({ SB: "Small Business", SDVOSB: "Serv-Disabled Vet", WOSB: "Women-Owned", "8(a)": "8(a) Program", HUBZone: "HUBZone", UNREST: "Unrestricted" } as Record<string, string>)[r.saLabel] ?? r.saLabel}</span>
                          {/* FA-89i: merged SIGNAL cell — daysLabel above, risk pill below */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifySelf: "center", justifyContent: "center", gap: 3 }}>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: dlColors[r.daysCls] ?? "var(--t40)", textAlign: "center", lineHeight: 1 }}>{r.daysLabel}</span>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: rb, color: rc, border: `1px solid ${rc}40`, lineHeight: 1, letterSpacing: ".06em" }}>{r.riskLabel || "—"}</span>
                          </div>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 2, background: auC.bg, color: auC.fg, textAlign: "center", justifySelf: "center", display: "inline-flex", justifyContent: "center", alignItems: "center" }}>{r.auditStatusLabel}</span>
                          {/* FA-89i CHANGE 3: Audit always-visible primary; Watch + Pipeline reveal on hover.
                              Pinned ✓ flash + already-pinned/watched states stay visible so user can see active state at a glance. */}
                          {(() => {
                            const watched = r.row.watched === true;
                            const pinned  = r.row.in_pipeline === true;
                            // Hover-conditioned visibility on the secondary actions —
                            // but keep them visible when active so the row reflects state.
                            const showWatch = isHovered || watched;
                            const showPipe  = isHovered || pinned || isJustPinned;
                            return (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onOpenAudit(); }}
                                  style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", padding: "3px 8px", borderRadius: 2, cursor: "pointer", background: "var(--gold)", color: "var(--void)", border: "1px solid var(--gold)" }}
                                >
                                  Audit →
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); togglePatch("watched"); }}
                                  style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", padding: "3px 8px", borderRadius: 2, cursor: "pointer", background: watched ? "rgba(245,158,11,.14)" : "transparent", color: watched ? "var(--amber)" : "var(--t60)", border: `1px solid ${watched ? "rgba(245,158,11,.5)" : "var(--border2)"}`, opacity: showWatch ? 1 : 0, pointerEvents: showWatch ? "auto" : "none", transition: "opacity .15s" }}
                                >
                                  {watched ? "Watching" : "Watch"}
                                </button>
                                {isJustPinned ? (
                                  <a
                                    href="/home#pipeline"
                                    onClick={(e) => { e.stopPropagation(); }}
                                    style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", padding: "3px 8px", borderRadius: 2, cursor: "pointer", background: "rgba(96,165,250,.22)", color: "var(--blue)", border: "1px solid rgba(96,165,250,.7)", textDecoration: "none", whiteSpace: "nowrap", opacity: 1, transition: "opacity .15s" }}
                                    title="Pinned to Pipeline — click to view"
                                  >
                                    Pinned ✓ → Pipeline
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); togglePatch("in_pipeline"); }}
                                    style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", padding: "3px 8px", borderRadius: 2, cursor: "pointer", background: pinned ? "rgba(96,165,250,.14)" : "transparent", color: pinned ? "var(--blue)" : "var(--t60)", border: `1px solid ${pinned ? "rgba(96,165,250,.5)" : "var(--border2)"}`, opacity: showPipe ? 1 : 0, pointerEvents: showPipe ? "auto" : "none", transition: "opacity .15s" }}
                                    title={pinned ? "View in Pipeline tab — click to unpin" : "Add to Pipeline"}
                                  >
                                    {pinned ? "Pinned" : "Pipeline"}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {/* FA-PIEE-01: manual-upload instruction on hover for PIEE-gated rows. */}
                        {isPiee && isHovered && (
                          <div style={{ padding: "6px 12px 9px 140px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(168,85,247,.04)" }}>
                            <span style={{ flexShrink: 0, fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".08em", padding: "1px 5px", borderRadius: 2, background: "rgba(168,85,247,.15)", color: "#C084FC", border: "1px solid rgba(168,85,247,.35)", lineHeight: 1.4 }}>PIEE</span>
                            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)", lineHeight: 1.5 }}>{getPieeInstructions()}</span>
                          </div>
                        )}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* BUDGET — live USAspending.gov */}
            <div className={`tab-panel ${tab === "defense-spending" ? "active" : ""}`}>
              <DefenseSpendingPanel defenseSpending={defenseSpending} naicsOptions={naicsOptions} />
            </div>

            {/* NEWS — live RSS aggregation */}
            <div className={`tab-panel ${tab === "news" ? "active" : ""}`}>
              <DefenseNewsPanel />
            </div>

            {/* PIPELINE — kanban */}
            <div className={`tab-panel ${tab === "pipeline" ? "active" : ""}`}>
              <div className="intel-tab-content">
                <div className="intel-section">
                  <div className="is-header"><div className="is-title">Pipeline Kanban</div><div className="is-refresh">Drag a card to update its outcome · auto-saves to audits.outcome</div></div>
                  <PipelineKanban
                    key={recentAudits.filter((a) => a.in_pipeline === true).length}
                    audits={recentAudits}
                  />
                </div>
                <div className="intel-section">
                  <div className="is-header"><div className="is-title">Deadline Calendar</div><div className="is-refresh">Audited solicitations · real response deadlines from SAM</div></div>
                  <DeadlineCalendar
                    rows={recentAudits.map((a) => ({
                      id: a.id,
                      notice_id: a.notice_id,
                      solicitation_number: a.solicitation_number ?? null,
                      title: a.title,
                      response_deadline: a.response_deadline ?? null,
                      created_at: a.created_at
                    }))}
                    onPick={(r) => router.push(auditHref(r))}
                  />
                </div>
              </div>
            </div>

            {/* PAST AUDITS */}
            <div className={`tab-panel ${tab === "past-audits" ? "active" : ""}`}>
              <PastAuditsPanel audits={recentAudits} filter={pastAuditsFilter} onFilterChange={setPastAuditsFilter} onAuditUpdate={updateAudit} />
            </div>

            {/* CONTRACTING OFFICERS */}
            <div className={`tab-panel ${tab === "contracting-officers" ? "active" : ""}`}>
              <KOIntelPanel kos={kos} />
            </div>

            {/* AGENCIES */}
            <div className={`tab-panel ${tab === "agencies" ? "active" : ""}`}>
              <AgencyIntelPanel agencies={agencies} />
            </div>

            {/* TEAMING PARTNERS */}
            <div className={`tab-panel ${tab === "teaming" ? "active" : ""}`}>
              <TeamingPartnersPanel naicsOptions={naicsOptions} />
            </div>

            {/* CAPABILITY STATEMENT */}
            <div className={`tab-panel ${tab === "capability" ? "active" : ""}`}>
              <CapabilityPanel />
            </div>

            {/* GAO PROTESTS */}
            <div className={`tab-panel ${tab === "protests" ? "active" : ""}`}>
              <ProtestPanel />
            </div>

            {/* FAR/DFARS UPDATES */}
            <div className={`tab-panel ${tab === "regulatory" ? "active" : ""}`}>
              <RegulatoryPanel />
            </div>

            {/* CMMC READINESS */}
            <div className={`tab-panel ${tab === "cmmc" ? "active" : ""}`}>
              <CMMCPanel />
            </div>

            {/* WAGE BENCHMARKS */}
            <div className={`tab-panel ${tab === "wages" ? "active" : ""}`}>
              <LaborRatesPanel naicsOptions={naicsOptions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Enriched {
  row: OpportunityRow;
  daysNum: number | null;
  daysCls: "urg" | "soon" | "ok" | "exp" | "none";
  daysLabel: string;
  risk: "rp0" | "rp1" | "rp2" | "";
  riskLabel: string;
  saCls: "sb" | "sd" | "wo" | "a8" | "hz" | "un";
  saLabel: string;
  auditStatusCls: "pending" | "processing" | "complete" | "failed" | "none";
  auditStatusLabel: string;
}

// Hours until the next sam-ingest cron run (06:00 CDT = 11:00 UTC).
// Returns at least 1 so the empty-state never displays "in 0 hours".
function hoursUntilNextSamIngest(): number {
  const now = new Date();
  const nextRun = new Date();
  nextRun.setUTCHours(11, 0, 0, 0);
  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }
  const hours = Math.ceil((nextRun.getTime() - now.getTime()) / 3_600_000);
  return Math.max(1, hours);
}

function enrichRow(row: OpportunityRow): Enriched {
  // Days column shows time-to-deadline (calendar days from now until
  // response_deadline). Was incorrectly computing days-since-creation, so every
  // row read "3d" because the recent backfill burst ingested most of the
  // corpus three days ago. Mirrors the daysOut math the risk classifier uses
  // so risk tier and Days display agree on the same calendar.
  // TODO(v1): classifier uses fractional daysOut, display uses Math.floor —
  // boundary rows (e.g., 3.08 days) show "3d" but classify as P1. Reconcile in
  // v1 alongside the archived_at column work for expired notices.
  const daysNum: number | null = (() => {
    if (!row.response_deadline) return null;
    const dl = Date.parse(row.response_deadline);
    if (Number.isNaN(dl)) return null;
    return Math.floor((dl - Date.now()) / 86400_000);
  })();
  const daysCls: Enriched["daysCls"] =
    daysNum == null ? "none" :
    daysNum < 0     ? "exp"  :
    daysNum <= 3    ? "urg"  :
    daysNum <= 7    ? "soon" :
                      "ok";
  const daysLabel =
    daysNum == null ? "—" :
    daysNum < 0     ? "expired" :
    daysNum === 0   ? "today" :
    daysNum === 1   ? "1d" :
                      `${daysNum}d`;

  // Risk verdict — three layers in priority order:
  //   1. Persisted classifyRisk verdict from sam-ingest / backfill (row.risk_level)
  //   2. View-time deadline escalation: ≤3d → P0, ≤7d → at least P1
  //      (mirrors helpers.ts daysOut >= 0 gate so expired deadlines don't fire;
  //      escalation only PROMOTES, never demotes)
  //   3. Audited rows w/o persisted risk_level fall back to compliance_score
  let label: "P0" | "P1" | "P2" | "Watch" = "Watch";
  if (row.risk_level === "P0" || row.risk_level === "P1" || row.risk_level === "P2" || row.risk_level === "Watch") {
    label = row.risk_level;
  } else if (row.compliance_score != null) {
    if (row.compliance_score < 40) label = "P0";
    else if (row.compliance_score < 70) label = "P1";
    else label = "P2";
  } else if (row.recommendation === "DECLINE") {
    label = "P0";
  }
  if (row.response_deadline) {
    const dl = Date.parse(row.response_deadline);
    if (!Number.isNaN(dl)) {
      const daysOut = (dl - Date.now()) / 86400000;
      if (daysOut >= 0 && daysOut <= 3) {
        label = "P0";
      } else if (daysOut >= 0 && daysOut <= 7 && (label === "Watch" || label === "P2")) {
        label = "P1";
      }
    }
  }
  const risk: Enriched["risk"] =
    label === "P0" ? "rp0" : label === "P1" ? "rp1" : label === "P2" ? "rp2" : "";
  const riskLabel = label;

  const sa = (row.set_aside || "").toLowerCase();
  let saCls: Enriched["saCls"] = "un";
  let saLabel = "UNREST";
  if (sa.includes("8(a)") || sa.includes("8a")) { saCls = "a8"; saLabel = "8(a)"; }
  else if (sa.includes("woman")) { saCls = "wo"; saLabel = "WOSB"; }
  else if (sa.includes("sdvosb") || sa.includes("service-disabled")) { saCls = "sd"; saLabel = "SDVOSB"; }
  else if (sa.includes("hubzone")) { saCls = "hz"; saLabel = "HUBZone"; }
  else if (sa.includes("small")) { saCls = "sb"; saLabel = "SB"; }

  // FA-89f: binary audit status — reads row.is_audited (cross-referenced
  // from the audits table at fetch time), NOT pending_audits.status which is
  // the ingest queue state.
  const auditEntry = row.is_audited
    ? { cls: "complete" as const, label: "Audited ✓" }
    : { cls: "pending"  as const, label: "Not Audited" };

  return { row, daysNum, daysCls, daysLabel, risk, riskLabel, saCls, saLabel, auditStatusCls: auditEntry.cls, auditStatusLabel: auditEntry.label };
}

function FeedRowCmp({ r, onClick }: { r: Enriched; onClick: () => void }) {
  const riskCls = r.risk === "rp0" ? "rk0" : r.risk === "rp1" ? "rk1" : r.risk === "rp2" ? "rk2" : "rkw";
  const nt = (r.row.notice_type || "").toLowerCase();
  const isPreSol = nt === "pre_sol" || nt === "sources_sought";
  return (
    <div className={`feed-row ${r.risk}`} onClick={onClick}>
      <span className="f-naics">{r.row.naics_code || "—"}</span>
      <div style={{ minWidth: 0 }}>
        <div className="f-title" title={r.row.title || ""}>
          {isPreSol && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: 7, fontWeight: 700,
              padding: "1px 5px", marginRight: 6, borderRadius: 2,
              letterSpacing: ".1em", textTransform: "uppercase",
              color: "#A78BFA", background: "rgba(167,139,250,.10)",
              border: "1px solid rgba(167,139,250,.28)"
            }}>
              {nt === "sources_sought" ? "Src Sought" : "Pre-Sol"}
            </span>
          )}
          {r.row.incumbent_name && (
            <span
              title={`Incumbent: ${r.row.incumbent_name}`}
              style={{
                fontFamily: "var(--mono)", fontSize: 7, fontWeight: 700,
                padding: "1px 5px", marginRight: 6, borderRadius: 2,
                letterSpacing: ".1em", textTransform: "uppercase",
                color: "var(--blue)", background: "rgba(96,165,250,.08)",
                border: "1px solid rgba(96,165,250,.22)"
              }}
            >
              Inc
            </span>
          )}
          {r.row.title || "—"}
        </div>
      </div>
      <span className="f-agency" title={r.row.agency || ""}>{r.row.agency || "—"}</span>
      <span className={`f-days ${r.daysCls === "none" ? "" : r.daysCls}`}>{r.daysLabel}</span>
      <span className="f-type" title={r.row.document_type || ""}>{r.row.document_type || "—"}</span>
      <span className={`f-sa sa-${r.saCls}`}>{r.saLabel}</span>
      <span className={`f-risk ${riskCls}`}>{r.riskLabel}</span>
    </div>
  );
}

function riskFromScore(score: number | null): { cls: "rk0" | "rk1" | "rkw"; label: string } {
  if (score == null) return { cls: "rkw", label: "Watch" };
  if (score < 40) return { cls: "rk0", label: "P0" };
  if (score < 70) return { cls: "rk1", label: "P1" };
  return { cls: "rkw", label: "P2" };
}

// ─── FA-167 · Recently Audited card derivations ───────────────────────────
// Verdict → spec class + pill label. Prefers the canonical
// executive_summary.verdict ("NO-BID"/"CAUTION"/"PROCEED"); falls back to the
// recommendation enum, then to score bands. Drives badge, pill, rail + spark
// (all from the --vd-* tokens) — exactly one class.
function raVerdict(a: AuditRow): { cls: "is-proceed" | "is-caution" | "is-nobid"; label: "PROCEED" | "CAUTION" | "NO-BID" } {
  const ev = (a.exec_verdict || "").toUpperCase().replace(/[\s_]+/g, "-");
  if (ev === "NO-BID" || ev === "NOBID") return { cls: "is-nobid", label: "NO-BID" };
  if (ev === "CAUTION") return { cls: "is-caution", label: "CAUTION" };
  if (ev === "PROCEED" || ev === "GO" || ev === "BID") return { cls: "is-proceed", label: "PROCEED" };
  const rec = (a.recommendation || "").toUpperCase();
  if (rec === "DECLINE") return { cls: "is-nobid", label: "NO-BID" };
  if (rec === "PROCEED") return { cls: "is-proceed", label: "PROCEED" };
  if (rec.includes("CAUTION")) return { cls: "is-caution", label: "CAUTION" };
  if (a.compliance_score != null) {
    if (a.compliance_score >= 70) return { cls: "is-proceed", label: "PROCEED" };
    if (a.compliance_score < 40) return { cls: "is-nobid", label: "NO-BID" };
  }
  return { cls: "is-caution", label: "CAUTION" };
}

// Insight (spec .rac-insight) = the verdict tail of executive_summary.what
// (CEO call, FA-167): everything after the first " — " in the synthesized
// "<office> is buying <item> — <bid condition>" sentence, so the line carries
// the recommendation rather than the office/title shown elsewhere. Falls back
// to the top risk factor (citation parenthetical stripped). Capped at 90 chars
// per spec; the CSS text-overflow ellipsis is the backstop.
function raInsight(a: AuditRow): string {
  let s = "";
  const what = (a.exec_what || "").trim();
  if (what) {
    const parts = what.split(" — ");
    if (parts.length > 1) s = parts.slice(1).join(" — ").trim();
  }
  if (!s) {
    const f = (a.exec_factors || "").split(",")[0].trim();
    s = f.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  if (!s) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);  // FA-167.1 — sentence-case (es.what tail starts lowercase); matches /audit
  return s.length > 90 ? s.slice(0, 89).trimEnd() + "…" : s;
}

// Relative "ago" stamp (spec .rac-ago): "3h ago", "Yesterday", "5d ago"…
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface RunAuditPrefill {
  notice_id: string;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
}

type RunAuditMode = "notice" | "pdf";

// FA-118 — classify an audit fetch failure into one of three customer-facing
// states instead of surfacing one generic error for everything:
//   • piee     — the attempted document is PIEE-gated (badge + manual-upload
//                instruction; NO generic error copy)
//   • rejected — 422 / document rejected or ungettable (auth-walled, missing)
//   • network  — connection / timeout class failure
// Anything unclassified falls back to the prior generic message (with the
// existing "try the PDF upload" hint for notice-mode fetch failures), so no
// real failure mode goes dark.
function classifyAuditError(
  reason: string,
  httpStatus: number | undefined,
  mode: RunAuditMode
): { kind: "piee" | "rejected" | "network" | "other"; message: string } {
  if (isPieeUrl(reason)) {
    return { kind: "piee", message: getPieeInstructions() };
  }
  if (
    httpStatus === 422 ||
    /\b(401|403|404)\b|reject|not\s*fetchable|ungettable|forbidden|unauthor|require[sd]?\s+(authentication|login|sign[-\s]?in|credential)/i.test(reason)
  ) {
    return {
      kind: "rejected",
      message:
        "FARaudit couldn't retrieve this document. The link may require authentication or the file is unavailable.",
    };
  }
  if (/network|timeout|timed\s*out|ETIMEDOUT|ECONN|EAI_AGAIN|failed\s+to\s+fetch|connection|socket|aborted/i.test(reason)) {
    return {
      kind: "network",
      message: "Connection failed. Check your network and try again.",
    };
  }
  const fetchClass = /fetch|download|resource|sam|pdf|unavailable|timeout/i.test(reason);
  const hint =
    fetchClass && mode === "notice"
      ? " Try uploading the solicitation PDF directly — SAM.gov attachments aren't always retrievable."
      : "";
  return { kind: "other", message: `Audit failed: ${reason}.${hint}` };
}

function RunAuditPanel({ prefill, active, onPrefillClear }: { prefill?: RunAuditPrefill | null; active?: boolean; onPrefillClear?: () => void }) {
  const router = useRouter();
  // Architectural mutual exclusion: user picks a mode FIRST, only that mode's
  // input renders. Submit handler sends only the active mode's field by
  // construction — no way to submit both. /api/audit's "PDF wins for clauses,
  // SAM wins for metadata" merge logic stays correct but never triggers from
  // the UI now.
  const [mode, setMode] = useState<RunAuditMode>("notice");
  const [noticeId, setNoticeId] = useState("");
  // FA-170 — group uploads: a solicitation set is multiple files (form + SOW +
  // Section L/M). Was a single File; now a list so the server can ingest all
  // of them form-first instead of silently auditing the first attachment.
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // FA-118 — true when the failure is PIEE-gated; renders the badge + manual-
  // upload instruction instead of generic error copy.
  const [pieeGated, setPieeGated] = useState(false);
  const [result, setResult] = useState<{ auditId?: string; recommendation?: string; score?: number } | null>(null);
  // FA-116 — progress copy while an async-enqueued audit (202) is polled.
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const unmountedRef = useRef(false);
  useEffect(() => () => { unmountedRef.current = true; }, []);
  const noticeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (prefill?.notice_id) {
      setMode("notice");
      setNoticeId(prefill.notice_id);
      setPdfs([]);
    }
  }, [prefill?.notice_id]);

  // Focus the Notice ID input whenever this tab becomes active and we're in
  // notice mode. Native autoFocus only fires on first mount; tab navigation
  // re-shows the same already-mounted panel, so without this the input loses
  // focus the second time the user clicks Run Audit. Skip if a result is on
  // screen (would steal focus from the success block) or the user is mid-submit.
  useEffect(() => {
    if (!active) return;
    if (mode !== "notice") return;
    if (submitting || result) return;
    const el = noticeInputRef.current;
    if (!el) return;
    // requestAnimationFrame: tab-panel transitions can briefly hide via CSS
    // (.tab-panel:not(.active) { display: none }) so the input isn't focusable
    // until the layout pass after `active` flips. rAF schedules focus for the
    // next paint frame so it lands after the panel is visible.
    const raf = requestAnimationFrame(() => { el.focus(); });
    return () => cancelAnimationFrame(raf);
  }, [active, mode, submitting, result]);

  function switchMode(next: RunAuditMode) {
    if (next === mode) return;
    // Clear the OTHER mode's state on switch so submit can never accidentally
    // see stale input from a mode the user already abandoned.
    if (next === "notice") setPdfs([]);
    else setNoticeId("");
    setError(null);
    setPieeGated(false);
    setResult(null);
    setMode(next);
  }

  // FA-118 — classify a failure reason and route it to the right surface:
  // PIEE-gated → badge + manual-upload instruction (no generic copy); else a
  // single, specific error string.
  const applyAuditError = (reason: string, httpStatus?: number) => {
    const cls = classifyAuditError(reason, httpStatus, mode);
    if (cls.kind === "piee") {
      setPieeGated(true);
      setError(null);
    } else {
      setPieeGated(false);
      setError(cls.message);
    }
  };

  // FA-116 — poll loop for async-enqueued audits. The server returned 202
  // before the engine ran; we poll /api/audit/[id]/status every 4s until the
  // worker lands a terminal status. The long-wait threshold changes COPY
  // only, never the verdict — transient poll failures are silently retried.
  async function pollUntilDone(auditId: string, slugFromEnqueue: string | null): Promise<void> {
    const started = Date.now();
    setQueuedNote("Audit queued — running now. This usually takes 1–3 minutes.");
    for (;;) {
      await new Promise((r) => setTimeout(r, 4000));
      if (unmountedRef.current) return;
      let status: { status?: string; error_message?: string | null; solicitationNumber?: string | null };
      try {
        const res = await fetch(`/api/audit/${auditId}/status`);
        if (!res.ok) throw new Error(String(res.status));
        status = await res.json();
      } catch {
        continue;
      }
      if (status.status === "complete") {
        setQueuedNote(null);
        const slug = (status.solicitationNumber ?? slugFromEnqueue ?? "").trim();
        router.push(`/audit/${slug ? slug.toLowerCase() : auditId}`);
        return;
      }
      if (status.status === "failed") {
        setQueuedNote(null);
        // FA-118 — three-way split (PIEE / rejected / network) replaces the
        // single generic "Audit failed" string.
        applyAuditError(status.error_message || "unknown error");
        return;
      }
      if (Date.now() - started > 8 * 60 * 1000) {
        setQueuedNote("Still running — large solicitations can take a while. You can leave this page; the finished report will appear in Past Audits.");
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setPieeGated(false); setResult(null); setQueuedNote(null);
    if (mode === "notice" && !noticeId) { setError("Paste a SAM Notice ID."); return; }
    if (mode === "pdf" && pdfs.length === 0) { setError("Select at least one PDF to upload."); return; }
    // FA-170 — multipart carries the whole group in one request; that request is
    // bounded by Vercel's ~4.5MB body limit. A single large PDF takes the
    // Storage arm below; a multi-file group whose combined size exceeds the
    // limit can't be sent this way — fail loud rather than silently truncate.
    const totalBytes = pdfs.reduce((n, f) => n + f.size, 0);
    if (mode === "pdf" && pdfs.length > 1 && totalBytes >= STORAGE_UPLOAD_THRESHOLD_BYTES) {
      setError("Combined upload exceeds ~4.5MB. Audit by SAM Notice ID, or upload fewer/smaller files per group.");
      return;
    }
    setSubmitting(true);
    try {
      // FA-122 — a SINGLE PDF at/above the Vercel request-body limit (~4.5MB)
      // can't go through multipart /api/audit; upload it straight to Supabase
      // Storage and POST only the storage path as JSON. Notice IDs + smaller
      // PDFs + multi-file groups keep the multipart path (FA-170).
      let res: Response;
      if (mode === "pdf" && pdfs.length === 1 && pdfs[0].size >= STORAGE_UPLOAD_THRESHOLD_BYTES) {
        const big = pdfs[0];
        setQueuedNote("Large file — uploading securely to storage…");
        const sb = createBrowserClient();
        const { data: { user: u } } = await sb.auth.getUser();
        if (!u) {
          setQueuedNote(null);
          setError("Your session expired — sign in again to upload.");
          setSubmitting(false);
          return;
        }
        const key = `uploads/${u.id}/${Date.now()}-${big.name.replace(/[^\w.-]/g, "_")}`;
        const up = await sb.storage.from("audit-pdfs").upload(key, big, {
          contentType: "application/pdf",
          upsert: false,
        });
        setQueuedNote(null);
        if (up.error) {
          applyAuditError(`storage upload failed: ${up.error.message}`);
          setSubmitting(false);
          return;
        }
        res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storage_path: key }),
        });
      } else {
        const fd = new FormData();
        if (mode === "notice") fd.set("noticeId", noticeId);
        // FA-170 — append every selected file under the same "pdf" key; the
        // server form-first assembles them and ingests all (banner on overflow).
        else for (const f of pdfs) fd.append("pdf", f);
        res = await fetch("/api/audit", { method: "POST", body: fd });
      }
      const json = await res.json();
      if (!res.ok) {
        // FA-118 — classify by HTTP status + server reason (422 / PIEE / network).
        applyAuditError(json.error || `audit failed (${res.status})`, res.status);
        return;
      }
      if (res.status === 202 && json.auditId) {
        // FA-116 async path — flag-on servers enqueue and 202 immediately.
        await pollUntilDone(json.auditId as string, (json.solicitationNumber as string | null) ?? null);
        return;
      }
      setResult(json);
      if (json.auditId) {
        // Prefer slug (solicitationNumber) over UUID so the URL bar shows the
        // canonical sol# instead of an internal ID. Brief delay so user sees
        // the success state before navigating to the report.
        const slug = (json.solicitationNumber as string | null)?.trim();
        const dest = `/audit/${slug ? slug.toLowerCase() : json.auditId}`;
        setTimeout(() => router.push(dest), 800);
      }
    } catch (err) {
      // Reaches here on a client-side network failure talking to /api/audit.
      applyAuditError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = submitting
    ? "Auditing…"
    : mode === "notice"
      ? "Run Audit · Notice ID →"
      : "Run Audit · PDF →";
  const submitDisabled = submitting || (mode === "notice" ? !noticeId : pdfs.length === 0);

  return (
    <div className="audit-tab">
      <form className="audit-center" onSubmit={submit}>
        <div className="audit-hero-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L24 7V15C24 20.5 19.5 25 14 26C8.5 25 4 20.5 4 15V7L14 2Z" stroke="#C9A84C" strokeWidth="1.2" fill="rgba(201,168,76,.08)"/>
            <polyline points="9,14 12.5,17.5 19,11" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
        <div className="audit-hero-title">Run a New Audit</div>
        <div className="audit-hero-sub">Upload any federal solicitation PDF. FARaudit runs three sequential intelligence calls — Overview · FAR/DFARS Compliance · Risk Extraction — and delivers a ranked report with a KO clarification email drafted and ready to send.</div>
        {prefill?.notice_id && (
          <div style={{
            background: "rgba(201,168,76,0.06)",
            border: "1px solid rgba(201,168,76,0.25)",
            borderRadius: 3,
            padding: "10px 14px",
            marginBottom: 14,
            display: "flex",
            flexDirection: "column",
            gap: 4
          }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)" }}>
              ▸ Prefilled from Opportunities
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "var(--gold)", opacity: 0.85, letterSpacing: ".04em" }}>
              {prefill.notice_id}
            </div>
            {prefill.title && (
              <div style={{ fontFamily: "var(--serif)", fontSize: 12, color: "var(--text)" }}>{prefill.title}</div>
            )}
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)" }}>
              {prefill.agency || "—"}{prefill.naics_code ? ` · NAICS ${prefill.naics_code}` : ""}
            </div>
          </div>
        )}
        <div className="audit-mode-pills" role="tablist" aria-label="Run Audit input mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "notice"}
            className={`audit-mode-pill ${mode === "notice" ? "active" : ""}`}
            onClick={() => switchMode("notice")}
          >
            <span className="amp-glyph" aria-hidden="true">⌖</span>
            <span>SAM Notice ID</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "pdf"}
            className={`audit-mode-pill ${mode === "pdf" ? "active" : ""}`}
            onClick={() => switchMode("pdf")}
          >
            <span className="amp-glyph" aria-hidden="true">▤</span>
            <span>Upload PDF</span>
          </button>
        </div>

        {mode === "notice" ? (
          <div className="audit-input">
            <input
              ref={noticeInputRef}
              type="text"
              value={noticeId}
              onChange={(e) => {
                const next = e.target.value.trim();
                setNoticeId(next);
                // Drop the prefill banner the moment the user diverges from the
                // pre-populated notice_id. Sticky clear: once cleared, retyping
                // the original value does NOT bring the banner back — the only
                // way back is a fresh row click that re-sets auditPrefill.
                if (prefill?.notice_id && next !== prefill.notice_id && onPrefillClear) {
                  onPrefillClear();
                }
              }}
              placeholder="Paste a SAM.gov Notice ID — e.g. FA301626Q0068"
              autoFocus
            />
            <button type="submit" className="adz-btn" style={{ marginTop: 0 }} disabled={submitDisabled}>
              {submitLabel}
            </button>
          </div>
        ) : (
          <>
            <label className="audit-drop-zone" style={{ display: "block" }}>
              <div className="adz-title">Drop your solicitation PDF here</div>
              <div className="adz-sub">{pdfs.length === 0 ? "Or click to browse · Upload the whole group (solicitation + SOW + Section L/M) · Any agency" : pdfs.length === 1 ? pdfs[0].name : `${pdfs.length} files selected — ${pdfs.map((f) => f.name).join(", ")}`}</div>
              <input type="file" accept="application/pdf" multiple onChange={(e) => setPdfs(e.target.files ? Array.from(e.target.files) : [])} style={{ display: "none" }} />
              <span className="adz-btn" style={{ marginTop: 18 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v9M4 7l4-5 4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Select PDF to Audit
              </span>
            </label>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button type="submit" className="adz-btn" style={{ marginTop: 0 }} disabled={submitDisabled}>
                {submitLabel}
              </button>
            </div>
          </>
        )}
        <div className="audit-formats" style={{ marginTop: 22 }}>
          <span className="af">RFQ</span><span className="af">RFP</span><span className="af">IDIQ</span>
          <span className="af">IFB</span><span className="af">Sources Sought</span><span className="af">Pre-Sol Synopsis</span>
          <span className="af">Task Order</span><span className="af">Modification</span>
        </div>
        {/* FA-118 — PIEE-gated failure: badge + manual-upload instruction, no generic error copy. */}
        {pieeGated && (
          <div className="audit-error" style={{ display: "flex", alignItems: "flex-start", gap: 8, textAlign: "left" }}>
            <span style={{ flexShrink: 0, fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".08em", padding: "2px 6px", borderRadius: 2, background: "rgba(168,85,247,.15)", color: "#C084FC", border: "1px solid rgba(168,85,247,.35)", lineHeight: 1.4 }}>PIEE</span>
            <span>{getPieeInstructions()}</span>
          </div>
        )}
        {error && !pieeGated && <div className="audit-error">{error}</div>}
        {queuedNote && !error && !pieeGated && <div className="audit-success">⟳ {queuedNote}</div>}
        {result && (
          <div className="audit-success">
            ✓ Audit complete · {result.auditId}
            {result.recommendation && <> · {result.recommendation.replace("_", " ")}</>}
            {typeof result.score === "number" && <> · {result.score}/100</>}
          </div>
        )}
      </form>
    </div>
  );
}

function SignOutButton() {
  // P0-J — form-POST submits a real top-level navigation to /api/auth/sign-out,
  // which clears the SSR cookie server-side and 303s to /sign-in. fetch-then-
  // navigate left a race that let the sb-* auth cookie persist through the
  // location change.
  return (
    <form action="/api/auth/sign-out" method="post" style={{ margin: 0 }}>
      <button
        type="submit"
        className="nav-item"
        title="Sign out and return to sign-in"
        style={{ width: "100%", textAlign: "left" }}
      >
        <svg className="nav-icon" viewBox="0 0 16 16" fill="none">
          <path d="M10 12l3-4-3-4M5 8h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Sign out
      </button>
    </form>
  );
}

function PastAuditsPanel({
  audits,
  filter,
  onFilterChange,
  onAuditUpdate
}: {
  audits: AuditRow[];
  filter: "all" | "p0" | "user";
  onFilterChange: (f: "all" | "p0" | "user") => void;
  onAuditUpdate?: (id: string, patch: Partial<AuditRow>) => void;
}) {
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(audits.filter((a) => a.in_pipeline === true).map((a) => a.id)));
  const [pinBusy, setPinBusy] = useState<Set<string>>(() => new Set());
  const [pinErr, setPinErr] = useState<string | null>(null);

  async function togglePinned(auditId: string) {
    if (pinBusy.has(auditId)) return;
    const wasPinned = pinned.has(auditId);
    const next = !wasPinned;
    setPinBusy((s) => new Set(s).add(auditId));
    setPinErr(null);
    setPinned((s) => {
      const n = new Set(s);
      if (next) n.add(auditId); else n.delete(auditId);
      return n;
    });
    try {
      const res = await fetch(`/api/audit/${auditId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ in_pipeline: next })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Propagate to parent so Pipeline Kanban + sidebar badge re-derive.
      if (onAuditUpdate) onAuditUpdate(auditId, { in_pipeline: next });
    } catch (e) {
      // Rollback optimistic update.
      setPinned((s) => {
        const n = new Set(s);
        if (wasPinned) n.add(auditId); else n.delete(auditId);
        return n;
      });
      setPinErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPinBusy((s) => { const n = new Set(s); n.delete(auditId); return n; });
    }
  }

  const filtered = useMemo(() => {
    return audits.filter((a) => {
      if (filter === "p0") return a.compliance_score != null && a.compliance_score < 40;
      if (filter === "user") return a.audit_source !== "audit_ai";
      return true;
    }).filter((a) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (a.notice_id || "").toLowerCase().includes(q) ||
        (a.title || "").toLowerCase().includes(q) ||
        (a.agency || "").toLowerCase().includes(q)
      );
    });
  }, [audits, filter, query]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Past Audits · {audits.length} total</div>
          <div className="is-refresh">Click any row to open full intelligence report</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          {([
            { k: "all",  l: "All" },
            { k: "p0",   l: "High Risk" },
            { k: "user", l: "User Audited" }
          ] as const).map((f) => {
            const active = f.k === filter;
            return (
              <button
                key={f.k}
                onClick={() => onFilterChange(f.k)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)",
                  cursor: "pointer"
                }}
              >
                {f.l}
              </button>
            );
          })}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notice ID · title · agency…"
            style={{
              flex: 1, minWidth: 240,
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px",
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none"
            }}
          />
        </div>

        {pinErr && <div className="ko-status error" style={{ marginBottom: 10 }}>{pinErr}</div>}
        <div className="sam-table">
          <div className="sam-th" style={{ gridTemplateColumns: "100px 130px minmax(0,1fr) 200px 70px 80px 110px 110px" }}>
            <span>Date</span><span>Notice ID</span><span>Title</span><span>Agency</span><span>Source</span><span>Score</span><span>Verdict</span><span></span>
          </div>
          {filtered.length === 0 && <div className="empty-state">No audits match.</div>}
          {filtered.map((a) => {
            const r = riskFromScore(a.compliance_score);
            const rc = r.cls === "rk0" ? "var(--red)" : r.cls === "rk1" ? "var(--amber)" : "var(--gold)";
            const bg = r.cls === "rk0" ? "rgba(220,38,38,.14)" : r.cls === "rk1" ? "rgba(245,158,11,.11)" : "rgba(201,168,76,.08)";
            const recColor = a.recommendation === "PROCEED" ? "var(--green)" : a.recommendation === "DECLINE" ? "var(--red)" : "var(--amber)";
            const isPinned = pinned.has(a.id);
            const isBusy = pinBusy.has(a.id);
            return (
              <a
                key={a.id}
                href={auditHref(a)}
                className="sam-row"
                style={{ gridTemplateColumns: "100px 130px minmax(0,1fr) 200px 70px 80px 110px 110px", textDecoration: "none", color: "inherit" }}
              >
                <span className="sr-date">{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className="sr-num">{displaySolicitationId(a)}</span>
                <span className="sr-title" title={a.title || ""}>{auditDisplayName(a)}</span>
                <span className="sr-agency" title={a.agency || ""}>{a.agency || "—"}</span>
                <span className="sr-badge" style={{ background: a.audit_source === "audit_ai" ? "rgba(96,165,250,.10)" : "rgba(148,163,184,.06)", color: a.audit_source === "audit_ai" ? "var(--blue)" : "var(--t40)", border: "1px solid var(--border)" }}>
                  {a.audit_source === "audit_ai" ? "AI" : "USER"}
                </span>
                {/* FA-126: gate-mode audits render "—" — the report suppresses
                    the numeric score when gates supersede the scored tier. */}
                {a.compliance_score != null && a.verdict_type !== "DECISION_GATE"
                  ? <span className="sr-badge" style={{ color: rc, background: bg, border: `1px solid ${rc}40` }}>{a.compliance_score}</span>
                  : <span className="sr-date">—</span>}
                <span className="sr-badge" style={{ color: recColor, background: "transparent", border: `1px solid ${recColor}40` }}>
                  {a.recommendation ? a.recommendation.replace(/_/g, " ") : "—"}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePinned(a.id); }}
                  disabled={isBusy}
                  title={isPinned ? "Click to unpin from Pipeline" : "Add to Pipeline"}
                  style={{
                    fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                    padding: "3px 8px", borderRadius: 2,
                    background: isPinned ? "rgba(74,222,128,.10)" : "rgba(201,168,76,.08)",
                    border: `1px solid ${isPinned ? "rgba(74,222,128,.32)" : "rgba(201,168,76,.32)"}`,
                    color: isPinned ? "var(--green)" : "var(--gold)",
                    cursor: isBusy ? "wait" : "pointer",
                    opacity: isBusy ? 0.6 : 1
                  }}
                >
                  {isPinned ? "✓ Pinned" : "+ Pipeline"}
                </button>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CalendarRow {
  id: string;
  notice_id: string | null;
  solicitation_number: string | null;
  title: string | null;
  response_deadline: string | null;
  created_at: string;
}

function DeadlineCalendar({ rows, onPick }: { rows: CalendarRow[]; onPick: (row: CalendarRow) => void }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleString("en-US", { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const cells: Array<{ date: Date; rows: CalendarRow[] }> = [];
  // Pad leading blanks for week start (Sun-based grid).
  for (let i = 0; i < first.getDay(); i++) {
    cells.push({ date: new Date(year, month, -first.getDay() + i + 1), rows: [] });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ date: new Date(year, month, d), rows: [] });
  }

  // Slot each row into its deadline cell if in this month. Uses real
  // response_deadline when present (audits sourced from SAM via /api/audit
  // route or audit-ai/corpus.ts have it populated). Falls back to
  // created_at + 30 days only when deadline is null — keeps stale rows
  // visible without false-positive precision claims.
  for (const r of rows) {
    let deadline: Date | null = null;
    if (r.response_deadline) {
      const parsed = new Date(r.response_deadline);
      if (!isNaN(parsed.getTime())) deadline = parsed;
    }
    if (!deadline) {
      const created = new Date(r.created_at);
      if (isNaN(created.getTime())) continue;
      deadline = new Date(created);
      deadline.setDate(deadline.getDate() + 30);
    }
    if (deadline.getFullYear() !== year || deadline.getMonth() !== month) continue;
    const cell = cells.find((c) =>
      c.date.getFullYear() === deadline!.getFullYear() &&
      c.date.getMonth() === deadline!.getMonth() &&
      c.date.getDate() === deadline!.getDate()
    );
    if (cell) cell.rows.push(r);
  }

  function toneFor(date: Date): { bg: string; ring: string } {
    const days = Math.floor((date.getTime() - today.getTime()) / 86400_000);
    if (days < 0) return { bg: "rgba(148,163,184,.04)", ring: "var(--border)" };
    if (days < 7) return { bg: "rgba(220,38,38,.10)", ring: "rgba(220,38,38,.4)" };
    if (days <= 30) return { bg: "rgba(245,158,11,.08)", ring: "rgba(245,158,11,.32)" };
    return { bg: "rgba(74,222,128,.06)", ring: "rgba(74,222,128,.28)" };
  }

  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
        {monthName}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6, fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, color: "var(--t25)", letterSpacing: ".12em", textTransform: "uppercase" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((c, i) => {
          const inMonth = c.date.getMonth() === month;
          const tone = inMonth ? toneFor(c.date) : { bg: "transparent", ring: "transparent" };
          return (
            <div
              key={i}
              style={{
                minHeight: 70,
                padding: 6,
                background: tone.bg,
                border: `1px solid ${tone.ring}`,
                borderRadius: 3,
                opacity: inMonth ? 1 : 0.25,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minWidth: 0
              }}
            >
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)", textAlign: "right" }}>{c.date.getDate()}</div>
              {c.rows.slice(0, 3).map((r) => (
                <button
                  key={r.id}
                  onClick={() => onPick(r)}
                  style={{
                    fontFamily: "var(--mono)", fontSize: 8, color: "var(--gold)",
                    background: "rgba(201,168,76,.06)",
                    border: "1px solid rgba(201,168,76,.18)",
                    borderRadius: 2,
                    padding: "2px 4px",
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    width: "100%",
                    minWidth: 0,
                    boxSizing: "border-box"
                  }}
                  title={`${displaySolicitationId(r)} — ${r.title || ""}`}
                >
                  {auditDisplayName(r)}
                </button>
              ))}
              {c.rows.length > 3 && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t25)" }}>+{c.rows.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KOIntelPanel({ kos }: { kos: KORow[] }) {
  const [query, setQuery] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [sort, setSort] = useState<"recent" | "response" | "agency">("recent");

  const agencies = useMemo(() => {
    const set = new Set<string>();
    kos.forEach((k) => { if (k.agency) set.add(k.agency); });
    return Array.from(set).sort();
  }, [kos]);

  const visible = useMemo(() => {
    let rows = kos.filter((k) => {
      if (agencyFilter !== "all" && k.agency !== agencyFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (k.ko_email || "").toLowerCase().includes(q) ||
        (k.ko_name || "").toLowerCase().includes(q) ||
        (k.agency || "").toLowerCase().includes(q)
      );
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "response") {
        const ar = a.questions_asked > 0 ? a.questions_answered / a.questions_asked : -1;
        const br = b.questions_asked > 0 ? b.questions_answered / b.questions_asked : -1;
        return br - ar;
      }
      if (sort === "agency") return (a.agency || "").localeCompare(b.agency || "");
      return new Date(b.last_contact || 0).getTime() - new Date(a.last_contact || 0).getTime();
    });
    return rows;
  }, [kos, agencyFilter, query, sort]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">KO Intelligence · {kos.length} contacts</div>
          <div className="is-refresh">Auto-populated by audit-ai · enriched on every KO email send</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <select className="naics-select" value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}>
            <option value="all">All agencies</option>
            {agencies.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="naics-select" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "response" | "agency")}>
            <option value="recent">Most recent contact</option>
            <option value="response">Highest response rate</option>
            <option value="agency">Agency A→Z</option>
          </select>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name · email · agency…"
            style={{
              flex: 1, minWidth: 220,
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px",
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none"
            }}
          />
        </div>

        <div className="sam-table">
          <div className="sam-th" style={{ gridTemplateColumns: "1fr 1.4fr 130px 100px 80px 110px" }}>
            <span>Name</span><span>Email</span><span>Agency</span><span>Solicitations</span><span>Avg Resp</span><span>Response Rate</span>
          </div>
          {visible.length === 0 && (
            <div className="empty-state" style={{ lineHeight: 1.6 }}>
              {kos.length === 0 ? (
                <>
                  Audit AI populates this view when you send your first KO clarification email.
                  Run the audit on <span style={{ fontFamily: "var(--mono)", color: "var(--gold)" }}>FA301626Q0068</span> to
                  see it work — the KO email button on the audit detail page seeds this directory automatically.
                </>
              ) : (
                <>No KOs match the current filters. Clear filters to see the full directory.</>
              )}
            </div>
          )}
          {visible.map((k) => {
            const rate = k.questions_asked > 0 ? Math.round((k.questions_answered / k.questions_asked) * 100) : null;
            const rateColor = rate == null ? "var(--gold)" : rate >= 80 ? "var(--green)" : rate >= 50 ? "var(--amber)" : "var(--red)";
            return (
              <div key={k.id} className="sam-row" style={{ gridTemplateColumns: "1fr 1.4fr 130px 100px 80px 110px" }}>
                <span className="sr-title">{k.ko_name || "—"}</span>
                <span className="sr-num">{k.ko_email}</span>
                <span className="sr-agency" title={k.agency || ""}>{k.agency || "—"}</span>
                <span className="sr-date" style={{ textAlign: "center" }}>{k.solicitations_issued ?? 0}</span>
                <span className="sr-date" style={{ textAlign: "center" }}>
                  {k.avg_response_days != null ? `${Number(k.avg_response_days).toFixed(1)}d` : "—"}
                </span>
                <span className="sr-badge" style={{ color: rateColor, background: "transparent", border: `1px solid ${rateColor}40` }}>
                  {rate != null ? `${rate}% (${k.questions_answered}/${k.questions_asked})` : "No data"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgencyIntelPanel({ agencies }: { agencies: AgencyRow[] }) {
  const [sort, setSort] = useState<"audits" | "score" | "win">("audits");

  const sorted = useMemo(() => {
    return [...agencies].sort((a, b) => {
      if (sort === "score") return (b.avg_score ?? -1) - (a.avg_score ?? -1);
      if (sort === "win")   return (b.win_rate ?? -1)  - (a.win_rate ?? -1);
      return b.total_audits - a.total_audits;
    });
  }, [agencies, sort]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Agency Intelligence · {agencies.length} agencies</div>
          <div className="is-refresh">
            <select className="naics-select" value={sort} onChange={(e) => setSort(e.target.value as "audits" | "score" | "win")}>
              <option value="audits">Most audits</option>
              <option value="score">Avg score ↓</option>
              <option value="win">Win rate ↓</option>
            </select>
          </div>
        </div>

        {sorted.length === 0 && <div className="empty-state" style={{ padding: "60px 20px" }}>No agency data yet — run audits to populate.</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 14 }}>
          {sorted.map((a) => {
            const scoreColor = a.avg_score == null ? "var(--gold)" : a.avg_score >= 70 ? "var(--green)" : a.avg_score >= 40 ? "var(--amber)" : "var(--red)";
            const winColor = a.win_rate == null ? "var(--t40)" : a.win_rate >= 50 ? "var(--green)" : "var(--amber)";
            return (
              <div key={a.agency} style={{ background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{a.agency}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", letterSpacing: ".1em" }}>{a.total_audits} audits</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <Metric label="Avg score" value={a.avg_score != null ? `${a.avg_score}/100` : "—"} color={scoreColor} />
                  <Metric label="Win rate" value={a.win_rate != null ? `${a.win_rate}%` : "—"} color={winColor} />
                  <Metric label="Top NAICS" value={a.top_naics[0]?.code || "—"} color="var(--gold2)" />
                </div>

                {a.top_traps.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Top DFARS traps</div>
                    {a.top_traps.map((t) => (
                      <div key={t.clause} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--red)", padding: "2px 0" }}>
                        ⚠ {t.clause} <span style={{ color: "var(--t40)", marginLeft: 4 }}>· {t.count}×</span>
                      </div>
                    ))}
                  </div>
                )}

                {a.recent.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>Recent solicitations</div>
                    {a.recent.slice(0, 3).map((r) => (
                      <a key={r.id} href={auditHref(r)} style={{ display: "block", textDecoration: "none", padding: "4px 0", borderBottom: "1px solid rgba(201,168,76,.05)" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)" }}>{r.notice_id || "—"}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t60)", marginLeft: 8 }}>
                          {r.title ? r.title.slice(0, 50) + (r.title.length > 50 ? "…" : "") : "—"}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 7, color: "var(--t25)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--t40)",
  marginBottom: 6
};

const inputStyle: React.CSSProperties = {
  background: "rgba(3,8,16,.6)",
  border: "1px solid var(--border2)",
  borderRadius: 2,
  padding: "7px 10px",
  fontFamily: "var(--mono)",
  fontSize: 11,
  color: "var(--text)",
  outline: "none"
};

// Stage assignment for kanban: derives from audits.outcome / status / recommendation.
type KanbanStage = "tracking" | "bidding" | "submitted" | "awarded" | "lost";
const STAGES: { key: KanbanStage; label: string; color: string; bg: string }[] = [
  { key: "tracking",  label: "Tracking",  color: "var(--t60)",  bg: "rgba(148,163,184,.04)" },
  { key: "bidding",   label: "Bidding",   color: "var(--gold)", bg: "rgba(201,168,76,.04)" },
  { key: "submitted", label: "Submitted", color: "var(--blue)", bg: "rgba(96,165,250,.04)" },
  { key: "awarded",   label: "Awarded",   color: "var(--green)",bg: "rgba(74,222,128,.04)" },
  { key: "lost",      label: "Lost",      color: "var(--red)",  bg: "rgba(220,38,38,.04)" }
];

function stageOf(a: AuditRow): KanbanStage {
  const outcome = ((a as unknown) as { outcome?: string | null; bid_submitted?: boolean }).outcome;
  const submitted = ((a as unknown) as { bid_submitted?: boolean }).bid_submitted;
  if (outcome === "won")  return "awarded";
  if (outcome === "lost") return "lost";
  if (submitted)          return "submitted";
  if (a.recommendation === "PROCEED" || a.recommendation === "PROCEED_WITH_CAUTION") return "bidding";
  return "tracking";
}

function PipelineKanban({ audits }: { audits: AuditRow[] }) {
  const [grouped, setGrouped] = useState<Record<KanbanStage, AuditRow[]>>(() => {
    // BUG 6: filter out failed audits (status='failed' or no compliance score).
    // BUG 7: dedupe by notice_id, keeping the most-recent successful audit per
    //        notice_id. Failed audits are already removed so a re-audit only
    //        survives if it succeeded.
    // FIX 2: only audits the user has explicitly added to pipeline appear.
    // FA-89h: admit Opportunities-pin stub rows (audit_source='opportunities_pin')
    // even though they have no compliance_score yet — they're tracking-only
    // placeholders so the Pipeline Kanban shows pinned solicitations before any
    // real audit has run.
    const successful = audits.filter(
      (a) => a.in_pipeline === true && a.status !== "failed" && (a.compliance_score != null || a.audit_source === "opportunities_pin")
    );
    const sortedDesc = [...successful].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    const dedupedByNotice = new Map<string, AuditRow>();
    for (const a of sortedDesc) {
      const key = a.notice_id ?? `_id_${a.id}`; // null notice_id → keep all by id
      if (!dedupedByNotice.has(key)) dedupedByNotice.set(key, a);
    }
    const buckets: Record<KanbanStage, AuditRow[]> = { tracking: [], bidding: [], submitted: [], awarded: [], lost: [] };
    for (const a of dedupedByNotice.values()) buckets[stageOf(a)].push(a);
    return buckets;
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Optimistic overlay for prime_sub edits — keyed by audit id, value is the
  // current selection or undefined (server value still authoritative).
  const [primeSubOverride, setPrimeSubOverride] = useState<Record<string, "prime" | "sub" | null>>({});

  async function setPrimeSub(auditId: string, next: "prime" | "sub" | null) {
    setPrimeSubOverride((m) => ({ ...m, [auditId]: next }));
    setErr(null);
    try {
      const res = await fetch(`/api/audit/${auditId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prime_sub: next })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (e) {
      // Drop override on failure so card falls back to server value.
      setPrimeSubOverride((m) => { const n = { ...m }; delete n[auditId]; return n; });
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function moveTo(auditId: string, stage: KanbanStage) {
    setBusyId(auditId);
    setErr(null);
    // Optimistic update
    setGrouped((prev) => {
      const next: Record<KanbanStage, AuditRow[]> = { tracking: [...prev.tracking], bidding: [...prev.bidding], submitted: [...prev.submitted], awarded: [...prev.awarded], lost: [...prev.lost] };
      let moved: AuditRow | undefined;
      for (const k of Object.keys(next) as KanbanStage[]) {
        const idx = next[k].findIndex((a) => a.id === auditId);
        if (idx !== -1) { [moved] = next[k].splice(idx, 1); break; }
      }
      if (moved) next[stage].unshift(moved);
      return next;
    });

    const today = new Date().toISOString().slice(0, 10);
    const payload: Record<string, unknown> = {};
    if (stage === "awarded") { payload.outcome = "won";    payload.outcome_date = today; }
    if (stage === "lost")    { payload.outcome = "lost";   payload.outcome_date = today; }
    if (stage === "submitted") { payload.bid_submitted = true; payload.bid_submit_date = today; payload.outcome = "pending"; }
    if (stage === "bidding")  { payload.outcome = null; payload.bid_submitted = false; }
    if (stage === "tracking") { payload.outcome = null; payload.bid_submitted = false; }

    try {
      const res = await fetch(`/api/audit/${auditId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {err && <div className="ko-status error" style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, alignItems: "start" }}>
        {STAGES.map((s) => (
          <div
            key={s.key}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) moveTo(id, s.key);
              setDraggingId(null);
            }}
            style={{
              background: "var(--void2)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              minHeight: 280,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
          >
            <div style={{ padding: "8px 12px", background: s.bg, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: s.color }}>{s.label}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: s.color }}>{grouped[s.key].length}</span>
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {grouped[s.key].length === 0 && (
                <div style={{ padding: "20px 8px", textAlign: "center", fontFamily: "var(--mono)", fontSize: 9, color: "var(--t25)", fontStyle: "italic" }}>—</div>
              )}
              {grouped[s.key].slice(0, 30).map((a) => {
                const r = riskFromScore(a.compliance_score);
                const rc = r.cls === "rk0" ? "var(--red)" : r.cls === "rk1" ? "var(--amber)" : "var(--gold)";
                const isDragging = draggingId === a.id;
                const countdown = (() => {
                  if (!a.response_deadline) return null;
                  const d = new Date(a.response_deadline);
                  if (isNaN(d.getTime())) return null;
                  const today = new Date(); today.setHours(0,0,0,0);
                  const target = new Date(d); target.setHours(0,0,0,0);
                  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
                  if (days < 0)  return { label: "Expired", color: "var(--t40)" };
                  if (days === 0) return { label: "Today", color: "var(--red)" };
                  return { label: `${days} day${days === 1 ? "" : "s"}`, color: "var(--amber)" };
                })();
                const ct = a.contract_type;
                const primeSub = primeSubOverride[a.id] !== undefined ? primeSubOverride[a.id] : a.prime_sub;
                return (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", a.id);
                      setDraggingId(a.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => { window.location.href = auditHref(a); }}
                    style={{
                      background: "var(--void3)",
                      border: `1px solid ${isDragging ? "rgba(201,168,76,.6)" : "var(--border)"}`,
                      borderRadius: 2,
                      padding: "10px 12px",
                      cursor: busyId === a.id ? "wait" : "grab",
                      opacity: busyId === a.id ? 0.6 : 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      transition: "border-color .12s"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displaySolicitationId(a)}
                      </span>
                      {a.compliance_score != null && a.verdict_type !== "DECISION_GATE" && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 2, color: rc, border: `1px solid ${rc}40` }}>
                          {a.compliance_score}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 11, fontWeight: 500, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {auditDisplayName(a)}
                    </div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                      <span>{a.agency || "—"} · {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      {countdown && (
                        <span style={{ fontWeight: 700, padding: "1px 5px", borderRadius: 2, color: countdown.color, border: `1px solid ${countdown.color}40`, background: `${countdown.color}10`, letterSpacing: ".04em" }}>
                          {countdown.label}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {ct && (
                        <span style={{ fontFamily: "var(--mono)", fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "1px 5px", borderRadius: 2, color: "var(--blue)", border: "1px solid rgba(96,165,250,.32)", background: "rgba(96,165,250,.08)" }}>
                          {ct}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPrimeSub(a.id, primeSub === "prime" ? null : "prime"); }}
                        title="Toggle Prime"
                        style={{
                          fontFamily: "var(--mono)", fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                          padding: "1px 5px", borderRadius: 2, cursor: "pointer",
                          color: primeSub === "prime" ? "var(--blue)" : "var(--t25)",
                          border: `1px solid ${primeSub === "prime" ? "rgba(96,165,250,.55)" : "var(--border)"}`,
                          background: primeSub === "prime" ? "rgba(96,165,250,.14)" : "transparent"
                        }}
                      >
                        Prime
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPrimeSub(a.id, primeSub === "sub" ? null : "sub"); }}
                        title="Toggle Sub"
                        style={{
                          fontFamily: "var(--mono)", fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                          padding: "1px 5px", borderRadius: 2, cursor: "pointer",
                          color: primeSub === "sub" ? "var(--amber)" : "var(--t25)",
                          border: `1px solid ${primeSub === "sub" ? "rgba(245,158,11,.55)" : "var(--border)"}`,
                          background: primeSub === "sub" ? "rgba(245,158,11,.14)" : "transparent"
                        }}
                      >
                        Sub
                      </button>
                    </div>
                  </div>
                );
              })}
              {grouped[s.key].length > 30 && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t25)", textAlign: "center", padding: "6px 0" }}>+ {grouped[s.key].length - 30} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// 19 most-relevant defense NAICS codes for the Defense Spending dropdown.
// Hardcoded because deriving from a user's solicitation set leaves new users
// with an empty dropdown (the original bug).
const DEFENSE_NAICS: Array<{ code: string; label: string }> = [
  { code: "336411", label: "Aircraft Manufacturing" },
  { code: "336413", label: "Aircraft Parts & Auxiliary Equipment" },
  { code: "336414", label: "Guided Missile & Space Vehicle Manufacturing" },
  { code: "336992", label: "Military Armored Vehicles & Tank Components" },
  { code: "334511", label: "Search, Detection & Navigation Instruments" },
  { code: "332710", label: "Machine Shops" },
  { code: "423610", label: "Electrical Apparatus & Equipment Wholesalers" },
  { code: "339999", label: "Other Miscellaneous Manufacturing" },
  { code: "541330", label: "Engineering Services" },
  { code: "541512", label: "Computer Systems Design" },
  { code: "541611", label: "Management Consulting Services" },
  { code: "541715", label: "R&D in Engineering & Life Sciences" },
  { code: "541990", label: "Other Professional/Scientific/Technical Services" },
  { code: "561210", label: "Facilities Support Services" },
  { code: "561612", label: "Security Guards & Patrol Services" },
  { code: "561621", label: "Security Systems Services (except Locksmiths)" },
  { code: "237310", label: "Highway, Street & Bridge Construction" },
  { code: "236220", label: "Commercial & Institutional Building Construction" },
  { code: "811219", label: "Other Electronic & Precision Equipment Repair" }
];

interface MultiYearRecipient { name: string; amounts: Record<number, number>; total: number; trend: "up" | "down" | "flat" }
interface MultiYearAgency { agency: string; amounts: Record<number, number>; total: number; yoyPct: number | null }

// ─── FA-96: Defense Spending Intel — 8 sections ───────────────────────────
function DefenseSpendingPanel({ defenseSpending, naicsOptions }: { defenseSpending: DefenseSpendingRow[]; naicsOptions: string[] }) {
  // NAICS dropdown — default to first NAICS that has data (likely 336413),
  // fall back to first naicsOptions, fall back to 336413.
  const naicsWithData = useMemo(() => Array.from(new Set(defenseSpending.map((r) => r.naics_code))).sort(), [defenseSpending]);
  const naicsList = naicsWithData.length > 0 ? naicsWithData : (naicsOptions.length > 0 ? naicsOptions : ["336413"]);
  // FA-96: default to FARaudit's primary defense NAICS (Other Aircraft Parts
  // & Auxiliary Equipment Manufacturing). The dropdown's options still come
  // from naicsList (dynamic — what's in the data + ingest list), but the
  // initial selection is fixed so the demo lands on a populated row.
  const [selectedNaics, setSelectedNaics] = useState<string>("336413");
  const fy2026 = useMemo(() => defenseSpending.find((r) => r.naics_code === selectedNaics && r.fiscal_year === 2026) || null, [defenseSpending, selectedNaics]);
  const fy2025 = useMemo(() => defenseSpending.find((r) => r.naics_code === selectedNaics && r.fiscal_year === 2025) || null, [defenseSpending, selectedNaics]);
  const fy2024 = useMemo(() => defenseSpending.find((r) => r.naics_code === selectedNaics && r.fiscal_year === 2024) || null, [defenseSpending, selectedNaics]);
  const current = fy2026;
  const prior = fy2025;
  const refreshed = current?.refreshed_at || prior?.refreshed_at;

  const [showPrimes, setShowPrimes] = useState(false);
  // Section 7 — Treasury MTS macro signal via server-side proxy. fiscaldata.treasury.gov
  // doesn't send CORS headers, so direct browser fetch fails. /api/treasury-signal
  // proxies the call + returns a normalized { amount, date, error? } shape with
  // amount in raw USD (Treasury reports in millions).
  const [treasury, setTreasury] = useState<{ ytd: number | null; loading: boolean; error: string | null }>({ ytd: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/treasury-signal");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json() as { amount: number | null; date: string | null; error?: string };
        if (cancelled) return;
        if (j.error) {
          setTreasury({ ytd: null, loading: false, error: j.error });
        } else {
          setTreasury({ ytd: j.amount, loading: false, error: null });
        }
      } catch (e) {
        if (!cancelled) setTreasury({ ytd: null, loading: false, error: e instanceof Error ? e.message : "fetch failed" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (v: number | null): string => {
    if (v == null) return "—";
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
    return `$${v.toFixed(0)}`;
  };
  const fmtPct = (v: number | null): string => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  // .sam-th span CSS sets 7.5px / var(--t25) — too small + too transparent
  // for these section headers. Override inline on the affected <span>s; the
  // class's other styles (mono font / weight / uppercase / letter-spacing)
  // continue to apply.
  const thHeader: React.CSSProperties = { fontSize: 9, color: "var(--t40)" };

  // FA-96c · section-level styling shared across DefenseSpendingPanel. Inline
  // rather than CSS so other tabs that share .intel-section / .is-header keep
  // their existing treatment.
  const sectionTop: React.CSSProperties = { marginTop: 32 };
  const dsHeader: React.CSSProperties = { borderLeft: "3px solid var(--blue)", paddingLeft: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 };
  const dsTitle: React.CSSProperties = { fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--t80)", letterSpacing: ".06em", textTransform: "uppercase" };
  const dsSubtitle: React.CSSProperties = { fontFamily: "var(--mono)", fontSize: 10, color: "var(--t40)" };

  // FA-96c · strip "Department of (the)" prefix for display. USAspending
  // returns "Department of the Air Force" / "Department of Homeland Security"
  // etc.; the prefix is signal-free in the defense context.
  const stripDept = (name: string): string => name.replace(/^Department of (?:the )?/i, "");

  // FA-96c · expand state abbreviations for the Geographic Concentration table.
  // Only the states FARaudit's NAICS density actually hits — anything outside
  // falls back to the raw code (e.g. DC, PR, smaller defense-cluster states).
  const stateNames: Record<string, string> = {
    TX: "Texas", CA: "California", CT: "Connecticut", NY: "New York",
    FL: "Florida", MO: "Missouri", AL: "Alabama", GA: "Georgia",
    AZ: "Arizona", OK: "Oklahoma", VA: "Virginia", MD: "Maryland",
    PA: "Pennsylvania", OH: "Ohio", WA: "Washington"
  };

  // FA-96c · Recompete Radar minimum-value filter. <$25K rows are typically
  // small purchase orders / mods that aren't recompete-worthy intelligence.
  const RECOMPETE_MIN = 25000;

  // No data path — show empty state with NAICS dropdown still visible
  const hasData = defenseSpending.length > 0;

  return (
    <div className="intel-tab-content">
      {/* SECTION 7 — Treasury MTS macro banner (top, full-width) */}
      <div className="intel-section" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.25)", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 11 }}>
          <span style={{ color: "var(--blue)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>🇺🇸 Macro Signal</span>
          <span style={{ color: "var(--text)" }}>
            {treasury.loading ? "Loading latest Treasury MTS…"
              : treasury.error ? `Treasury MTS unavailable (${treasury.error})`
              : treasury.ytd != null ? `DoD–Military Programs FYTD outlays: ${fmt(treasury.ytd)} (latest U.S. Treasury MTS)`
              : "Treasury MTS returned no data"}
          </span>
        </div>
      </div>

      {/* SECTION 1 — NAICS selector + 3-year market trend (FA-96b) */}
      <div className="intel-section" style={sectionTop}>
        <div style={dsHeader}>
          <div style={dsTitle}>Market Trend · NAICS {selectedNaics}</div>
          <div style={{ ...dsSubtitle, display: "flex", alignItems: "center", gap: 10 }}>
            <select
              value={selectedNaics}
              onChange={(e) => setSelectedNaics(e.target.value)}
              style={{ fontFamily: "var(--mono)", fontSize: 11, padding: "5px 8px", background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)", borderRadius: 3, color: "var(--text)", outline: "none" }}
            >
              {naicsList.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <span>{refreshed ? `Refreshed ${new Date(refreshed).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Data refreshing nightly"}</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 6 }}>
          {[
            { row: fy2024, label: "FY2024", note: "closed", current: false },
            { row: fy2025, label: "FY2025", note: "closed", current: false },
            { row: fy2026, label: "FY2026", note: "in progress", current: true }
          ].map((c) => {
            const yoy = c.row?.yoy_delta_pct ?? null;
            const arrow = yoy == null ? "" : yoy >= 0 ? "▲" : "▼";
            const yoyColor = yoy == null ? "var(--t40)" : yoy >= 0 ? "var(--green)" : "var(--red)";
            return (
              <div key={c.label} style={{
                background: c.current ? "rgba(96,165,250,.06)" : "var(--void3)",
                border: c.current ? "1px solid var(--blue)" : "1px solid var(--border)",
                boxShadow: c.current ? "0 0 0 1px rgba(56,139,255,.15)" : undefined,
                borderRadius: 4, padding: "14px 16px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: c.current ? "var(--blue)" : "var(--t40)", textTransform: "uppercase", letterSpacing: ".08em" }}>{c.label}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)" }}>{c.note}</div>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 6 }}>{fmt(c.row?.total_obligations ?? null)}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: yoyColor, marginTop: 2 }}>
                  {arrow} {fmtPct(yoy)} <span style={{ color: "var(--t40)", fontWeight: 500 }}>YoY · SB {c.row?.sb_pct != null ? `${c.row.sb_pct.toFixed(1)}%` : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!hasData && (
        <div className="intel-section">
          <div className="empty-state">Defense spending data refreshing nightly. Run agents/defense-spending agent to populate. NAICS 336413 already seeded; other NAICS pending.</div>
        </div>
      )}

      {/* SECTION 2 — Split Top 10 (Large Primes vs SB Winners) · FA-96b */}
      <div className="intel-section" style={sectionTop}>
        <div style={dsHeader}><div style={dsTitle}>Top 10 Recipients · FY2026</div><div style={dsSubtitle}>Large primes vs SB set-aside winners · USAspending</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* LEFT — Large Prime Winners */}
          <div style={{ borderRight: "1px solid var(--border)", paddingRight: 14 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 2 }}>Large Prime Winners · FY2026</div>
            <div style={{ ...dsSubtitle, marginBottom: 6 }}>10 primes by FY2026 obligations</div>
            {current?.top_recipients && current.top_recipients.length > 0 ? (
              <div className="sam-table">
                <div className="sam-th" style={{ gridTemplateColumns: "30px 1fr 110px 50px" }}>
                  <span style={thHeader}>#</span><span style={thHeader}>Company</span><span style={thHeader}>$</span><span></span>
                </div>
                {current.top_recipients.slice(0, 10).map((r, i) => {
                  const priorMatch = prior?.top_recipients?.find((p) => p.name === r.name);
                  const trend = priorMatch ? r.amount - priorMatch.amount : 0;
                  return (
                    <div key={`${r.name}-${i}`} className="sam-row" style={{ gridTemplateColumns: "30px 1fr 110px 50px" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)", fontWeight: 700 }}>{i + 1}</span>
                      <span style={{ fontFamily: "var(--serif)", fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)" }}>{fmt(r.amount)} {priorMatch && <span style={{ marginLeft: 4, color: trend > 0 ? "var(--green)" : trend < 0 ? "var(--red)" : "var(--t40)", fontSize: 9 }}>{trend > 0 ? "▲" : trend < 0 ? "▼" : "—"}</span>}</span>
                      <a href={`https://www.usaspending.gov/search/?hash=&recipients=${encodeURIComponent(r.name)}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--blue)" }}>→</a>
                    </div>
                  );
                })}
              </div>
            ) : (<div className="empty-state">No recipient data yet.</div>)}
          </div>
          {/* RIGHT — Small Business Winners */}
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--green)", marginBottom: 2 }}>Small Business Winners · FY2026 · ICP</div>
            <div style={{ ...dsSubtitle, marginBottom: 6 }}>10 SB set-aside winners · FY2026</div>
            {current?.sb_recipients && current.sb_recipients.length > 0 ? (
              <div className="sam-table">
                <div className="sam-th" style={{ gridTemplateColumns: "30px 1fr 110px 50px" }}>
                  <span style={thHeader}>#</span><span style={thHeader}>Company</span><span style={thHeader}>$</span><span></span>
                </div>
                {current.sb_recipients.slice(0, 10).map((r, i) => {
                  const priorMatch = prior?.sb_recipients?.find((p) => p.name === r.name);
                  const trend = priorMatch ? r.amount - priorMatch.amount : 0;
                  return (
                    <div key={`${r.name}-${i}`} className="sam-row" style={{ gridTemplateColumns: "30px 1fr 110px 50px" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--green)", fontWeight: 700 }}>{i + 1}</span>
                      <span style={{ fontFamily: "var(--serif)", fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)" }}>{fmt(r.amount)} {priorMatch && <span style={{ marginLeft: 4, color: trend > 0 ? "var(--green)" : trend < 0 ? "var(--red)" : "var(--t40)", fontSize: 9 }}>{trend > 0 ? "▲" : trend < 0 ? "▼" : "—"}</span>}</span>
                      <a href={`https://www.usaspending.gov/search/?hash=&recipients=${encodeURIComponent(r.name)}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--blue)" }}>→</a>
                    </div>
                  );
                })}
              </div>
            ) : (<div className="empty-state">No SB set-aside data for this NAICS.</div>)}
          </div>
        </div>
      </div>

      {/* SECTION 3 — Agency heat map */}
      <div className="intel-section" style={sectionTop}>
        <div style={dsHeader}><div style={dsTitle}>Agency Heat Map · FY2026</div><div style={dsSubtitle}>Top 10 awarding agencies by total obligations</div></div>
        {current?.agency_breakdown && current.agency_breakdown.length > 0 ? (
          <div className="sam-table">
            <div className="sam-th" style={{ gridTemplateColumns: "1fr 160px 100px" }}>
              <span style={thHeader}>Agency</span><span style={thHeader}>FY2026 Obligations</span><span style={thHeader}>USAspending</span>
            </div>
            {current.agency_breakdown.slice(0, 10).map((a, i) => (
              <div key={`${a.name}-${i}`} className="sam-row" style={{ gridTemplateColumns: "1fr 160px 100px" }}>
                <span style={{ fontFamily: "var(--serif)", fontSize: 12, color: "var(--text)" }} title={a.name}>{stripDept(a.name)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>{fmt(a.amount)}</span>
                <a href={`https://www.usaspending.gov/search/?hash=&awarding_agencies=${encodeURIComponent(a.name)}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--blue)" }}>View →</a>
              </div>
            ))}
          </div>
        ) : (<div className="empty-state">No agency data yet for this NAICS.</div>)}
      </div>

      {/* SECTION 4 — Recompete radar */}
      <div className="intel-section" style={sectionTop}>
        <div style={dsHeader}><div style={dsTitle}>Recompete Radar</div><div style={dsSubtitle}>Contracts ≥$25K expiring soon · USAspending</div></div>
        {(() => {
          // 14310bc agent overhaul: paginated /spending_by_award/ with sort
          // End Date asc + DISJOINT (0,90] / (90,180] windows, so the two
          // recompetes_expiring_* arrays are sourced server-side and never
          // overlap. UI defensives below are belt-and-suspenders for NAICS
          // where USAspending publishes no end dates at all (e.g. IDIQ-
          // dominated NAICS): hide EXPIRES col + swap the bare empty state
          // for a sourced explanation.
          // FA-96c: also drop rows under RECOMPETE_MIN ($25K) — small POs
          // and mods are noise, not recompete intel.
          const sourceRows = (current?.recompetes_expiring_180d || []).filter((r) => (r.amount ?? 0) >= RECOMPETE_MIN);
          const hasEndDates = sourceRows.some((r) => r.end_date && r.end_date.trim() !== "");
          const gridCols = hasEndDates ? "140px 1fr 110px 1fr 100px" : "140px 1fr 110px 1fr";
          return (["recompetes_expiring_90d","recompetes_expiring_180d"] as const).map((key) => {
            const rows = (current?.[key] || []).filter((r) => (r.amount ?? 0) >= RECOMPETE_MIN);
            const label = key === "recompetes_expiring_90d" ? "Expiring ≤90 days" : "Expiring 91–180 days";
            const labelColor = key === "recompetes_expiring_90d" ? "var(--red)" : "var(--amber)";
            const emptyMessage = key === "recompetes_expiring_90d"
              ? "No contracts ≥$25K with published expiration dates within 90 days. USAspending does not publish end dates for active IDIQ vehicles in this NAICS."
              : "None.";
            return (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: labelColor, marginBottom: 6 }}>{label} · {rows.length}</div>
                {rows.length > 0 ? (
                  <div className="sam-table">
                    <div className="sam-th" style={{ gridTemplateColumns: gridCols }}>
                      <span style={thHeader}>Award ID</span><span style={thHeader}>Incumbent</span><span style={thHeader}>Value</span><span style={thHeader}>Agency</span>
                      {hasEndDates && <span style={thHeader}>Expires</span>}
                    </div>
                    {rows.slice(0, 10).map((r, i) => (
                      <div key={`${r.award_id}-${i}`} className="sam-row" style={{ gridTemplateColumns: gridCols }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)" }}>{r.award_id.slice(0, 16)}</span>
                        <span style={{ fontFamily: "var(--serif)", fontSize: 11, color: "var(--text)" }}>{r.recipient}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>{fmt(r.amount)}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t60)" }} title={r.agency}>{stripDept(r.agency)}</span>
                        {hasEndDates && (
                          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: labelColor }}>{r.end_date.slice(0, 10)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (<div className="empty-state" style={{ padding: "12px 0" }}>{emptyMessage}</div>)}
              </div>
            );
          });
        })()}
      </div>

      {/* SECTION 5 — Geographic concentration */}
      <div className="intel-section" style={sectionTop}>
        <div style={dsHeader}><div style={dsTitle}>Geographic Concentration · FY2026</div><div style={dsSubtitle}>Top 10 states by place of performance</div></div>
        {current?.state_breakdown && current.state_breakdown.length > 0 ? (() => {
          const total = current.state_breakdown.reduce((acc, s) => acc + s.amount, 0);
          return (
            <div className="sam-table">
              <div className="sam-th" style={{ gridTemplateColumns: "220px 1fr 130px 100px" }}>
                <span style={thHeader}>State</span><span></span><span style={thHeader}>Obligations</span><span style={thHeader}>% of top 10</span>
              </div>
              {current.state_breakdown.slice(0, 10).map((s) => {
                const full = stateNames[s.state];
                const display = full ? `${full} (${s.state})` : s.state;
                return (
                  <div key={s.state} className="sam-row" style={{ gridTemplateColumns: "220px 1fr 130px 100px" }}>
                    <span style={{ fontFamily: "var(--serif)", fontSize: 12, color: "var(--text)" }}>{display}</span>
                    <span></span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>{fmt(s.amount)}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--t60)" }}>{total > 0 ? `${(s.amount / total * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                );
              })}
            </div>
          );
        })() : (<div className="empty-state">No state data yet for this NAICS.</div>)}
      </div>

      {/* SECTION 7 — DoD-wide primes (collapsible) · FA-96b: contract vehicle section removed (endpoint 404) */}
      <div className="intel-section" style={sectionTop}>
        <button
          type="button"
          onClick={() => setShowPrimes((v) => !v)}
          style={{ ...dsTitle, borderLeft: "3px solid var(--blue)", paddingLeft: 12, background: "transparent", border: "none", borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: "var(--blue)", cursor: "pointer", textAlign: "left" }}
        >
          {showPrimes ? "▼ Hide" : "▶ Show"} DoD-Wide Prime Contractors
        </button>
        {showPrimes && <BudgetPanel naicsOptions={naicsOptions} />}
      </div>
    </div>
  );
}

function BudgetPanel(_props: { naicsOptions: string[] }) {
  // FIX 4: NAICS filter removed from Defense Spending. The page shows DoD-wide
  // spending across all NAICS. The combobox lives only on Opportunities.
  // FIX 1: default view is 3 Year (was 5 Year).
  const [viewMode, setViewMode] = useState<"3" | "5">("3");
  const [data, setData] = useState<{ years: number[]; recipients: MultiYearRecipient[]; agencies: MultiYearAgency[] } | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fy = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const window = viewMode === "5" ? 5 : 3;
    const years = Array.from({ length: window }, (_, i) => fy - (window - 1 - i));
    (async () => {
      try {
        // No NAICS param — DoD-wide spending across all NAICS.
        const url = `/api/budget-multi?years=${years.join(",")}`;
        const res = await fetch(url);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setData({ years: j.years, recipients: j.recipients || [], agencies: j.agencies || [] });
        setFetchedAt(typeof j.fetched_at === "string" ? j.fetched_at : null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fy, viewMode]);

  function fmt(n: number): string {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    if (n > 0) return `$${n.toFixed(0)}`;
    return "—";
  }
  function trendIcon(t: "up" | "down" | "flat"): { c: string; color: string } {
    if (t === "up") return { c: "↑", color: "var(--green)" };
    if (t === "down") return { c: "↓", color: "var(--red)" };
    return { c: "→", color: "var(--t40)" };
  }
  const years = data?.years || [];
  const yearCols = years.map(() => "100px").join(" ");

  const recipientGridCols = `30px 1fr ${yearCols} 60px`;
  const agencyGridCols = `1fr ${yearCols} 80px`;
  const yearRange = years.length > 0 ? `FY${years[0]}–FY${years[years.length - 1]}` : "";

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Department of Defense · Rolling {viewMode}-Year Spend · {yearRange}</div>
          <div className="is-refresh">
            <span style={{ marginLeft: 6 }}>Live · USAspending.gov · DoD-wide (no NAICS filter)</span>
          </div>
        </div>

        {/* 3-year / 5-year toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(["3", "5"] as const).map((m) => {
            const active = m === viewMode;
            return (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)", cursor: "pointer"
                }}
              >
                {m} Year
              </button>
            );
          })}
        </div>

        {loading && <div className="empty-block">Loading {viewMode}-year defense spending from USAspending.gov…</div>}
        {err && <div className="ko-status error">{err}</div>}
        {!loading && !err && data && data.recipients.length === 0 && (
          <div className="empty-state">No DoD obligations found in {yearRange}.</div>
        )}

        {data && data.recipients.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
              Top 10 Prime Recipients · {yearRange} · sub-entities consolidated
            </div>
            <div className="sam-table">
              <div className="sam-th" style={{ gridTemplateColumns: recipientGridCols }}>
                <span>#</span><span>Recipient</span>
                {years.map((y) => <span key={y}>FY{y}</span>)}
                <span>Trend</span>
              </div>
              {data.recipients.map((r, i) => {
                const t = trendIcon(r.trend);
                return (
                  <div key={`${r.name}-${i}`} className="sam-row" style={{ gridTemplateColumns: recipientGridCols }}>
                    <span className="sr-num" style={{ color: "var(--t40)" }}>{i + 1}</span>
                    <span className="sr-title" title={r.name}>{r.name}</span>
                    {years.map((y) => <span key={y} className="sr-num">{fmt(r.amounts[y] || 0)}</span>)}
                    <span className="sr-num" style={{ color: t.color, fontWeight: 700 }}>{t.c}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data && data.agencies.length > 0 && (
          <>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
              Awarding Agencies · {yearRange}
            </div>
            <div className="sam-table">
              <div className="sam-th" style={{ gridTemplateColumns: agencyGridCols }}>
                <span>Agency</span>
                {years.map((y) => <span key={y}>FY{y}</span>)}
                <span>YoY Δ</span>
              </div>
              {data.agencies.map((a) => {
                const deltaColor = a.yoyPct == null ? "var(--t40)" : a.yoyPct > 0 ? "var(--green)" : a.yoyPct < 0 ? "var(--red)" : "var(--t40)";
                const arrow = a.yoyPct == null ? "—" : a.yoyPct > 0 ? "↑" : a.yoyPct < 0 ? "↓" : "→";
                return (
                  <div key={a.agency} className="sam-row" style={{ gridTemplateColumns: agencyGridCols }}>
                    <span className="sr-title" title={a.agency}>{a.agency}</span>
                    {years.map((y) => <span key={y} className="sr-num">{fmt(a.amounts[y] || 0)}</span>)}
                    <span className="sr-num" style={{ color: deltaColor }}>
                      {arrow} {a.yoyPct != null ? `${a.yoyPct > 0 ? "+" : ""}${a.yoyPct.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ marginTop: 18, paddingTop: 10, borderTop: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)", letterSpacing: ".06em" }}>
          Source: USAspending.gov v2 · DoD scope · recipient sub-entities consolidated via name normalization
          {fetchedAt && ` · refreshed ${new Date(fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
        </div>
      </div>
    </div>
  );
}

interface NewsItemRow {
  source: string;
  title: string;
  link: string;
  pub_date: string | null;
  summary: string;
  tag: string;
  relevance: string;
  ai_insight?: string | null;
}

function DefenseNewsPanel() {
  const [items, setItems] = useState<NewsItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/defense-news");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setItems(data.items || []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    if (tagFilter === "all") return items;
    return items.filter((i) => i.tag === tagFilter);
  }, [items, tagFilter]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Defense &amp; Federal Contracting News</div>
          <div className="is-refresh">Live RSS · 30 min cache</div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {(["all", "policy", "defense", "contract", "budget"] as const).map((t) => {
            const active = t === tagFilter;
            return (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)", cursor: "pointer"
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {loading && <div className="empty-block">Loading RSS feeds…</div>}
        {err && <div className="ko-status error">{err}</div>}
        {!loading && !err && visible.length === 0 && <div className="empty-state">No news in this filter.</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 14 }}>
          {visible.slice(0, 30).map((n, i) => (
            <a
              key={i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: "16px 18px", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: tagColor(n.tag), padding: "2px 8px", borderRadius: 2, border: `1px solid ${tagColor(n.tag)}40` }}>
                  {n.tag}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)" }}>
                  {n.source}{n.pub_date ? ` · ${new Date(n.pub_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </span>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, marginBottom: 8 }}>
                {n.title}
              </div>
              {n.ai_insight ? (
                <div style={{ marginTop: 4, marginBottom: 10, padding: "10px 12px", background: "rgba(24,95,165,.08)", borderLeft: "2px solid var(--mid)", borderRadius: 2, fontFamily: "var(--serif)", fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--mid)", marginBottom: 4 }}>AI Insight</div>
                  {n.ai_insight}
                </div>
              ) : (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(201,168,76,.04)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 9, color: "var(--t60)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--gold)" }}>How this affects your bids:</strong> {n.relevance}
                </div>
              )}
              {n.summary && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)", lineHeight: 1.5, marginBottom: 8 }}>
                  {n.summary.slice(0, 200)}{n.summary.length > 200 ? "…" : ""}
                </div>
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function tagColor(t: string): string {
  if (t === "policy")   return "var(--blue)";
  if (t === "contract") return "var(--gold)";
  if (t === "budget")   return "var(--green)";
  if (t === "defense")  return "var(--red)";
  return "var(--t40)";
}

interface SamEntityRow {
  uei: string | null;
  legal_business_name: string | null;
  cage_code: string | null;
  primary_naics: string | null;
  naics_codes: string[];
  state: string | null;
  zip: string | null;
  business_types: string[];
  certifications: string[];
  poc_name: string | null;
  poc_email: string | null;
  poc_phone: string | null;
  registration_status: string | null;
  registration_expiration: string | null;
}

function TeamingPartnersPanel(_props: { naicsOptions: string[] }) {
  const [naics, setNaics] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [setAside, setSetAside] = useState<string>("");
  const [partners, setPartners] = useState<SamEntityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState<SamEntityRow | null>(null);

  async function search(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!naics) { setErr("NAICS code required"); return; }
    setLoading(true); setErr(null); setReason(null);
    try {
      const params = new URLSearchParams({ naics });
      if (state) params.set("state", state);
      if (setAside) params.set("setAside", setAside);
      const res = await fetch(`/api/teaming-partners?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPartners(data.partners || []);
      if (data.reason) setReason(data.reason);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function draftIntro(p: SamEntityRow): string {
    return [
      `Subject: Teaming inquiry · NAICS ${p.primary_naics || naics} · FARaudit-sourced`,
      "",
      `Hi ${p.poc_name || "team"},`,
      "",
      `I'm reaching out from the FARaudit network. We're tracking active solicitations under NAICS ${naics}${state ? ` in ${state}` : ""} and your firm came up as a strong fit on capability and certifications (${p.business_types.slice(0, 3).join(", ") || "registered SAM entity"}).`,
      "",
      "We'd like to explore a teaming arrangement on an upcoming opportunity. A few specifics on our side:",
      "  · Past performance: we can share our FARaudit capability statement on request",
      "  · Geography: TX + OK corridor primary, national delivery available",
      "  · Bid-ready timeline: 60–90 days with full FAR/DFARS audit complete on every solicitation",
      "",
      "Open to a 20-minute call this week or next? Happy to send our capability statement first if useful.",
      "",
      "Best,"
    ].join("\n");
  }

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Find Teaming Partners · SAM.gov registered entities</div>
          <div className="is-refresh">Live · SAM Entity Management API v3</div>
        </div>

        <form
          onSubmit={search}
          noValidate
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: "12px 14px", background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 3 }}
        >
          <NaicsCombobox
            value={naics}
            onChange={(c) => { setNaics(c); if (err) setErr(null); }}
            options={DEFENSE_NAICS}
            includeAll={false}
            placeholder="Choose NAICS…"
          />
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="State (e.g. TX)"
            maxLength={2}
            style={{
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px", width: 100,
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none"
            }}
          />
          <input
            type="text"
            value={setAside}
            onChange={(e) => setSetAside(e.target.value)}
            placeholder="Set-aside type (e.g. SDVOSB)"
            style={{
              background: "rgba(3,8,16,.6)", border: "1px solid var(--border2)",
              borderRadius: 2, padding: "6px 12px",
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none", flex: 1, minWidth: 200
            }}
          />
          <button
            type="submit"
            className="action-btn primary"
            disabled={loading || !naics}
            title={!naics ? "Select a NAICS to enable Search" : undefined}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {err && <div className="ko-status error" role="alert">{err}</div>}
        {reason && <div className="empty-block">{reason}</div>}

        {!loading && !err && partners.length === 0 && naics && (
          <div className="empty-state">No SAM-registered entities matched. Try removing state or set-aside filter.</div>
        )}

        {partners.length > 0 && (
          <div className="sam-table">
            <div className="sam-th" style={{ gridTemplateColumns: "1.4fr 110px 1fr 100px 100px 80px" }}>
              <span>Company</span><span>UEI</span><span>POC</span><span>State</span><span>Cert</span><span>Action</span>
            </div>
            {partners.map((p, i) => (
              <div key={p.uei || i} className="sam-row" style={{ gridTemplateColumns: "1.4fr 110px 1fr 100px 100px 80px" }}>
                <span className="sr-title">{p.legal_business_name || "—"}</span>
                <span className="sr-num">{p.uei || "—"}</span>
                <span className="sr-agency">
                  {p.poc_name || p.poc_email || "—"}
                </span>
                <span className="sr-date" style={{ textAlign: "center" }}>{p.state || "—"}</span>
                <span className="sr-date" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.business_types.join(", ")}>
                  {p.business_types[0] ? p.business_types[0].slice(0, 14) : "—"}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDraftFor(p); }}
                  style={{
                    fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                    color: "var(--gold)", background: "rgba(201,168,76,.08)",
                    border: "1px solid var(--border2)", borderRadius: 2, padding: "4px 8px", cursor: "pointer"
                  }}
                >
                  Intro
                </button>
              </div>
            ))}
          </div>
        )}

        {draftFor && (
          <div style={{ marginTop: 16, background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)" }}>
                Introduction draft · {draftFor.legal_business_name}
              </div>
              <button onClick={() => setDraftFor(null)} className="action-btn">Close</button>
            </div>
            <textarea
              className="ko-email-textarea"
              defaultValue={draftIntro(draftFor)}
              style={{ minHeight: 280 }}
            />
            <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)" }}>
              {draftFor.poc_email ? `Send to: ${draftFor.poc_email}` : "No email on SAM record — copy and use your own outreach channel."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CapStatement {
  user_id?: string;
  company_name: string | null;
  uei: string | null;
  cage_code: string | null;
  duns: string | null;
  naics_codes: string[];
  certifications: string[];
  core_competencies: string | null;
  differentiators: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_website: string | null;
  contact_address: string | null;
  past_performance: Array<{
    notice_id?: string | null;
    title?: string | null;
    agency?: string | null;
    naics_code?: string | null;
    contract_value?: string | number | null;
    period?: string | null;
    cpars_rating?: number | null;
    customer_relationship?: string | null;
  }>;
  updated_at?: string | null;
  stub?: boolean;
}

// Shared by initial-load lastSent baseline and debounced persist payload.
// Order matters — JSON.stringify is order-sensitive and we use the result
// as a signature to skip duplicate PATCHes.
function extractCapPayload(s: CapStatement) {
  return {
    company_name: s.company_name,
    uei: s.uei,
    cage_code: s.cage_code,
    duns: s.duns,
    naics_codes: s.naics_codes,
    certifications: s.certifications,
    core_competencies: s.core_competencies,
    differentiators: s.differentiators,
    contact_name: s.contact_name,
    contact_email: s.contact_email,
    contact_phone: s.contact_phone,
    contact_website: s.contact_website,
    contact_address: s.contact_address
  };
}

function CapabilityPanel() {
  const [stmt, setStmt] = useState<CapStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef("");
  // Mirror of stmt for the debounced timeout to read. Without this the
  // setTimeout arrow captured persist() from the render where update() was
  // called, which read stmt from THAT render's closure — i.e., the value
  // BEFORE the latest setState was applied. F-37: typed values were lost.
  const stmtRef = useRef<CapStatement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Bypass any browser/edge cache so newly-logged outcomes show up
        // immediately. The API route is force-dynamic on the server side;
        // pairing that with cache:'no-store' + a cache-bust query param
        // ensures intermediate caches (browser, Vercel edge, service
        // worker) never serve a stale snapshot of past_performance.
        const res = await fetch(`/api/capability-statement?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "include"
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setStmt(data.statement);
        stmtRef.current = data.statement;
        lastSent.current = JSON.stringify(extractCapPayload(data.statement));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep stmtRef synced with state so the debounced persist reads the latest values.
  useEffect(() => {
    stmtRef.current = stmt;
  }, [stmt]);

  function update<K extends keyof CapStatement>(key: K, value: CapStatement[K]) {
    setStmt((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (stmtRef.current) persist(stmtRef.current);
    }, 1000);
  }

  async function persist(current: CapStatement, opts?: { force?: boolean }) {
    const payload = extractCapPayload(current);
    const sig = JSON.stringify(payload);
    if (!opts?.force && sig === lastSent.current) return;
    setSave("saving");
    setErr(null);
    try {
      const res = await fetch("/api/capability-statement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      lastSent.current = sig;
      // Don't replace local stmt with server response — user may have typed
      // additional characters during the PATCH round-trip. Just flip the stub
      // flag and capture the server's updated_at.
      setStmt((prev) => prev ? { ...prev, stub: false, updated_at: data.statement.updated_at } : prev);
      setSavedAt(new Date());
      setSave("saved");
    } catch (e) {
      setSave("error");
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  async function exportPdf() {
    if (exporting) return;
    setExportErr(null);
    setExporting(true);
    try {
      const res = await fetch("/api/capability-statement/pdf", { credentials: "include" });
      if (res.status === 404) {
        setExportErr("Save your capability statement first.");
        return;
      }
      if (!res.ok) {
        setExportErr("Export failed, try again.");
        return;
      }
      const blob = await res.blob();
      // Parse filename from Content-Disposition if present, else fall back.
      const disp = res.headers.get("Content-Disposition") || "";
      const match = /filename="?([^"]+)"?/.exec(disp);
      const filename = match?.[1] || `FARaudit-CapabilityStatement-${new Date().toISOString().slice(0,10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportErr("Export failed, try again.");
    } finally {
      setExporting(false);
    }
  }

  async function saveNow() {
    if (!stmtRef.current || save === "saving") return;
    // Cancel any debounced autosave so the button click is the source of truth.
    if (timer.current) clearTimeout(timer.current);
    await persist(stmtRef.current, { force: true });
  }

  if (loading) {
    return (
      <div className="intel-tab-content">
        <div className="intel-section">
          <div className="empty-block">Loading capability statement…</div>
        </div>
      </div>
    );
  }
  if (!stmt) {
    return (
      <div className="intel-tab-content">
        <div className="intel-section">
          <div className="ko-status error">{err || "Failed to load."}</div>
        </div>
      </div>
    );
  }

  const indicator = save === "saving" ? { cls: "saving", txt: "● Saving…" }
    : save === "error"  ? { cls: "error",  txt: `! ${err || "Save failed"}` }
    : save === "saved" && savedAt ? { cls: "saved", txt: `✓ Saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` }
    : { cls: "", txt: "Saves automatically" };

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Capability Statement</div>
          <div className="is-refresh" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="action-btn"
              onClick={saveNow}
              disabled={save === "saving"}
              style={{
                border: "1px solid var(--border2)",
                background: "transparent",
                color: "var(--text)",
                padding: "4px 12px",
                borderRadius: 4,
                cursor: save === "saving" ? "wait" : "pointer",
                fontSize: 11,
                fontFamily: "var(--mono)",
                letterSpacing: ".06em",
                opacity: save === "saving" ? 0.6 : 1
              }}
            >
              {save === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="action-btn primary"
              onClick={exportPdf}
              disabled={exporting}
              style={{
                border: "1px solid var(--gold)",
                background: "var(--gold)",
                color: "var(--void)",
                padding: "4px 12px",
                borderRadius: 4,
                cursor: exporting ? "wait" : "pointer",
                fontSize: 11,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                letterSpacing: ".06em",
                opacity: exporting ? 0.6 : 1
              }}
            >
              {exporting ? "Exporting…" : "↓ Export PDF"}
            </button>
            <span>
              {save === "error"
                ? "⚠ Not saved"
                : save === "saving"
                ? "● Saving…"
                : stmt.stub
                ? "Draft (not yet saved)"
                : "Synced"}
            </span>
          </div>
        </div>
        {exportErr && (
          <div className="ko-status error" style={{ marginTop: 8 }}>{exportErr}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <CapField label="Company name" value={stmt.company_name || ""} onChange={(v) => update("company_name", v)} placeholder="Your company name" />
          <CapField label="Contact name" value={stmt.contact_name || ""} onChange={(v) => update("contact_name", v)} placeholder="Primary BD contact" />
          <CapField label="UEI" value={stmt.uei || ""} onChange={(v) => update("uei", v)} placeholder="12-character SAM UEI" />
          <CapField label="CAGE code" value={stmt.cage_code || ""} onChange={(v) => update("cage_code", v)} placeholder="5-character CAGE code" />
          <CapField label="Contact email" value={stmt.contact_email || ""} onChange={(v) => update("contact_email", v)} placeholder="bd@yourcompany.com" />
          <CapField label="Contact phone" value={stmt.contact_phone || ""} onChange={(v) => update("contact_phone", v)} placeholder="(xxx) xxx-xxxx" />
          <CapField label="Website" value={stmt.contact_website || ""} onChange={(v) => update("contact_website", v)} placeholder="https://yourcompany.com" />
          <CapField label="Address" value={stmt.contact_address || ""} onChange={(v) => update("contact_address", v)} placeholder="Street, City, State ZIP" />
        </div>

        <div style={{ marginTop: 18 }}>
          <CapTextarea label="Core competencies" value={stmt.core_competencies || ""} onChange={(v) => update("core_competencies", v)} placeholder="3–5 sentences. What you build / how you build it / who you've delivered to." />
        </div>

        <div style={{ marginTop: 14 }}>
          <CapTextarea label="Differentiators" value={stmt.differentiators || ""} onChange={(v) => update("differentiators", v)} placeholder="Why FARaudit-tier intelligence + your delivery wins where others can't." />
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <CapTagList label="NAICS codes" values={stmt.naics_codes} onChange={(v) => update("naics_codes", v)} />
          <CapTagList label="Certifications" values={stmt.certifications} onChange={(v) => update("certifications", v)} />
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 10 }}>
            Past performance · auto-populated from won audits
          </div>
          {!Array.isArray(stmt.past_performance) || stmt.past_performance.length === 0 ? (
            <div className="empty-block">No won audits yet. Outcomes you mark "won" on /audit/[id] will appear here automatically.</div>
          ) : (
            stmt.past_performance.map((p, i) => (
              <div key={i} style={{ background: "var(--void3)", border: "1px solid var(--border)", borderLeft: "3px solid var(--gold)", borderRadius: 2, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{auditDisplayName(p)}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)", marginTop: 4 }}>
                  {displaySolicitationId(p)}
                  {p.agency ? ` · ${p.agency}` : ""}
                  {p.naics_code ? ` · NAICS ${p.naics_code}` : ""}
                  {p.period ? ` · ${p.period}` : ""}
                </div>
                {(p.contract_value || p.cpars_rating != null || p.customer_relationship) && (
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--gold)", opacity: 0.85, marginTop: 6, display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {p.contract_value && (
                      <span>Contract value: {typeof p.contract_value === "number" ? `$${p.contract_value.toLocaleString()}` : p.contract_value}</span>
                    )}
                    {p.cpars_rating != null && <span>CPARS: {p.cpars_rating}</span>}
                    {p.customer_relationship && <span>Relationship: {p.customer_relationship}</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className={`notes-status ${indicator.cls}`} style={{ marginTop: 18 }}>{indicator.txt}</div>
      </div>
    </div>
  );
}

function CapField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, width: "100%" }}
      />
    </div>
  );
}

function CapTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{ ...inputStyle, width: "100%", fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
      />
    </div>
  );
}

function CustomerMetricsCard({ counter, recentAudits }: { counter: HeaderCounter; recentAudits: AuditRow[] }) {
  // Engagement: audits + outcomes logged + notes added.
  const decided = recentAudits.filter((a) => {
    const o = ((a as unknown) as { outcome?: string | null }).outcome;
    return o === "won" || o === "lost";
  });
  const noted = recentAudits.filter((a) => {
    const n = ((a as unknown) as { notes?: string | null }).notes;
    return typeof n === "string" && n.trim().length > 0;
  });
  const engagementRaw = counter.audits + decided.length * 2 + noted.length;
  const engagement = Math.min(100, engagementRaw); // 100-point cap

  const milestoneTarget = 25;
  const milestonePct = Math.min(100, (counter.audits / milestoneTarget) * 100);

  const wins = decided.filter((a) => ((a as unknown) as { outcome?: string }).outcome === "won").length;
  const yourWinRate = decided.length > 0 ? Math.round((wins / decided.length) * 100) : null;

  return (
    <div className="rc-section">
      <div className="rc-hdr"><div className="rc-title">Your Metrics</div><div className="rc-sub">vs corpus</div></div>
      <div style={{ padding: "12px 16px" }}>
        <MetricBlock
          label="Milestone — Design Partner status"
          value={`${counter.audits} / ${milestoneTarget} audits`}
          pct={milestonePct}
          color="var(--gold)"
          sub={milestonePct >= 100 ? "Eligible — apply for Design Partner pricing" : `${Math.max(0, milestoneTarget - counter.audits)} more to qualify`}
        />
        <MetricBlock
          label="Engagement score"
          value={`${engagement} / 100`}
          pct={engagement}
          color={engagement >= 60 ? "var(--green)" : engagement >= 30 ? "var(--amber)" : "var(--red)"}
          sub="Audits + outcomes logged + notes added"
        />
        <MetricBlock
          label="Corpus contribution"
          value={`${counter.traps} data points`}
          pct={Math.min(100, (counter.traps / 100) * 100)}
          color="var(--blue)"
          sub="Every trap your audits caught feeds the FARaudit corpus"
        />
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 4 }}>
            Win rate (this account)
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: yourWinRate == null ? "var(--t40)" : yourWinRate >= 50 ? "var(--green)" : "var(--amber)" }}>
            {yourWinRate == null ? "—" : `${yourWinRate}%`}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t40)", marginTop: 4 }}>
            {decided.length === 0 ? "Mark outcomes on /audit/[id] to see your win rate" : `${wins} won · ${decided.length - wins} lost · ${decided.length} decided`}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBlock({ label, value, pct, color, sub }: { label: string; value: string; pct: number; color: string; sub: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", letterSpacing: ".12em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 3, background: "rgba(201,168,76,.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, opacity: 0.6 }} />
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ProtestPanel() {
  const [data, setData] = useState<{ decisions: Array<{ docket: string; agency: string | null; protester: string | null; outcome: string | null; ground: string | null; decision_date: string | null; decision_url: string | null }>; agencies: Array<{ agency: string; total: number; sustained: number; sustained_rate: number; recent_grounds: string[] }>; fetched_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/protest-intel");
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        setData(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Protest Intelligence · GAO public decisions</div>
          <div className="is-refresh">
            {data?.fetched_at
              ? `Last fetch ${new Date(data.fetched_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · 6h cache`
              : "RSS-cached · 6h TTL"}
          </div>
        </div>
        {loading && <div className="empty-block">Loading GAO protest decisions…</div>}
        {err && <div className="ko-status error">{err}</div>}
        {data && (
          <>
            {data.agencies.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>Per-agency protest risk</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                  {data.agencies.slice(0, 12).map((a) => {
                    const risk = a.sustained_rate >= 25 ? "HIGH" : a.sustained_rate >= 10 ? "MEDIUM" : "LOW";
                    const color = risk === "HIGH" ? "var(--red)" : risk === "MEDIUM" ? "var(--amber)" : "var(--green)";
                    return (
                      <div key={a.agency} style={{ background: "var(--void3)", border: "1px solid var(--border)", borderLeft: `3px solid ${color}`, borderRadius: 3, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }} title={a.agency}>{a.agency}</span>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, color, letterSpacing: ".1em" }}>{risk}</span>
                        </div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--t60)", marginTop: 4 }}>
                          {a.sustained}/{a.total} sustained · {a.sustained_rate}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>Recent decisions</div>
            <div className="sam-table">
              <div className="sam-th" style={{ gridTemplateColumns: "100px 130px 1fr 130px 90px" }}>
                <span>Decision</span><span>Docket</span><span>Protester / ground</span><span>Agency</span><span>Outcome</span>
              </div>
              {data.decisions.length === 0 && (
                <div className="empty-state">
                  Awaiting first GAO refresh — gao.gov RSS sometimes returns no items on quiet days.
                  Cache rebuilds every 6 hours; reload after the next fetch window if this stays empty.
                </div>
              )}
              {data.decisions.map((d) => {
                const out = (d.outcome || "").toLowerCase();
                const color = out === "sustained" ? "var(--red)" : out === "denied" ? "var(--green)" : "var(--t60)";
                return (
                  <a key={d.docket} className="sam-row" style={{ gridTemplateColumns: "100px 130px 1fr 130px 90px", textDecoration: "none", color: "inherit" }} href={d.decision_url || "#"} target="_blank" rel="noopener noreferrer">
                    <span className="sr-date">{d.decision_date ? new Date(d.decision_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                    <span className="sr-num">{d.docket}</span>
                    <span className="sr-title" title={d.ground || ""}>
                      <span style={{ color: "var(--text)" }}>{d.protester || "—"}</span>
                      {d.ground && <span style={{ color: "var(--t60)", marginLeft: 8 }}>· {d.ground.slice(0, 100)}</span>}
                    </span>
                    <span className="sr-agency">{d.agency || "—"}</span>
                    <span className="sr-badge" style={{ color, background: "transparent", border: `1px solid ${color}40` }}>{d.outcome || "—"}</span>
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RegulatoryPanel() {
  const [data, setData] = useState<{ updates: Array<{ source: string; clause: string | null; title: string; summary: string | null; link: string; published_at: string | null; affects_clauses: string[] }>; fetched_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filterClause, setFilterClause] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/regulatory-updates${filterClause ? `?clause=${encodeURIComponent(filterClause)}` : ""}`);
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        setData(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [filterClause]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Regulatory Updates · FAR · DFARS · Federal Register</div>
          <div className="is-refresh">
            <input
              type="text"
              value={filterClause}
              onChange={(e) => setFilterClause(e.target.value.toUpperCase())}
              placeholder="Filter by clause (e.g. DFARS 252.204-7012)"
              style={{ ...inputStyle, width: 260 }}
            />
          </div>
        </div>
        {loading && <div className="empty-block">Loading regulatory feeds…</div>}
        {err && <div className="ko-status error">{err}</div>}
        {data && data.updates.length === 0 && (
          <div className="empty-state">
            {filterClause
              ? `No updates match "${filterClause}". Clear the filter to see the full feed.`
              : "Awaiting first regulatory refresh — pulls FAR · DFARS · Federal Register on demand and caches 6h. Reload after the next fetch window if this stays empty."}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 14 }}>
          {data?.updates.map((u, i) => (
            <a key={i} href={u.link} target="_blank" rel="noopener noreferrer" style={{ display: "block", background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: "14px 16px", textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, padding: "2px 8px", borderRadius: 2, color: "var(--gold)", border: "1px solid var(--border2)" }}>{u.source.toUpperCase()}</span>
                {u.clause && <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--blue)" }}>{u.clause}</span>}
                {u.published_at && <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--t40)", marginLeft: "auto" }}>{new Date(u.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, marginBottom: 6 }}>{u.title}</div>
              {u.summary && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--t60)", lineHeight: 1.5 }}>{u.summary.slice(0, 280)}{u.summary.length > 280 ? "…" : ""}</div>}
              {u.affects_clauses.length > 0 && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(201,168,76,.04)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)" }}>
                  Affects: {u.affects_clauses.slice(0, 5).join(" · ")}
                </div>
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CmmcLevel { label: string; practices: number; summary: string; triggers: string[]; checklist: string[] }

function CMMCPanel() {
  const [data, setData] = useState<{ reference: Record<string, CmmcLevel>; distribution: Record<string, number>; recent_by_level: Record<string, Array<{ id: string; notice_id: string | null; solicitation_number: string | null; agency: string | null }>>; total_audited: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeLevel, setActiveLevel] = useState<"1" | "2" | "3">("2");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cmmc-readiness");
        const d = await res.json();
        if (!cancelled && res.ok) setData(d);
      } catch { /* */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="intel-tab-content"><div className="intel-section"><div className="empty-block">Loading CMMC reference…</div></div></div>;
  if (!data) return <div className="intel-tab-content"><div className="intel-section"><div className="ko-status error">Failed to load CMMC reference.</div></div></div>;

  const level = data.reference[activeLevel];

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">CMMC Readiness · Levels 1 / 2 / 3</div>
          <div className="is-refresh">{data.total_audited} audits assessed · {data.distribution["2"] + data.distribution["3"]} require Level 2+</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
          {(["0", "1", "2", "3"] as const).map((lvl) => {
            const labels = { "0": "Not required", "1": "Level 1", "2": "Level 2", "3": "Level 3" };
            const colors = { "0": "var(--green)", "1": "var(--gold)", "2": "var(--amber)", "3": "var(--red)" };
            return (
              <div key={lvl} style={{ background: "var(--void3)", border: `1px solid ${colors[lvl]}40`, borderRadius: 3, padding: "14px 16px" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: colors[lvl], letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>{labels[lvl]}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: colors[lvl], lineHeight: 1 }}>{data.distribution[lvl]}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(["1", "2", "3"] as const).map((lvl) => {
            const active = lvl === activeLevel;
            return (
              <button
                key={lvl}
                onClick={() => setActiveLevel(lvl)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)", cursor: "pointer"
                }}
              >
                Level {lvl}
              </button>
            );
          })}
        </div>

        {level && (
          <div style={{ background: "var(--void3)", border: "1px solid var(--border)", borderRadius: 4, padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{level.label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--gold)", letterSpacing: ".06em", marginBottom: 10 }}>{level.practices} practices · triggered by: {level.triggers.join(" · ")}</div>
            <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)", lineHeight: 1.6, marginBottom: 14 }}>{level.summary}</p>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>Implementation checklist</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {level.checklist.map((c, i) => (
                <li key={i} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", lineHeight: 1.5, padding: "6px 0", borderBottom: "1px solid rgba(201,168,76,.05)", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--gold)" }}>—</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(96,165,250,.05)", borderLeft: "3px solid var(--blue)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--blue)" }}>C3PAO Directory:</strong>{" "}
              <a href="https://cyberab.org/Catalog/C3PAOs" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>cyberab.org/Catalog/C3PAOs</a>
              {" — "}assessment partners authorized for Level 2 third-party assessments.
            </div>
          </div>
        )}

        {data.recent_by_level[activeLevel] && data.recent_by_level[activeLevel].length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--gold)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>Recent Level {activeLevel} solicitations from your audits</div>
            {data.recent_by_level[activeLevel].map((a) => (
              <a key={a.id} href={auditHref(a)} style={{ display: "block", padding: "8px 12px", borderLeft: "2px solid var(--gold)", marginBottom: 6, fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", textDecoration: "none" }}>
                {displaySolicitationId(a)} <span style={{ color: "var(--t40)" }}>· {a.agency || "—"}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface LaborRow { category: string; category_group?: string; naics_codes: string[]; rate_low: number; rate_median: number; rate_high: number; source: string; curated: boolean }

type LaborGroup = "all" | "engineering" | "program" | "manufacturing" | "logistics" | "security";
const LABOR_GROUP_LABELS: Record<LaborGroup, string> = {
  all: "All",
  engineering: "Engineering",
  program: "Program / Contracts",
  manufacturing: "Manufacturing",
  logistics: "Logistics",
  security: "Security"
};

function LaborRatesPanel(_props: { naicsOptions: string[] }) {
  const [naics, setNaics] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<LaborGroup>("all");
  const [rows, setRows] = useState<LaborRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (naics) params.set("naics", naics);
        if (q) params.set("q", q);
        const res = await fetch(`/api/labor-rates${params.toString() ? `?${params}` : ""}`);
        const d = await res.json();
        if (!cancelled && res.ok) setRows(d.rates || []);
      } catch { /* */ } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [naics, q]);

  return (
    <div className="intel-tab-content">
      <div className="intel-section">
        <div className="is-header">
          <div className="is-title">Labor Rate Intelligence · SCA + corpus benchmarks</div>
          <div className="is-refresh">
            <NaicsCombobox
              value={naics}
              onChange={setNaics}
              options={DEFENSE_NAICS}
              includeAll
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search category…"
              style={{ ...inputStyle, marginLeft: 8, width: 220 }}
            />
          </div>
        </div>
        {/* Category-group tab bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {(Object.keys(LABOR_GROUP_LABELS) as LaborGroup[]).map((g) => {
            const active = g === groupFilter;
            return (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                style={{
                  fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".08em", textTransform: "uppercase",
                  padding: "5px 12px", borderRadius: 2,
                  background: active ? "rgba(201,168,76,.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(201,168,76,.32)" : "var(--border)"}`,
                  color: active ? "var(--gold)" : "var(--t40)", cursor: "pointer"
                }}
              >
                {LABOR_GROUP_LABELS[g]}
              </button>
            );
          })}
        </div>

        {loading && <div className="empty-block">Loading rates…</div>}
        {!loading && rows.length === 0 && <div className="empty-state">No rates match this filter.</div>}

        <div className="sam-table">
          <div className="sam-th" style={{ gridTemplateColumns: "1.4fr 80px 90px 90px 90px 1fr" }}>
            <span>Labor category</span><span>NAICS</span><span>Low</span><span>Median</span><span>High</span><span>Source</span>
          </div>
          {rows
            .filter((r) => groupFilter === "all" ? true : r.category_group === groupFilter)
            .sort((a, b) => a.category.localeCompare(b.category))
            .map((r, i) => (
            <div key={i} className="sam-row" style={{ gridTemplateColumns: "1.4fr 80px 90px 90px 90px 1fr" }}>
              <span className="sr-title">{r.category}{r.curated && <span style={{ marginLeft: 8, fontFamily: "var(--mono)", fontSize: 8, color: "var(--green)" }}>· curated</span>}</span>
              <span className="sr-num">{r.naics_codes[0] || "—"}</span>
              <span className="sr-num" style={{ color: "var(--t60)" }}>${r.rate_low}</span>
              <span className="sr-num" style={{ color: "var(--gold)", fontWeight: 700 }}>${r.rate_median}</span>
              <span className="sr-num" style={{ color: "var(--t60)" }}>${r.rate_high}</span>
              <span className="sr-agency" title={r.source}>{r.source.slice(0, 36)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function CapTagList({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {values.map((v, i) => (
          <span key={`${v}-${i}`} style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 2, background: "rgba(201,168,76,.08)", border: "1px solid var(--border2)", color: "var(--gold)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              style={{ background: "transparent", border: "none", color: "var(--gold)", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1, padding: 0 }}
              aria-label="Remove"
            >×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const v = draft.trim();
            if (v && !values.includes(v)) onChange([...values, v]);
            setDraft("");
          }
        }}
        placeholder="Add — press Enter"
        style={{ ...inputStyle, width: "100%" }}
      />
    </div>
  );
}

