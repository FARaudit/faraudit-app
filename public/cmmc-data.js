/* FARaudit · CMMC Readiness (best-in-class) — data. Illustrative mock.
   NIST SP 800-171 · 14 families · 110 controls · CMMC Level 2 */
window.CMMC = (function () {
  // priority: HIGH|MEDIUM|LOW
  const DOMAINS = [
    { code: 'AC', name: 'Access Control', total: 22, met: 18, gap: 3, none: 1, pct: 82, priority: 'MEDIUM', insight: '3 gaps in remote access controls. Priority fix before C3PAO assessment.' },
    { code: 'AT', name: 'Awareness & Training', total: 3, met: 3, gap: 0, none: 0, pct: 100, priority: 'LOW', insight: 'Annual security training complete for all staff. No action required.' },
    { code: 'AU', name: 'Audit & Accountability', total: 9, met: 7, gap: 2, none: 0, pct: 78, priority: 'MEDIUM', insight: 'Log retention gaps. NIST 800-171 requires 90-day minimum. Current: 30 days.' },
    { code: 'CM', name: 'Configuration Management', total: 9, met: 5, gap: 2, none: 2, pct: 56, priority: 'HIGH', insight: 'Baseline configuration not documented. C3PAOs flag this in 89% of assessments.' },
    { code: 'IA', name: 'Identification & Authentication', total: 11, met: 10, gap: 1, none: 0, pct: 91, priority: 'LOW', insight: 'MFA on most systems. One legacy system still single-factor — schedule upgrade.' },
    { code: 'IR', name: 'Incident Response', total: 3, met: 2, gap: 0, none: 1, pct: 67, priority: 'MEDIUM', insight: 'IR plan not tested in 12 months. DoD requires annual tabletop exercise.' },
    { code: 'MA', name: 'Maintenance', total: 6, met: 6, gap: 0, none: 0, pct: 100, priority: 'LOW', insight: 'Full compliance. All maintenance activities logged and controlled.' },
    { code: 'MP', name: 'Media Protection', total: 9, met: 7, gap: 1, none: 1, pct: 78, priority: 'MEDIUM', insight: 'Removable-media policy not enforced at shop-floor terminals. High-risk for manufacturing.' },
    { code: 'PS', name: 'Personnel Security', total: 2, met: 2, gap: 0, none: 0, pct: 100, priority: 'LOW', insight: 'Full compliance. Background-check procedures documented and current.' },
    { code: 'PE', name: 'Physical Protection', total: 6, met: 5, gap: 1, none: 0, pct: 83, priority: 'LOW', insight: 'One visitor-log gap at secondary entrance. Low risk but document the fix.' },
    { code: 'RA', name: 'Risk Assessment', total: 3, met: 2, gap: 1, none: 0, pct: 67, priority: 'MEDIUM', insight: 'Vulnerability scans run but not on a defined cadence. Set monthly scanning.' },
    { code: 'CA', name: 'Security Assessment', total: 4, met: 2, gap: 1, none: 1, pct: 50, priority: 'HIGH', insight: 'System Security Plan (SSP) incomplete. The SSP is the #1 C3PAO deliverable — finish it now.' },
    { code: 'SC', name: 'System & Comms Protection', total: 16, met: 11, gap: 3, none: 2, pct: 69, priority: 'HIGH', insight: 'CUI not encrypted in transit on 3 internal flows. Encrypt before assessment.' },
    { code: 'SI', name: 'System & Info Integrity', total: 7, met: 6, gap: 1, none: 0, pct: 86, priority: 'LOW', insight: 'Endpoint protection deployed. One unmonitored server flagged — add to EDR coverage.' }
  ];

  const PRIORITIES = [
    { key: 'all', label: 'All' }, { key: 'HIGH', label: 'High' },
    { key: 'MEDIUM', label: 'Med' }, { key: 'LOW', label: 'Low' }, { key: 'MET', label: '100% Met' }
  ];
  const PRIO_META = {
    HIGH:   { label: 'High', color: '#dc2626', rank: 3 },
    MEDIUM: { label: 'Medium', color: '#d97706', rank: 2 },
    LOW:    { label: 'Low', color: '#059669', rank: 1 }
  };

  // C3PAO path to Level 2 certification
  const TIMELINE = [
    { name: 'Gap Remediation', days: 45, note: 'close 16 open controls' },
    { name: 'SSP & POA&M', days: 21, note: 'finalize documentation' },
    { name: 'Pre-Assessment', days: 14, note: 'readiness review' },
    { name: 'C3PAO Assessment', days: 14, note: 'on-site evaluation' },
    { name: 'DoD Review', days: 33, note: 'SPRS posting' }
  ];

  const DEADLINE = '2026-11-10'; // CMMC Phase 2 enforcement

  return { DOMAINS, PRIORITIES, PRIO_META, TIMELINE, DEADLINE };
})();
