// data.jsx — sample data + persistence layer
// Mirrors the CA Bonus Tracker Sheet shape. Persisted to localStorage so writes
// survive refresh.

const STORAGE_KEY = 'cabt_state_v1';

// ── Seed data ───────────────────────────────────────────────────────────────
const SEED_CAS = [
  { id: 'CA-01', name: 'Sam Reyes',     email: 'sam@groundstandard.com',     role: 'CA', payStructure: 'Salary + Bonus', annualEquivalent: 78000, lastReviewed: '2026-01-15', nextReview: '2026-07-15', active: true },
  { id: 'CA-02', name: 'Jordan Park',   email: 'jordan@groundstandard.com',  role: 'CA', payStructure: 'Salary + Bonus', annualEquivalent: 72000, lastReviewed: '2025-11-02', nextReview: '2026-05-02', active: true },
  { id: 'CA-03', name: 'Morgan Vance',  email: 'morgan@groundstandard.com',  role: 'CA', payStructure: 'Salary + Bonus', annualEquivalent: 68000, lastReviewed: '2026-02-20', nextReview: '2026-08-20', active: true },
  { id: 'CA-04', name: 'Drew Mahoney',  email: 'drew@groundstandard.com',    role: 'CA', payStructure: 'Salary + Bonus', annualEquivalent: 70000, lastReviewed: '2026-03-01', nextReview: '2026-09-01', active: true },
];

const SEED_SALES = [
  { id: 'AE-01',  name: 'Alex Calloway', role: 'AE',  startDate: '2025-02-10', upfrontRate: 0.10, midRate: 0.05, endRate: 0.05, notes: '' },
  { id: 'AE-02',  name: 'Riley Chen',    role: 'AE',  startDate: '2025-06-22', upfrontRate: 0.10, midRate: 0.05, endRate: 0.05, notes: '' },
  { id: 'SDR-01', name: 'Casey Brooks',  role: 'SDR', startDate: '2025-09-01', upfrontRate: 0,    midRate: 0,    endRate: 0,    notes: 'Flat $100/booking' },
  { id: 'SDR-02', name: 'Avery Singh',   role: 'SDR', startDate: '2026-01-12', upfrontRate: 0,    midRate: 0,    endRate: 0,    notes: 'Flat $100/booking' },
];

// 18 BJJ/MMA gym clients across the 4 CAs
const SEED_CLIENTS = [
  // Sam's book
  { id: 'C-001', name: 'Ronin BJJ Austin',         assignedCA: 'CA-01', signDate: '2024-06-12', cancelDate: '', monthlyRetainer: 2500, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2024-07-01', stripeId: 'cus_R1' },
  { id: 'C-002', name: 'Atlas Combat Club',        assignedCA: 'CA-01', signDate: '2024-09-04', cancelDate: '', monthlyRetainer: 1800, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: 'cus_R2' },
  { id: 'C-003', name: 'Westside Muay Thai',       assignedCA: 'CA-01', signDate: '2025-01-22', cancelDate: '', monthlyRetainer: 2200, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-02', sdrBookedBy: 'SDR-02', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2025-02-01', stripeId: 'cus_R3' },
  { id: 'C-004', name: 'Iron Lotus Jiu-Jitsu',     assignedCA: 'CA-01', signDate: '2025-03-11', cancelDate: '', monthlyRetainer: 1500, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: '',       upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },
  { id: 'C-005', name: 'Pacific MMA Lab',          assignedCA: 'CA-01', signDate: '2025-08-19', cancelDate: '', monthlyRetainer: 2800, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-02', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2025-09-01', stripeId: 'cus_R5' },
  { id: 'C-006', name: 'Cobra Kai Denver',         assignedCA: 'CA-01', signDate: '2025-11-05', cancelDate: '', monthlyRetainer: 1900, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-02', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },
  { id: 'C-007', name: 'Black Belt Academy KC',    assignedCA: 'CA-01', signDate: '2025-12-14', cancelDate: '', monthlyRetainer: 2100, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: '',       upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },

  // Jordan's book
  { id: 'C-008', name: 'Granite Grappling',        assignedCA: 'CA-02', signDate: '2024-08-01', cancelDate: '', monthlyRetainer: 2400, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-02', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2024-09-01', stripeId: 'cus_R8' },
  { id: 'C-009', name: 'Sevens MMA Phoenix',       assignedCA: 'CA-02', signDate: '2025-04-30', cancelDate: '', monthlyRetainer: 1700, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-02', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },
  { id: 'C-010', name: 'Forge Fight Academy',      assignedCA: 'CA-02', signDate: '2025-07-08', cancelDate: '', monthlyRetainer: 2300, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-02', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2025-08-01', stripeId: 'cus_R10' },
  { id: 'C-011', name: 'Wolfpack BJJ Boise',       assignedCA: 'CA-02', signDate: '2026-01-15', cancelDate: '', monthlyRetainer: 1600, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-02', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },

  // Morgan's book
  { id: 'C-012', name: 'Northbound Submission',    assignedCA: 'CA-03', signDate: '2024-11-20', cancelDate: '', monthlyRetainer: 2000, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: 'cus_R12' },
  { id: 'C-013', name: 'Apex Striking Coalition',  assignedCA: 'CA-03', signDate: '2025-05-09', cancelDate: '', monthlyRetainer: 2600, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-02', sdrBookedBy: '',       upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2025-06-01', stripeId: '' },
  { id: 'C-014', name: 'Concrete Jungle BJJ',      assignedCA: 'CA-03', signDate: '2025-09-12', cancelDate: '', monthlyRetainer: 1800, hasMembershipAddon: false, termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-02', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },
  { id: 'C-015', name: 'High Desert Muay Thai',    assignedCA: 'CA-03', signDate: '2026-02-01', cancelDate: '', monthlyRetainer: 1500, hasMembershipAddon: false, termMonths: 12, ae: 'AE-02', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },

  // Drew's book
  { id: 'C-016', name: 'Lighthouse Combat',        assignedCA: 'CA-04', signDate: '2024-12-03', cancelDate: '', monthlyRetainer: 2700, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2025-01-01', stripeId: 'cus_R16' },
  { id: 'C-017', name: 'Bayside Brazilian JJ',     assignedCA: 'CA-04', signDate: '2025-06-18', cancelDate: '', monthlyRetainer: 2100, hasMembershipAddon: false, termMonths: 12, ae: 'AE-02', sdrBookedBy: 'SDR-02', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '', stripeId: '' },
  { id: 'C-018', name: 'Stonefist Boxing & MMA',   assignedCA: 'CA-04', signDate: '2025-10-25', cancelDate: '', monthlyRetainer: 1900, hasMembershipAddon: true,  termMonths: 12, ae: 'AE-01', sdrBookedBy: 'SDR-01', upfrontPct: 0.10, midPct: 0.05, endPct: 0.05, membershipStartDate: '2025-11-01', stripeId: 'cus_R18' },
];

// Generate Monthly Metrics — last 4 months for each client (with some gaps so completeness < 100%)
function genMonthlyMetrics() {
  const months = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'];
  const rows = [];
  let id = 1;
  SEED_CLIENTS.forEach((c, ci) => {
    months.forEach((m, mi) => {
      // Skip current month for some clients to create "needs data" prompts
      if (m === '2026-04-01' && (ci % 4 === 0 || ci === 6 || ci === 11)) return;
      // Skip a random month for one client to lower completeness
      if (ci === 14 && mi === 1) return;
      const baseMRR = c.monthlyRetainer + Math.round(Math.random() * 200 - 100);
      const leads = 35 + Math.floor(Math.random() * 40);
      const adSpend = Math.round((c.monthlyRetainer * (0.6 + Math.random() * 0.4)) / 50) * 50;
      const leadCost = Math.round(adSpend / Math.max(1, leads));
      const grossRev = Math.round(c.monthlyRetainer * (3.5 + Math.random() * 2.5));
      const apptsBooked = Math.floor(leads * (0.32 + Math.random() * 0.25));
      const leadsShowed = Math.floor(apptsBooked * (0.55 + Math.random() * 0.25));
      const leadsSigned = Math.floor(leadsShowed * (0.55 + Math.random() * 0.30));
      const totalStudentsStart = 80 + Math.floor(Math.random() * 60);
      const studentsCancelled = Math.floor(totalStudentsStart * (0.02 + Math.random() * 0.05));
      rows.push({
        id: `MM-${String(id++).padStart(4, '0')}`,
        clientId: c.id,
        month: m,
        clientMRR: baseMRR,
        leadCost,
        adSpend,
        clientGrossRevenue: grossRev,
        leadsGenerated: leads,
        apptsBooked,
        leadsShowed,
        leadsSigned,
        totalStudentsStart,
        studentsCancelled,
        notes: '',
      });
    });
  });
  return rows;
}

const SEED_GROWTH_EVENTS = [
  { id: 'GE-001', date: '2026-04-08', clientId: 'C-001', eventType: 'Review',          notes: 'Google review, 5⭐',                  saleTotal: 0,    costToUs: 0,   loggedBy: 'CA-01' },
  { id: 'GE-002', date: '2026-04-12', clientId: 'C-003', eventType: 'Testimonial',     notes: 'Video testimonial from owner Maya',  saleTotal: 0,    costToUs: 0,   loggedBy: 'CA-01' },
  { id: 'GE-003', date: '2026-04-15', clientId: 'C-005', eventType: 'Gear Sale',       notes: 'Gi bundle sold via affiliate link',  saleTotal: 480,  costToUs: 220, loggedBy: 'CA-01' },
  { id: 'GE-004', date: '2026-04-02', clientId: 'C-008', eventType: 'Membership Add-on', notes: 'Upgraded to membership tier',     saleTotal: 0,    costToUs: 0,   loggedBy: 'CA-02' },
  { id: 'GE-005', date: '2026-03-28', clientId: 'C-013', eventType: 'Referral 1+',     notes: 'Referred Cobra Kai Denver',          saleTotal: 0,    costToUs: 0,   loggedBy: 'CA-03' },
  { id: 'GE-006', date: '2026-04-18', clientId: 'C-002', eventType: 'Case Study',      notes: 'Q1 case study published',            saleTotal: 0,    costToUs: 0,   loggedBy: 'CA-01' },
];

const SEED_SURVEYS = [
  { id: 'SR-001', date: '2026-03-15', clientId: 'C-001', overall: 5, responsiveness: 5, followThrough: 5, communication: 4, anonymous: false, comment: 'Best decision we made this year.', submittedBy: 'CA-01' },
  { id: 'SR-002', date: '2026-02-20', clientId: 'C-002', overall: 4, responsiveness: 4, followThrough: 5, communication: 4, anonymous: false, comment: 'Solid month-over-month.',          submittedBy: 'CA-01' },
  { id: 'SR-003', date: '2026-03-02', clientId: 'C-005', overall: 5, responsiveness: 5, followThrough: 5, communication: 5, anonymous: false, comment: '',                                  submittedBy: 'CA-01' },
  { id: 'SR-004', date: '2026-01-30', clientId: 'C-008', overall: 4, responsiveness: 5, followThrough: 4, communication: 5, anonymous: false, comment: '',                                  submittedBy: 'CA-02' },
  { id: 'SR-005', date: '2026-03-10', clientId: 'C-013', overall: 3, responsiveness: 4, followThrough: 3, communication: 3, anonymous: true,  comment: 'Want more proactive comms.',       submittedBy: 'CA-03' },
];

const SEED_ADJUSTMENTS = [
  { id: 'CA-001', date: '2026-04-15', repId: 'AE-01',  role: 'AE',  type: 'Bonus',      amount: 500,  reason: 'Closed 3 contracts in March, exceeded quota',     linkedClient: 'C-007', period: 'Q1 2026', status: 'Pending' },
  { id: 'CA-002', date: '2026-04-10', repId: 'SDR-01', role: 'SDR', type: 'Correction', amount: 100,  reason: 'Missed booking credit for Pacific MMA Lab',       linkedClient: 'C-005', period: 'Q1 2026', status: 'Pending' },
  { id: 'CA-003', date: '2026-03-22', repId: 'AE-02',  role: 'AE',  type: 'Draw',       amount: 1000, reason: 'Pre-payout draw against Q2 milestones',           linkedClient: '',      period: 'Q2 2026', status: 'Paid' },
];

const SEED_PENDING_CLIENTS = [
  { id: 'PC-001', stripeCustomerId: 'cus_QxR9z2K7AbCdEf', name: 'Phoenix Combat Academy', monthlyRetainer: 2200, signDate: '2026-04-22', status: 'pending', source: 'stripe', detectedAt: '2026-04-22' },
  { id: 'PC-002', stripeCustomerId: 'cus_QxS4m8N1HiJkLm', name: 'Test — Bobby Personal',  monthlyRetainer: 1,    signDate: '2026-04-23', status: 'pending', source: 'stripe', detectedAt: '2026-04-23' },
];

const DEFAULT_CONFIG = {
  gracePeriodDays: 90,
  adSpendFloor: 1000,
  adSpendPctOfGross: 0.10,
  adSpendOverDeliveryCap: 2.0,
  bookingFloor: 0.30,
  showFloor: 0.50,
  closeFloor: 0.70,
  attritionGreenFloor: 0.03,
  attritionCriticalCeiling: 0.05,
  satisfactionLookbackMonths: 6,
  noResponsePenalty: 0.7,
  membershipRevenueRate: 0.05,
  sdrFlatFeePerBooking: 100,
  quarterStart: '2026-04-01',
  quarterEnd: '2026-06-30',
};

function buildSeed() {
  return {
    cas: SEED_CAS,
    sales: SEED_SALES,
    clients: SEED_CLIENTS,
    monthlyMetrics: genMonthlyMetrics(),
    growthEvents: SEED_GROWTH_EVENTS,
    surveys: SEED_SURVEYS,
    adjustments: SEED_ADJUSTMENTS,
    config: DEFAULT_CONFIG,
    pendingClients: SEED_PENDING_CLIENTS,
    pendingSync: [], // offline queue
  };
}

// ── Persistence ─────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw);
    // shallow merge with seed to gain new fields if schema evolves
    return { ...buildSeed(), ...parsed };
  } catch (e) {
    return buildSeed();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore quota */ }
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

Object.assign(window, {
  CABT_loadState: loadState,
  CABT_saveState: saveState,
  CABT_resetState: resetState,
  CABT_buildSeed: buildSeed,
});
