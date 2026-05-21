'use client'
import React, { useState } from 'react'
import type { HomeStats, OpportunityRow, AuditRow } from '@/lib/bd-os/queries'
import { ScoreChip }      from '@/components/ds/ScoreChip'
import { TrapBadge }      from '@/components/ds/TrapBadge'
import { InsightCallout } from '@/components/ds/InsightCallout'
import { WidgetCard }     from '@/components/ds/WidgetCard'
import { KPIHeroCard }    from '@/components/ds/KPIHeroCard'
import { ThemeToggle }    from '@/components/ds/ThemeToggle'

/* ─── types ──────────────────────────────────────────────── */
interface Props {
  stats:        HomeStats
  opportunities: OpportunityRow[]
  recentAudits: AuditRow[]
  userEmail:    string
}

type FeedFilter = 'all' | 'urgent' | 'expiring' | 'pipeline' | 'small-biz'
type FeedView   = 'cards' | 'compact'
type SortKey    = 'score' | 'deadline' | 'agency'

/* ─── helpers ────────────────────────────────────────────── */
function urgencyClass(o: OpportunityRow): 'urgent' | 'watch' | 'new' | '' {
  if ((o.compliance_score ?? 100) < 40)  return 'urgent'
  if ((o.compliance_score ?? 100) < 70)  return 'watch'
  if (o.response_deadline) {
    const days = Math.ceil(
      (new Date(o.response_deadline).getTime() - Date.now()) / 86400000
    )
    if (days <= 7)  return 'urgent'
    if (days <= 21) return 'watch'
  }
  return 'new'
}

function borderColor(u: 'urgent' | 'watch' | 'new' | ''): string {
  if (u === 'urgent') return 'var(--ds-red-500)'
  if (u === 'watch')  return 'var(--ds-amber-400)'
  return 'var(--ds-blue-500)'
}

function daysLabel(deadline?: string | null): string {
  if (!deadline) return ''
  const d = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / 86400000
  )
  if (d < 0)  return 'Expired'
  if (d === 0) return 'Due today'
  if (d === 1) return '1 day left'
  return `${d}d left`
}

function daysColor(deadline?: string | null): string {
  if (!deadline) return 'var(--ds-text-secondary)'
  const d = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / 86400000
  )
  if (d <= 3)  return 'var(--ds-red-500)'
  if (d <= 7)  return 'var(--ds-amber-500)'
  return 'var(--ds-text-secondary)'
}

/* ─── insight generator (deterministic, no API call) ─────── */
function generateInsight(o: OpportunityRow): string {
  const parts: string[] = []
  if (o.document_type === 'PWS')
    parts.push('PWS detected — outcome-based proposal required')
  else if (o.document_type === 'SOO')
    parts.push('SOO detected — propose your own performance work statement')
  else if (o.document_type === 'SOW')
    parts.push('SOW — compliance-first task-based proposal')
  if (o.set_aside === 'SBA' || o.set_aside?.includes('Small'))
    parts.push('100% small business set-aside')
  if (o.risk_level === 'high' || (o.compliance_score ?? 100) < 40)
    parts.push('high compliance risk — audit before bidding')
  if (!o.is_audited)
    parts.push('not yet audited — run audit to reveal traps')
  if (parts.length === 0)
    parts.push(`${o.naics_code ?? 'NAICS'} · ${o.set_aside ?? 'unrestricted'} · review solicitation`)
  return parts.join(' · ')
}

/* ─── stage badge helper ──────────────────────────────────── */
function stageBadge(a: AuditRow) {
  if (a.outcome === 'won')
    return { label: 'Won', bg: 'var(--ds-green-100)', color: 'var(--ds-green-600)' }
  if (a.outcome === 'lost')
    return { label: 'Lost', bg: 'var(--ds-red-100)', color: 'var(--ds-red-600)' }
  if (a.bid_submitted)
    return { label: 'Submitted', bg: 'var(--ds-amber-100)', color: 'var(--ds-amber-600)' }
  if (a.status === 'completed')
    return { label: 'Audited', bg: 'var(--ds-blue-100)', color: 'var(--ds-blue-600)' }
  return { label: 'In progress', bg: 'var(--ds-surface-1)', color: 'var(--ds-text-secondary)' }
}

/* ─── MAIN COMPONENT ─────────────────────────────────────── */
export function CommandCenterClient({ stats, opportunities, recentAudits, userEmail }: Props) {
  const [filter,   setFilter]   = useState<FeedFilter>('all')
  const [view,     setView]     = useState<FeedView>('cards')
  const [sort,     setSort]     = useState<SortKey>('score')
  const [customize, setCustomize] = useState(false)
  const [expanded, setExpanded]  = useState<string | null>(null)

  /* ── filtered + sorted feed ── */
  const feed = React.useMemo(() => {
    let rows = [...opportunities]
    if (filter === 'urgent')
      rows = rows.filter(o => urgencyClass(o) === 'urgent')
    else if (filter === 'expiring')
      rows = rows.filter(o => {
        if (!o.response_deadline) return false
        const d = Math.ceil((new Date(o.response_deadline).getTime() - Date.now()) / 86400000)
        return d <= 7
      })
    else if (filter === 'pipeline')
      rows = rows.filter(o => o.in_pipeline)
    else if (filter === 'small-biz')
      rows = rows.filter(o => o.set_aside && o.set_aside !== 'None')

    if (sort === 'score')
      rows.sort((a, b) => (b.compliance_score ?? 0) - (a.compliance_score ?? 0))
    else if (sort === 'deadline')
      rows.sort((a, b) => {
        if (!a.response_deadline) return 1
        if (!b.response_deadline) return -1
        return new Date(a.response_deadline).getTime() - new Date(b.response_deadline).getTime()
      })
    else if (sort === 'agency')
      rows.sort((a, b) => (a.agency ?? "").localeCompare(b.agency ?? ""))

    return rows
  }, [opportunities, filter, sort])

  const urgentCount  = opportunities.filter(o => urgencyClass(o) === 'urgent').length
  const pipelineRows = recentAudits.filter(a => a.in_pipeline).slice(0, 5)
  const winCount     = recentAudits.filter(a => a.outcome === 'won').length
  const lossCount    = recentAudits.filter(a => a.outcome === 'lost').length
  const decidedCount = winCount + lossCount
  const winRate      = decidedCount > 0 ? Math.round((winCount / decidedCount) * 100) : 0

  /* ── shared style tokens ── */
  const T = {
    pageBg:   'var(--ds-page-bg)',
    cardBg:   'var(--ds-card-bg)',
    surface1: 'var(--ds-surface-1)',
    border:   'var(--ds-border-default)',
    text:     'var(--ds-text-primary)',
    muted:    'var(--ds-text-secondary)',
    navy:     'var(--ds-navy-800)',
    blue:     'var(--ds-blue-600)',
    shadow:   'var(--ds-shadow-card)',
    radius:   'var(--ds-radius-lg)',
    topbar:   'var(--ds-topbar-bg)',
    topbarTxt:'var(--ds-topbar-text)',
    topbarBdr:'var(--ds-topbar-border)',
    sbBg:     'var(--ds-sidebar-bg)',
    sbText:   'var(--ds-sidebar-text)',
    sbActive: 'var(--ds-sidebar-active-bg)',
    sbActTxt: 'var(--ds-sidebar-text-active)',
    sbBorder: 'var(--ds-sidebar-border)',
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:T.pageBg, fontFamily:'var(--font-sans,-apple-system,BlinkMacSystemFont,"Inter",sans-serif)', fontSize:13, color:T.text, overflow:'hidden' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{ width:56, minWidth:56, background:T.sbBg, display:'flex', flexDirection:'column', alignItems:'center', zIndex:10, flexShrink:0 }}>
        {/* Logo */}
        <div style={{ width:56, height:52, display:'flex', alignItems:'center', justifyContent:'center', borderBottom:`0.5px solid ${T.sbBorder}`, flexShrink:0 }}>
          <div style={{ width:28, height:28, background:'var(--ds-blue-600)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:600 }}>F</div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 0', display:'flex', flexDirection:'column', gap:4, alignItems:'center', width:'100%' }}>
          {[
            { icon:'⬡', label:'Command Center', active:true  },
            { icon:'◎', label:'Pursue',          active:false },
            { icon:'◈', label:'Intelligence',    active:false },
            { icon:'◉', label:'Account',         active:false },
          ].map(item => (
            <div key={item.label} title={item.label} style={{
              width:40, height:40, borderRadius:10,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:18, cursor:'pointer',
              color: item.active ? T.sbActTxt : T.sbText,
              background: item.active ? T.sbActive : 'transparent',
              borderLeft: item.active ? '3px solid var(--ds-blue-500)' : '3px solid transparent',
              transition:'all 0.15s',
            }}>{item.icon}</div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding:'12px 0', display:'flex', flexDirection:'column', gap:4, alignItems:'center', borderTop:`0.5px solid ${T.sbBorder}`, width:'100%' }}>
          <div title="Search"   style={{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:T.sbText, cursor:'pointer' }}>⌕</div>
          <div title="Settings" style={{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, color:T.sbText, cursor:'pointer' }}>⚙</div>
          <div title={userEmail} style={{ width:32, height:32, borderRadius:'50%', background:'var(--ds-blue-600)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', marginTop:4 }}>
            {userEmail.slice(0,2).toUpperCase()}
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Topbar */}
        <header style={{ height:52, background:T.topbar, borderBottom:`0.5px solid ${T.topbarBdr}`, display:'flex', alignItems:'center', padding:'0 20px', gap:12, flexShrink:0, zIndex:5 }}>
          <span style={{ fontSize:14, fontWeight:500, color:T.topbarTxt }}>Command Center</span>
          <div style={{ display:'flex', alignItems:'center', gap:5, background:'var(--ds-blue-100)', color:'var(--ds-blue-600)', fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#16a34a', display:'inline-block' }} />
            SAM.gov live
          </div>
          <span style={{ fontSize:12, color:T.muted }}>{stats.audit_activity_month} audits · {stats.total_traps_caught} traps caught</span>

          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            <ThemeToggle />
            <a href="/home" style={{ fontSize:11, padding:'5px 10px', border:`0.5px solid ${T.topbarTxt === '#fff' || T.topbarTxt === 'var(--ds-text-inverse)' ? 'rgba(255,255,255,0.2)' : 'var(--ds-border-medium)'}`, borderRadius:'var(--ds-radius-md)', background:'transparent', cursor:'pointer', color:T.topbarTxt, textDecoration:'none', opacity:0.7 }}>
              ← Classic view
            </a>
            <button
              onClick={() => { window.location.href = '/audit' }}
              style={{ fontSize:12, padding:'6px 14px', border:'none', borderRadius:'var(--ds-radius-md)', background:'var(--ds-blue-600)', cursor:'pointer', color:'#fff', fontWeight:500, display:'flex', alignItems:'center', gap:5 }}
            >
              + Run audit
            </button>
          </div>
        </header>

        {/* Canvas */}
        <main style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Customize bar */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:11, color:T.muted }}>
              <div
                onClick={() => setCustomize(c => !c)}
                style={{ width:32, height:18, borderRadius:9, background: customize ? 'var(--ds-blue-600)' : 'var(--ds-surface-1)', border:`0.5px solid ${customize ? 'var(--ds-blue-600)' : 'var(--ds-border-medium)'}`, cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}
              >
                <div style={{ position:'absolute', top:3, left: customize ? 17 : 3, width:12, height:12, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 2px rgba(0,0,0,0.2)' }} />
              </div>
              Customize layout
            </label>
            {customize && <span style={{ fontSize:11, color:'var(--ds-blue-600)' }}>Drag widgets to rearrange · Pull corner to resize</span>}
            <span style={{ marginLeft:'auto', fontSize:11, color:T.muted }}>Design Partner · {Math.max(0, Math.ceil((new Date('2026-07-21').getTime() - Date.now()) / 86400000))}d remaining</span>
          </div>

          {/* ── HERO STRIP ── */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:10 }}>
            <KPIHeroCard
              variant="navy"
              label="Intelligence feed"
              value={opportunities.length}
              sub={`Active federal solicitations across your NAICS codes · updated by sam-ingest`}
              ctaLabel="Open feed"
              onCta={() => {}}
            />
            <KPIHeroCard
              variant="red"
              label="Act today"
              value={urgentCount}
              sub="Traps or deadlines requiring immediate attention"
              ctaLabel="Review now"
              onCta={() => setFilter('urgent')}
              topBorder
            />
            <KPIHeroCard
              variant="amber"
              label="Traps caught"
              value={stats.total_traps_caught}
              sub="Compliance risks flagged across all audits"
              ctaLabel="View audits"
              onCta={() => {}}
            />
            <KPIHeroCard
              variant="teal"
              label="Audits this month"
              value={stats.audit_activity_month}
              sub={`${stats.critical_p0} critical · compliance engine active`}
              ctaLabel="View activity"
              onCta={() => {}}
            />
          </div>

          {/* ── MAIN GRID ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:12, flex:1, minHeight:0 }}>

            {/* ── LEFT: Intelligence Feed ── */}
            <WidgetCard
              title="Intelligence feed"
              badge={{ label: `${urgentCount} urgent`, variant: urgentCount > 0 ? 'red' : 'gray' }}
              noPad
              action={
                <div style={{ display:'flex', gap:4 }}>
                  {(['cards','compact'] as FeedView[]).map(v => (
                    <button key={v} onClick={() => setView(v)} style={{ fontSize:10, padding:'2px 7px', borderRadius:5, border:`0.5px solid var(--ds-border-medium)`, background: view===v ? 'var(--ds-surface-1)' : 'transparent', cursor:'pointer', color:T.muted }}>
                      {v === 'cards' ? '⊞' : '☰'}
                    </button>
                  ))}
                </div>
              }
            >
              {/* Filter bar */}
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderBottom:`0.5px solid var(--ds-border-default)`, flexWrap:'wrap' }}>
                {([
                  ['all',       'All'],
                  ['urgent',    'Urgent'],
                  ['expiring',  '≤7 days'],
                  ['pipeline',  'Pipeline'],
                  ['small-biz', 'Small biz'],
                ] as [FeedFilter, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setFilter(key)} style={{
                    fontSize:11, padding:'3px 10px', borderRadius:12,
                    border:`0.5px solid ${filter===key ? 'var(--ds-navy-800)' : 'var(--ds-border-medium)'}`,
                    background: filter===key ? 'var(--ds-navy-800)' : 'transparent',
                    color: filter===key ? '#fff' : T.muted,
                    cursor:'pointer', fontWeight: filter===key ? 500 : 400,
                  }}>{label}</button>
                ))}
                <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                  {([['score','Score'],['deadline','Deadline'],['agency','Agency']] as [SortKey,string][]).map(([key,label]) => (
                    <button key={key} onClick={() => setSort(key)} style={{ fontSize:10, padding:'2px 7px', borderRadius:5, border:`0.5px solid var(--ds-border-medium)`, background: sort===key ? 'var(--ds-blue-100)' : 'transparent', color: sort===key ? 'var(--ds-blue-600)' : T.muted, cursor:'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed rows */}
              <div className="ds-stagger-children" style={{ overflowY:'auto', maxHeight:'calc(100vh - 340px)', padding:'6px 10px' }}>
                {feed.length === 0 && (
                  <div style={{ padding:'24px 0', textAlign:'center', color:T.muted, fontSize:12 }}>No solicitations match this filter.</div>
                )}
                {feed.map((o, idx) => {
                  const urg  = urgencyClass(o)
                  const isOpen = expanded === o.id
                  return (
                    <div key={o.id} style={{
                      background: T.cardBg,
                      border:`0.5px solid var(--ds-border-default)`,
                      borderLeft:`3px solid ${borderColor(urg)}`,
                      borderRadius:'var(--ds-radius-md)',
                      marginBottom:6,
                      cursor:'pointer',
                      transition:'box-shadow 0.15s',
                    }}
                    onClick={() => setExpanded(isOpen ? null : o.id)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = 'var(--ds-shadow-raised)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = 'none'}
                    >
                      {/* Row header */}
                      <div style={{ display:'flex', alignItems:'center', gap:10, padding: view==='compact' ? '7px 10px' : '10px 12px' }}>
                        <ScoreChip score={o.compliance_score ?? 50} size={view==='compact' ? 'sm' : 'md'} animate={idx < 8} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize: view==='compact' ? 12 : 13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {o.solicitation_number ? `${o.solicitation_number} — ` : ''}{o.title}
                          </div>
                          {view !== 'compact' && (
                            <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>{o.agency} · {o.notice_type ?? o.document_type ?? 'RFQ'} · NAICS {o.naics_code}</div>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:5, flexShrink:0, alignItems:'center' }}>
                          {o.document_type && (
                            <span style={{ fontSize:10, padding:'2px 6px', borderRadius:6, background:'var(--ds-blue-100)', color:'var(--ds-blue-600)', fontWeight:600 }}>{o.document_type}</span>
                          )}
                          {o.response_deadline && (
                            <span style={{ fontSize:10, padding:'2px 6px', borderRadius:6, background:'var(--ds-surface-1)', color:daysColor(o.response_deadline), fontWeight:600 }}>
                              {daysLabel(o.response_deadline)}
                            </span>
                          )}
                          {urg === 'urgent' && <TrapBadge severity="P0" animate={idx < 5} />}
                          {urg === 'watch'  && <TrapBadge severity="P1" />}
                        </div>
                      </div>

                      {/* Expanded insight */}
                      {isOpen && (
                        <div style={{ padding:'0 12px 10px' }}>
                          <InsightCallout text={generateInsight(o)} />
                          <div style={{ display:'flex', gap:6, marginTop:8 }}>
                            <button
                              onClick={e => { e.stopPropagation(); window.location.href = '/audit' }}
                              style={{ fontSize:11, padding:'5px 12px', borderRadius:'var(--ds-radius-sm)', border:'none', background:'var(--ds-navy-800)', color:'#fff', cursor:'pointer', fontWeight:500 }}
                            >Run audit</button>
                            <button
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize:11, padding:'5px 12px', borderRadius:'var(--ds-radius-sm)', border:`0.5px solid var(--ds-border-medium)`, background:'transparent', cursor:'pointer', color:T.text }}
                            >{o.in_pipeline ? '✓ In pipeline' : 'Add to pipeline'}</button>
                            {o.pdf_url && (
                              <a href={o.pdf_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                style={{ fontSize:11, padding:'5px 12px', borderRadius:'var(--ds-radius-sm)', border:`0.5px solid var(--ds-border-medium)`, background:'transparent', cursor:'pointer', color:T.text, textDecoration:'none' }}
                              >View PDF</a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </WidgetCard>

            {/* ── RIGHT PANEL ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:10, overflowY:'auto' }}>

              {/* Active Pursuits */}
              <WidgetCard
                title="Active pursuits"
                badge={{ label:`${pipelineRows.length} open`, variant:'blue' }}
                action={
                  <button onClick={() => window.location.href='/home#pipeline'}
                    style={{ fontSize:11, padding:'2px 8px', borderRadius:'var(--ds-radius-sm)', border:`0.5px solid var(--ds-border-medium)`, background:'transparent', cursor:'pointer', color:T.muted }}>
                    + Add
                  </button>
                }
              >
                {pipelineRows.length === 0 ? (
                  <div style={{ fontSize:12, color:T.muted, fontStyle:'italic' }}>No active pursuits yet. Run an audit and add to pipeline.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {pipelineRows.map(a => {
                      const sb = stageBadge(a)
                      const pct = a.status==='completed' ? (a.bid_submitted ? 80 : 60) : 30
                      return (
                        <div key={a.id} style={{ padding:'9px 10px', borderRadius:'var(--ds-radius-md)', background:'var(--ds-surface-1)', border:`0.5px solid var(--ds-border-default)` }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                            <span style={{ fontSize:12, fontWeight:500, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.title}</span>
                            <span style={{ fontSize:10, padding:'2px 6px', borderRadius:6, background:sb.bg, color:sb.color, fontWeight:600, flexShrink:0 }}>{sb.label}</span>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ flex:1, height:4, background:'var(--ds-border-default)', borderRadius:2, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background:'var(--ds-blue-600)', borderRadius:2, transition:'width 0.4s var(--ds-ease-smooth)' }} />
                            </div>
                            <span style={{ fontSize:11, color:daysColor(a.response_deadline), whiteSpace:'nowrap' }}>
                              {daysLabel(a.response_deadline) || (a.bid_submitted ? 'Awaiting award' : '—')}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </WidgetCard>

              {/* Account Intelligence */}
              <WidgetCard title="Account intelligence" badge={{ label:'vs corpus', variant:'gray' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  {[
                    { num: stats.audit_activity_month, label:'Audits (30d)',    color:'var(--ds-navy-800)' },
                    { num: stats.total_traps_caught,   label:'Traps caught',   color:'var(--ds-red-500)'  },
                    { num: stats.critical_p0,          label:'Critical P0',    color:'var(--ds-amber-500)'},
                    { num: `${winRate}%`,              label:'Win rate',       color:'var(--ds-blue-600)' },
                  ].map(item => (
                    <div key={item.label} style={{ background:'var(--ds-surface-1)', borderRadius:'var(--ds-radius-md)', padding:'9px 10px', border:`0.5px solid var(--ds-border-default)` }}>
                      <div style={{ fontSize:22, fontWeight:500, lineHeight:1, color:item.color }}>{item.num}</div>
                      <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:T.muted, marginBottom:3 }}>
                    <span>Win rate · {decidedCount} decided</span>
                    <span style={{ color:'var(--ds-blue-600)', fontWeight:500 }}>{winRate}%</span>
                  </div>
                  <div style={{ height:4, background:'var(--ds-border-default)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${winRate}%`, background:'var(--ds-blue-600)', borderRadius:2 }} />
                  </div>
                </div>
              </WidgetCard>

              {/* Quick audit */}
              <WidgetCard title="Quick audit">
                <button
                  onClick={() => window.location.href = '/audit'}
                  style={{ display:'block', width:'100%', padding:'10px', borderRadius:'var(--ds-radius-md)', border:`1.5px dashed var(--ds-border-medium)`, background:'var(--ds-surface-1)', cursor:'pointer', fontSize:12, color:T.muted, textAlign:'center', transition:'all 0.15s' }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--ds-blue-500)'; el.style.color = 'var(--ds-blue-600)' }}
                  onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--ds-border-medium)'; el.style.color = T.muted }}
                >
                  ⬆ Drop PDF or click to start audit
                </button>
              </WidgetCard>

            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
