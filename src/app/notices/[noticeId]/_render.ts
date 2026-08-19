/* Render helpers for /notices/<noticeId>.
 *
 * SEPARATE FROM route.ts BECAUSE NEXT REQUIRES IT. A route file may export only route
 * handlers and the framework's config keys; exporting renderNotice() from it made the
 * build fail with "does not match the required types of a Next.js Route". `tsc --noEmit`
 * passes on that file happily — the constraint is the framework's, and only `next build`
 * enforces it. Same split as audits/[id], which keeps _view-model.ts and _render.ts
 * beside its route for the same reason.
 */
import type { OpportunityRow } from "@/lib/bd-os/queries";
import { resolveOfficeLeaf } from "@/lib/sam";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Whole days from now, or null when the notice carries no readable deadline. */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* A deadline that has passed, a deadline we never received, and a deadline still open
   are three different facts. The key names its own value rather than sitting fixed over
   an em dash — the same rule the Week Ahead card follows. */
export function deadlineCell(row: OpportunityRow): { k: string; v: string; cls: string } {
  const raw = row.response_deadline;
  if (!raw) return { k: "Deadline", v: "not recorded", cls: "" };
  const d = daysUntil(raw);
  if (d === null) return { k: "Deadline", v: "not recorded", cls: "" };
  if (d < 0) return { k: "Closed", v: fmtDate(raw), cls: "" };
  if (d === 0) return { k: "Due", v: "Today", cls: "due" };
  return { k: "Offers due in", v: `${d} day${d === 1 ? "" : "s"}`, cls: d <= 7 ? "warn" : "" };
}

/** The page body for a notice this customer's feed actually holds. */
export function renderNotice(row: OpportunityRow): string {
  const dl = deadlineCell(row);
  const title = String(row.title || "").trim() || String(row.solicitation_number || "Untitled notice");
  /* office_path is SAM's fullParentPathName — a DOTTED MACHINE PATH, never a display
     string, and `agency` is built out of it: resolveAgency() splits on "." and re-joins
     the first two segments with " \u00b7 ". So agency is a PREFIX of office_path in a
     different alphabet, and the old `office !== agency` guard could not once be equal —
     it compared "A.B.C" to "A \u00b7 B". Every notice carrying a multi-segment path
     therefore rendered the raw path AND then repeated the department and service after
     it. Fixed by showing the buying-office LEAF over the hierarchy, which is what
     resolveOfficeLeaf() was written for (FA-151) and what the list already does. */
  const leaf = resolveOfficeLeaf({ fullParentPathName: row.office_path });
  const agency = String(row.agency || "").trim();
  const buyer = leaf && agency
    ? `<b>${esc(leaf)}</b> &middot; ${esc(agency)}`
    : `<b>${esc(leaf || agency || "Buying office not stated")}</b>`;
  const sol = String(row.solicitation_number || row.notice_id || "").trim();
  const noticeId = String(row.notice_id || "").trim();

  const chips = [
    row.naics_code ? `<span class="chip naics">${esc(row.naics_code)}</span>` : "",
    row.set_aside ? `<span class="chip">${esc(row.set_aside)}</span>` : "",
    row.notice_type ? `<span class="chip stage">${esc(row.notice_type)}</span>` : "",
  ].filter(Boolean).join("");

  /* The audit control is the SAME link the card carries, including the reason it is
     unavailable. A Special Notice has no solicitation document to read, and saying so
     is more useful than a button that fails. */
  const auditRef = noticeId || sol;
  const canAudit = Boolean(auditRef) && String(row.notice_type || "").toLowerCase().indexOf("special") === -1;
  const auditBtn = canAudit
    ? `<a class="nd-btn" href="/audits?noticeId=${encodeURIComponent(auditRef)}&amp;sol=${encodeURIComponent(sol)}">Run audit</a>`
    : `<span class="nd-btn off" title="No solicitation document has posted for this requirement yet">No solicitation yet</span>`;

  const samUrl = noticeId
    ? `https://sam.gov/opp/${encodeURIComponent(noticeId)}/view`
    : "";

  return `
      <div class="nd-head">
        <h1 class="nd-title">${esc(title)}</h1>
        <div class="nd-buyer">${buyer}</div>
        <div class="nd-id">${esc(sol || "No solicitation number")}</div>
        <div class="nd-chips">${chips}</div>
      </div>

      <div class="nd-grid">
        <div class="nd-fact"><div class="k">${esc(dl.k)}</div><div class="v ${dl.cls}">${esc(dl.v)}</div></div>
        <div class="nd-fact"><div class="k">Posted</div><div class="v">${esc(fmtDate(row.created_at) || "not stated")}</div></div>
      </div>

      <div class="nd-sec">
        <div class="nd-acts">
          ${auditBtn}
          ${samUrl ? `<a class="nd-btn2" href="${esc(samUrl)}" target="_blank" rel="noopener noreferrer">SAM.gov view notice &#8599;</a>` : ""}
        </div>
      </div>

      <div class="nd-sec">
        <h2>What the agency posted</h2>
        <div class="nd-desc" id="ndDesc"><span class="nd-state">reading SAM&hellip;</span></div>
      </div>

      <div class="nd-sec">
        <h2>Documents</h2>
        <div class="nd-docs" id="ndDocs"><span class="nd-state">reading SAM&hellip;</span></div>
      </div>

      <script>
      /* The SAME two endpoints the list calls per card. No new route, no server copy —
         one implementation of "what does SAM say about this notice". */
      (function () {
        var id = ${JSON.stringify(noticeId)};
        var desc = document.getElementById('ndDesc');
        var docs = document.getElementById('ndDocs');
        function state(el, msg) { el.innerHTML = '<span class="nd-state"></span>'; el.firstChild.textContent = msg; }
        if (!id) {
          state(desc, 'SAM published no notice id for this record, so its text cannot be resolved.');
          state(docs, 'No notice id — no attachment list.');
          return;
        }
        fetch('/api/notice-description?noticeId=' + encodeURIComponent(id), { credentials: 'include' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d) { state(desc, 'could not read SAM just now'); return; }
            if (!d.description) { state(desc, d.reason === 'empty-body' ? 'SAM published no description for this notice.' : 'could not read SAM just now'); return; }
            desc.textContent = d.description;
          })
          .catch(function () { state(desc, 'could not read SAM just now'); });

        fetch('/api/notice-attachments?noticeId=' + encodeURIComponent(id), { credentials: 'include' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            /* null is a FAILED read and [] is "SAM listed none" — different facts, and
               the panel must not render them alike. */
            if (!d || d.attachments === null || d.attachments === undefined) { state(docs, 'could not read the attachment list just now'); return; }
            if (!d.attachments.length) { state(docs, 'SAM lists no attachments on this notice.'); return; }
            docs.innerHTML = '';
            d.attachments.forEach(function (a, i) {
              var el = document.createElement('a');
              el.className = 'nd-doc';
              el.href = a.url || a.link || '#';
              el.target = '_blank';
              el.rel = 'noopener noreferrer';
              var name = document.createElement('span');
              name.textContent = a.name || a.title || ('Document ' + (i + 1));
              var ext = document.createElement('span');
              ext.className = 'ext';
              ext.textContent = 'sam.gov';
              el.appendChild(name); el.appendChild(ext);
              docs.appendChild(el);
            });
          })
          .catch(function () { state(docs, 'could not read the attachment list just now'); });
      })();
      </script>`;
}

/* NOT IN YOUR FEED IS NOT NOT-FOUND. A shared link lands here whenever the notice sits
   outside the reader's NAICS scope, or has aged out of the window. Saying which is the
   difference between a page that looks broken and one that explains itself — and the
   SAM link still works, so the visit is not wasted. */
export function renderOutOfScope(noticeId: string, feedFailed: boolean): string {
  if (feedFailed) {
    return `
      <div class="nd-head"><h1 class="nd-title">This notice could not be read</h1></div>
      <div class="nd-miss">The live SAM feed did not answer, so we cannot show this notice right now.
      <b>This is not an empty result</b> — it is a failed read, and retrying shortly usually resolves it.</div>`;
  }
  const samUrl = `https://sam.gov/opp/${encodeURIComponent(noticeId)}/view`;
  return `
      <div class="nd-head"><h1 class="nd-title">This notice is not in your feed</h1></div>
      <div class="nd-miss">
        <b>Nothing is wrong with the link.</b> Your feed is scoped to the NAICS codes on your
        capability statement and to the current posting window, and this notice falls outside one
        of them &mdash; most often because it belongs to a different code, or because it has aged
        out. It still exists on SAM.
        <div class="nd-acts" style="margin-top:14px">
          <a class="nd-btn2" href="${esc(samUrl)}" target="_blank" rel="noopener noreferrer">SAM.gov view notice &#8599;</a>
          <a class="nd-btn2" href="/settings">Change your NAICS codes</a>
        </div>
      </div>`;
}
