/* ═══════════════════════════════════════════════════════════════════
   FARaudit · Contracting Officers (best-in-class) — Relationship CRM data
   Illustrative mock data. Your NAICS: 336413 · 332710 · 332721
   ═══════════════════════════════════════════════════════════════════ */
window.DCO = (function () {

  /* relationship: warm | active | cold | new
     resp = avg response rate to industry (%), respDays = avg days to reply
     awards = $ obligated in your NAICS last 12mo ($M), actions = # awards
     fit = how well their portfolio matches your codes (0-100)
     lastContact = days since you last engaged; touches = engagement history */
  const OFFICERS = [
    {
      id: 'co-hartwell', name: 'Diane Hartwell', initials: 'DH', title: 'Senior Contracting Officer',
      agency: 'NAVSEA', office: 'PEO IWS · Washington Navy Yard', warrant: 'Unlimited', rel: 'warm',
      resp: 88, respDays: 1.4, awards: 142, actions: 23, fit: 94, naics: ['336413', '332721'],
      setaside: 72, lastContact: 6, email: 'd.hartwell@navy.mil', phone: '(202) 555-0142',
      note: 'Replies fast, favors SDVOSB. Met at Sea-Air-Space. Owns SPY-6 sustainment.',
      timeline: [
        { t: 'Email reply', d: '6d ago', kind: 'in' },
        { t: 'You sent capability brief', d: '9d ago', kind: 'out' },
        { t: 'Call — SPY-6 recompete', d: '3w ago', kind: 'call' },
        { t: 'Met at Sea-Air-Space', d: '2mo ago', kind: 'event' }
      ],
      sched: [
        { code: '336413', v: 88 }, { code: '332721', v: 41 }, { code: '332710', v: 13 }
      ]
    },
    {
      id: 'co-okafor', name: 'Marcus Okafor', initials: 'MO', title: 'Contracting Officer',
      agency: 'AFLCMC', office: 'Tinker AFB, OK', warrant: '$25M', rel: 'active',
      resp: 76, respDays: 2.1, awards: 97, actions: 18, fit: 91, naics: ['336413', '332710'],
      setaside: 64, lastContact: 12, email: 'marcus.okafor@us.af.mil', phone: '(405) 555-0178',
      note: 'AWACS + engine hardware. Responsive but high volume. Prefers email RFI responses.',
      timeline: [
        { t: 'RFI response submitted', d: '12d ago', kind: 'out' },
        { t: 'Sources Sought posted', d: '3w ago', kind: 'event' },
        { t: 'Intro email', d: '6w ago', kind: 'out' }
      ],
      sched: [{ code: '336413', v: 62 }, { code: '332710', v: 35 }]
    },
    {
      id: 'co-reyes', name: 'Patricia Reyes', initials: 'PR', title: 'Lead Contract Specialist',
      agency: 'DLA Aviation', office: 'Richmond, VA', warrant: '$10M', rel: 'warm',
      resp: 92, respDays: 0.9, awards: 54, actions: 31, fit: 88, naics: ['336413', '332710', '332721'],
      setaside: 81, lastContact: 4, email: 'patricia.reyes@dla.mil', phone: '(804) 555-0199',
      note: 'Highest responsiveness in your set. Loves SB. Many small actions = relationship gold.',
      timeline: [
        { t: 'Award notice — H-60 parts', d: '4d ago', kind: 'win' },
        { t: 'Email reply', d: '5d ago', kind: 'in' },
        { t: 'You sent past-performance', d: '1w ago', kind: 'out' },
        { t: 'Quarterly check-in call', d: '5w ago', kind: 'call' }
      ],
      sched: [{ code: '336413', v: 28 }, { code: '332710', v: 16 }, { code: '332721', v: 10 }]
    },
    {
      id: 'co-bauer', name: 'Greg Bauer', initials: 'GB', title: 'Contracting Officer',
      agency: 'TACOM', office: 'Detroit Arsenal, MI', warrant: '$50M', rel: 'cold',
      resp: 48, respDays: 5.8, awards: 87, actions: 9, fit: 79, naics: ['332710'],
      setaside: 41, lastContact: 47, email: 'gregory.bauer@army.mil', phone: '(586) 555-0121',
      note: 'Big ceilings, slow to respond. Ground vehicle spares. Worth re-warming before recompete.',
      timeline: [
        { t: 'No reply to follow-up', d: '47d ago', kind: 'out' },
        { t: 'Capability brief sent', d: '2mo ago', kind: 'out' },
        { t: 'LinkedIn connect', d: '4mo ago', kind: 'event' }
      ],
      sched: [{ code: '332710', v: 87 }]
    },
    {
      id: 'co-nakamura', name: 'Lisa Nakamura', initials: 'LN', title: 'Senior Contracting Officer',
      agency: 'NAVAIR', office: 'Patuxent River, MD', warrant: 'Unlimited', rel: 'active',
      resp: 71, respDays: 2.6, awards: 116, actions: 14, fit: 90, naics: ['336413', '332721'],
      setaside: 58, lastContact: 18, email: 'lisa.nakamura@navy.mil', phone: '(301) 555-0156',
      note: 'Flight test instrumentation. Met at NAVAIR Industry Day. Decision-maker on PMA-209.',
      timeline: [
        { t: 'Sent white paper', d: '18d ago', kind: 'out' },
        { t: 'Industry Day Q&A', d: '5w ago', kind: 'event' },
        { t: 'Email reply', d: '7w ago', kind: 'in' }
      ],
      sched: [{ code: '336413', v: 74 }, { code: '332721', v: 42 }]
    },
    {
      id: 'co-castillo', name: 'Raymond Castillo', initials: 'RC', title: 'Contract Specialist',
      agency: 'AFSC', office: 'Robins AFB, GA', warrant: '$15M', rel: 'cold',
      resp: 55, respDays: 4.4, awards: 38, actions: 7, fit: 72, naics: ['336413'],
      setaside: 47, lastContact: 63, email: 'raymond.castillo@us.af.mil', phone: '(478) 555-0188',
      note: 'C-130 structural refurb. Went quiet after Q3. New requirement coming — re-engage now.',
      timeline: [
        { t: 'Unanswered email', d: '63d ago', kind: 'out' },
        { t: 'Call — depot tooling', d: '3mo ago', kind: 'call' }
      ],
      sched: [{ code: '336413', v: 38 }]
    },
    {
      id: 'co-pham', name: 'Kevin Pham', initials: 'KP', title: 'Contracting Officer',
      agency: 'NSWC Crane', office: 'Crane, IN', warrant: '$30M', rel: 'new',
      resp: 67, respDays: 3.1, awards: 29, actions: 11, fit: 85, naics: ['332721', '332710'],
      setaside: 69, lastContact: 2, email: 'kevin.pham@navy.mil', phone: '(812) 555-0133',
      note: 'New contact — energetics machining. Responded to first outreach within 3 days. Nurture.',
      timeline: [
        { t: 'First reply received', d: '2d ago', kind: 'in' },
        { t: 'Cold intro email', d: '5d ago', kind: 'out' }
      ],
      sched: [{ code: '332721', v: 19 }, { code: '332710', v: 10 }]
    },
    {
      id: 'co-willis', name: 'Andrea Willis', initials: 'AW', title: 'Lead Contracting Officer',
      agency: 'SSC', office: 'Peterson SFB, CO', warrant: 'Unlimited', rel: 'new',
      resp: 62, respDays: 3.7, awards: 58, actions: 6, fit: 76, naics: ['332721'],
      setaside: 34, lastContact: 9, email: 'andrea.willis@spaceforce.mil', phone: '(719) 555-0164',
      note: 'GPS III ground hardware. Mostly full-and-open, but precision-turning need is growing.',
      timeline: [
        { t: 'Capability brief sent', d: '9d ago', kind: 'out' },
        { t: 'SSC Industry Day', d: '6w ago', kind: 'event' }
      ],
      sched: [{ code: '332721', v: 58 }]
    }
  ];

  const REL_META = {
    warm:   { label: 'Warm',   color: '#059669', desc: 'Strong, recent engagement' },
    active: { label: 'Active', color: '#378ADD', desc: 'In progress' },
    new:    { label: 'New',    color: '#7c3aed', desc: 'Early-stage contact' },
    cold:   { label: 'Cold',   color: '#94a3b8', desc: 'Needs re-warming' }
  };

  const KIND_META = {
    in:    { label: 'Reply received', color: '#059669', icon: 'M4 12l5 5L20 6' },
    out:   { label: 'You reached out', color: '#378ADD', icon: 'M5 12h14M13 6l6 6-6 6' },
    call:  { label: 'Call', color: '#7c3aed', icon: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.6A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.5-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z' },
    event: { label: 'Event / posting', color: '#d97706', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
    win:   { label: 'Award', color: '#b45309', icon: 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z' }
  };

  const NAICS_COLORS = { '336413': '#185FA5', '332710': '#378ADD', '332721': '#8FC0ED' };

  const AGENCY_FILTERS = ['all', 'NAVSEA', 'NAVAIR', 'AFLCMC', 'AFSC', 'DLA Aviation', 'TACOM', 'NSWC Crane', 'SSC'];

  const SAVED_SEGMENTS = [
    { key: 'warm', label: '🔥 Warm & high-fit', desc: 'warm rel · fit ≥ 85' },
    { key: 'rewarm', label: 'Needs re-warming', desc: 'cold · 30+ days quiet' },
    { key: 'responsive', label: 'Most responsive', desc: 'reply rate ≥ 75%' },
    { key: 'whales', label: 'Big-ceiling COs', desc: '$100M+ obligated' }
  ];

  return { OFFICERS, REL_META, KIND_META, NAICS_COLORS, AGENCY_FILTERS, SAVED_SEGMENTS };
})();
