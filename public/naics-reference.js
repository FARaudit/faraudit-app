/* NAICS reference — ONE table, read by the NAICS directory and by Settings.
 *
 * This is a CURATED subset, not the NAICS register. SAM carries roughly a thousand
 * codes; this holds the ones the product has size standards and acquisition notes for.
 * That is why nothing here is an allowlist: a customer whose code is absent must still
 * be able to save it, and the surfaces that use this table show the code alone rather
 * than inventing a title for it.
 *
 * Size standards trace to 13 CFR 121.201 via src/lib/sba-size-standards.ts. A row's
 * threshold is a REFERENCE figure — the solicitation's own stated standard governs when
 * it differs, and this never substitutes for the document.
 *
 * Row shape: [code, category, title, sizeStandard, sizeKind, evalMethod, clauseRegime, note]
 */
(function () {
  'use strict';
  var CATS=[{id:'con',label:'Construction',color:'#7c9cc4'},{id:'eng',label:'Engineering',color:'#5bb3a6'},{id:'mfg',label:'Manufacturing',color:'#b08ad0'},{id:'mro',label:'MRO',color:'#d0a45b'},{id:'it',label:'IT & Cyber',color:'#378ADD'}];
  var DATA=[
   ['236220','con','Commercial & Institutional Building Construction','$45M','rev','bv','far','Construction — Statement of Requirement, not a SOW'],
   ['237310','con','Highway, Street & Bridge Construction','$45M','rev','bv','agar','Construction — drawings + specs; USDA roads common'],
   ['238210','con','Electrical Contractors','$19M','rev','lpta','far','Trade sub — Davis-Bacon wage determination applies'],
   ['238220','con','Plumbing, Heating & Air-Conditioning','$19M','rev','lpta','far','Trade sub — Davis-Bacon wage determination applies'],
   ['238150','con','Glass & Glazing Contractors','$19M','rev','lpta','affars','Trade sub — ballistic / blast specs common on AF work'],
   ['561210','con','Facilities Support Services','$47M','rev','bv','dfars','Services — expect a PWS attachment on SAM.gov'],
   ['541330','eng','Engineering Services','$25.5M','rev','bv','dfars','Services — expect PWS/SOO; SCA may apply'],
   ['541310','eng','Architectural Services','$12.5M','rev','bv','far','Brooks Act — qualifications-based selection'],
   ['541512','eng','Computer Systems Design Services','$34M','rev','bv','dfars','IT services — expect CMMC + DFARS 252.204-7012'],
   ['541715','eng','R&D — Physical, Engineering & Life Sciences','1,000','emp','bv','dfars','R&D — SBIR / STTR pathways common'],
   ['541380','eng','Testing Laboratories & Services','$19M','rev','bv','far','Services — expect QASP + test plan'],
   ['332710','mfg','Machine Shops','500','emp','lpta','dfars','Supply buy — no SOW; look for the TDP'],
   ['332999','mfg','All Other Misc. Fabricated Metal Product Mfg','750','emp','lpta','dfars','Supply buy — TDP + drawings expected'],
   ['336412','mfg','Aircraft Engine & Engine Parts Manufacturing','1,500','emp','bv','affars','Supply buy — source approval (SAR) likely'],
   ['336413','mfg','Other Aircraft Parts & Auxiliary Equipment Mfg','1,250','emp','bv','dfars','Supply buy — source approval (SAR) likely'],
   ['334511','mfg','Search, Detection & Navigation Instruments','1,250','emp','bv','dfars','Supply buy — ITAR / export control likely'],
   ['488190','mro','Other Support Activities for Air Transportation','$40M','rev','bv','affars','Services — expect PWS; work performed on-base'],
   ['811219','mro','Other Electronic & Precision Equipment Repair','$22M','rev','lpta','dfars','Repair — expect a repair / overhaul spec'],
   ['336611','mro','Ship Building & Repairing','1,300','emp','bv','dfars','Repair — NAVSEA standard items apply'],
   ['811310','mro','Commercial & Industrial Machinery Repair','$12.5M','rev','lpta','far','Repair — expect equipment list + SOW'],
   ['541611','eng','Administrative Management & General Management Consulting Services','','','bv','far','Services — expect a PWS'],
   ['541690','eng','Other Scientific & Technical Consulting Services','','','bv','far','Services — expect a PWS'],
   ['541715','eng','R&D in Physical, Engineering & Life Sciences','','','bv','dfars','R&D — expect data rights terms'],
   ['541310','eng','Architectural Services','','','bv','far','A&E — Brooks Act qualifications-based selection'],
   ['562910','mro','Remediation Services','','','bv','far','Environmental — site-specific scope'],
   ['541511','it','Custom Computer Programming Services','$34M','rev','bv','dfars','IT services — CMMC + DFARS 7012 likely'],
   ['541519','it','Other Computer Related Services','$34M','rev','bv','dfars','IT services — verify required CMMC level'],
   ['541513','it','Computer Facilities Management Services','$34M','rev','bv','dfars','IT services — expect PWS + SLAs'],
   ['518210','it','Data Processing, Hosting & Related Services','$40M','rev','bv','dfars','Cloud — FedRAMP authorization likely']
  ];
  var SYN={'238150':'ballistic glass window glazing curtain wall blast','237310':'paving roads asphalt bridge street','236220':'building renovation tenant improvement','238210':'electrical wiring power','238220':'plumbing hvac heating cooling mechanical','541512':'it software systems integration network','541511':'software programming development coding','541330':'engineering design a&e civil structural','488190':'aircraft ground support flightline aviation','811219':'calibration instrument electronic repair','332710':'machining cnc fabrication parts','336412':'jet engine turbine afterburner aircraft','334511':'radar navigation sensor electronics','518210':'cloud hosting data center fedramp','561210':'base operations facilities janitorial grounds'};

  /* OASIS+ domain reach, per NAICS code — from GSA's published NAICS-codes-by-domain
     table for the OASIS+ vehicle. Deliberately NOT used as the browse grouping: the
     domains OVERLAP (541690 appears in all eight, 541330 in six), so grouping by them
     would list one code under six headings. It is shown as reach instead — what work a
     code can carry on that vehicle — which is the question a services contractor is
     actually asking. Absent means the code is not on OASIS+, which is a fact about the
     vehicle, not about the code. */
  var OASIS = {
    '336611': ['Technical & Engineering', 'Logistics', 'Enterprise Solutions'],
    '488190': ['Technical & Engineering', 'Facilities', 'Logistics'],
    '541310': ['Technical & Engineering'],
    '541330': ['Technical & Engineering', 'Research & Development', 'Intelligence Services', 'Environmental', 'Facilities', 'Logistics', 'Enterprise Solutions'],
    '541611': ['Management & Advisory', 'Technical & Engineering', 'Research & Development', 'Intelligence Services', 'Facilities', 'Enterprise Solutions'],
    '541690': ['Management & Advisory', 'Technical & Engineering', 'Research & Development', 'Intelligence Services', 'Environmental', 'Facilities', 'Logistics', 'Enterprise Solutions'],
    '541715': ['Research & Development', 'Intelligence Services', 'Enterprise Solutions'],
    '561210': ['Environmental', 'Facilities', 'Logistics', 'Enterprise Solutions'],
    '562910': ['Environmental', 'Enterprise Solutions'],
    '238210': ['Facilities'],
    '238220': ['Facilities'],
    '238990': ['Facilities'],
    '561720': ['Facilities'],
    '561730': ['Facilities'],
    '811310': ['Facilities']
  };

  window.NAICS_REF = {
    CATS: CATS, DATA: DATA, SYN: SYN, OASIS: OASIS,
    // code -> row, for the O(1) lookup both consumers need.
    byCode: DATA.reduce(function (m, r) { m[r[0]] = r; return m; }, {}),
    /* Free-text match over code, title and the synonym list. Returns rows, never a
       verdict: a query that matches nothing means this table does not know the code,
       which is not the same as the code being invalid. */
    search: function (q) {
      var s = String(q || '').trim().toLowerCase();
      if (!s) return [];
      return DATA.filter(function (r) {
        return r[0].indexOf(s) === 0
          || r[2].toLowerCase().indexOf(s) !== -1
          || (SYN[r[0]] || '').indexOf(s) !== -1;
      });
    }
  };
})();
