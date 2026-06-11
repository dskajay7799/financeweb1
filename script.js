/* ═══════════════════════════════════════════════════════════════════
   FINTRACK PRO — script.js
   Complete frontend logic: Auth, Navigation, Charts, API calls
═══════════════════════════════════════════════════════════════════ */

// ── CONFIG ─────────────────────────────────────────────────────────
// Change this URL to your deployed backend URL when you go live
const API_BASE = 'https://financeweb1.onrender.com/api';

// ── STATE ──────────────────────────────────────────────────────────
let currentUser   = null;
let currentYear   = 2024;
let activeCharts  = {};   // Keeps Chart.js instances so we can destroy & rebuild

// Month labels used by all charts
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

// ════════════════════════════════════════════════════════════════════
// 1.  INITIALISATION  (runs once when page loads)
// ════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();          // render all <i data-lucide="…"> icons
  applySavedTheme();
  checkSession();                // are we already logged in?

  // Allow Enter key in login form
  ['login-email','login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLogin();
    });
  });
  ['signup-name','signup-email','signup-password','signup-confirm'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSignup();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 2.  SESSION CHECK  — tries /api/me to restore a session
// ════════════════════════════════════════════════════════════════════
async function checkSession() {
  try {
    const res  = await apiFetch('/me');
    const data = await res.json();
    if (res.ok && data.user) {
      currentUser = data.user;
      enterApp();
    }
  } catch (_) {
    // no active session — stay on auth screen
  }
}

// ════════════════════════════════════════════════════════════════════
// 3.  AUTH  — Login / Signup / Logout
// ════════════════════════════════════════════════════════════════════
function showSignup() {
  document.getElementById('login-panel').classList.add('hidden');
  document.getElementById('signup-panel').classList.remove('hidden');
  clearAuthErrors();
}
function showLogin() {
  document.getElementById('signup-panel').classList.add('hidden');
  document.getElementById('login-panel').classList.remove('hidden');
  clearAuthErrors();
}
function clearAuthErrors() {
  ['login-error','signup-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.textContent = ''; }
  });
}
function showAuthError(panelId, msg) {
  const el = document.getElementById(panelId);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  clearAuthErrors();

  if (!email || !password) {
    showAuthError('login-error', 'Please enter both email and password.');
    return;
  }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const res  = await apiFetch('/login', 'POST', { email, password });
    const data = await res.json();
    if (!res.ok) { showAuthError('login-error', data.error || 'Login failed.'); return; }
    currentUser = data.user;
    enterApp();
  } catch (err) {
    showAuthError('login-error', 'Cannot reach server. Is the backend running?');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleSignup() {
  const full_name        = document.getElementById('signup-name').value.trim();
  const email            = document.getElementById('signup-email').value.trim();
  const password         = document.getElementById('signup-password').value;
  const confirm          = document.getElementById('signup-confirm').value;
  clearAuthErrors();

  if (!full_name || !email || !password || !confirm) {
    showAuthError('signup-error', 'All fields are required.'); return;
  }
  if (password.length < 6) {
    showAuthError('signup-error', 'Password must be at least 6 characters.'); return;
  }
  if (password !== confirm) {
    showAuthError('signup-error', 'Passwords do not match.'); return;
  }

  const btn = document.getElementById('signup-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';

  try {
    const res  = await apiFetch('/signup', 'POST', { full_name, email, password });
    const data = await res.json();
    if (!res.ok) { showAuthError('signup-error', data.error || 'Signup failed.'); return; }
    currentUser = data.user;
    enterApp();
  } catch (err) {
    showAuthError('signup-error', 'Cannot reach server. Is the backend running?');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

async function handleLogout() {
  try { await apiFetch('/logout', 'POST'); } catch (_) {}
  currentUser = null;
  destroyAllCharts();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  showLogin();
}

// ════════════════════════════════════════════════════════════════════
// 4.  APP ENTRY — hides auth screen, shows dashboard
// ════════════════════════════════════════════════════════════════════
function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Set user display
  const name   = currentUser.full_name || '';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name-display').textContent = name;

  lucide.createIcons();   // re-render icons that are now visible
  navigate('dashboard');
}

// ════════════════════════════════════════════════════════════════════
// 5.  NAVIGATION
// ════════════════════════════════════════════════════════════════════
function navigate(page) {
  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Show correct page section
  document.querySelectorAll('.page').forEach(el => {
    el.classList.remove('active');
  });
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Update topbar title
  const titles = {
    dashboard: 'Dashboard',
    income: 'Income',
    expenditure: 'Expenditure',
    investments: 'Investments',
    analytics: 'Analytics',
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  // Load data for the page
  loadPage(page);
}

function onYearChange() {
  currentYear = parseInt(document.getElementById('year-select').value);
  // Re-load whichever page is currently active
  const active = document.querySelector('.nav-item.active');
  if (active) loadPage(active.dataset.page);
}

async function loadPage(page) {
  switch (page) {
    case 'dashboard':    await loadDashboard();    break;
    case 'income':       await loadIncome();       break;
    case 'expenditure':  await loadExpenditure();  break;
    case 'investments':  await loadInvestments();  break;
    case 'analytics':    await loadAnalytics();    break;
  }
}

// ════════════════════════════════════════════════════════════════════
// 6.  SIDEBAR / THEME TOGGLES
// ════════════════════════════════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function toggleTheme() {
  const html      = document.documentElement;
  const isDark    = html.getAttribute('data-theme') === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', nextTheme);
  localStorage.setItem('theme', nextTheme);

  document.getElementById('theme-icon-sun').classList.toggle('hidden', nextTheme === 'dark');
  document.getElementById('theme-icon-moon').classList.toggle('hidden', nextTheme === 'light');
  document.getElementById('theme-label').textContent = isDark ? 'Dark Mode' : 'Light Mode';

  // Rebuild charts so they use the right grid colour
  destroyAllCharts();
  loadPage(document.querySelector('.nav-item.active')?.dataset.page || 'dashboard');
}

function applySavedTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const isDark = saved === 'dark';
  document.getElementById('theme-icon-sun')?.classList.toggle('hidden', isDark);
  document.getElementById('theme-icon-moon')?.classList.toggle('hidden', !isDark);
  if (document.getElementById('theme-label'))
    document.getElementById('theme-label').textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

// ════════════════════════════════════════════════════════════════════
// 7.  API HELPER
// ════════════════════════════════════════════════════════════════════
function apiFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    credentials: 'include',   // send session cookie
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${API_BASE}${path}`, opts);
}

// ════════════════════════════════════════════════════════════════════
// 8.  FORMATTING HELPERS
// ════════════════════════════════════════════════════════════════════
function fmt(n) {
  // Formats a number as ₹ with Indian-style commas
  if (n === undefined || n === null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function fmtK(n) {
  // Short format: ₹1.2L or ₹85K
  if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (Math.abs(n) >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K';
  return '₹' + n.toFixed(0);
}
function pct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

// ════════════════════════════════════════════════════════════════════
// 9.  CHART HELPERS
// ════════════════════════════════════════════════════════════════════
function destroyChart(id) {
  if (activeCharts[id]) {
    activeCharts[id].destroy();
    delete activeCharts[id];
  }
}
function destroyAllCharts() {
  Object.keys(activeCharts).forEach(destroyChart);
}

// Returns Chart.js-ready grid / tick colours based on current theme
function chartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid:  isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    text:  isDark ? '#8892b0' : '#6b7280',
    bg:    isDark ? '#1a1d27' : '#ffffff',
  };
}

// Common options object for line / bar charts
function baseChartOptions(yCallback = null) {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.bg,
        titleColor: c.text,
        bodyColor: c.text,
        borderColor: 'rgba(108,99,255,0.3)',
        borderWidth: 1,
        callbacks: {
          label: ctx => ' ' + fmtK(ctx.parsed.y ?? ctx.parsed),
        },
      },
    },
    scales: {
      x: {
        grid: { color: c.grid },
        ticks: { color: c.text, font: { size: 11 } },
      },
      y: {
        grid: { color: c.grid },
        ticks: {
          color: c.text, font: { size: 11 },
          callback: yCallback || (v => fmtK(v)),
        },
      },
    },
  };
}

function makePieOptions(position = 'right') {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position,
        labels: { color: c.text, font: { size: 11 }, boxWidth: 12, padding: 12 },
      },
      tooltip: {
        backgroundColor: c.bg,
        titleColor: c.text,
        bodyColor: c.text,
        borderColor: 'rgba(108,99,255,0.3)',
        borderWidth: 1,
        callbacks: {
          label: ctx => ` ${fmtK(ctx.parsed)} (${ctx.label})`,
        },
      },
    },
  };
}

// Palette of colours for pie / doughnut slices
const PIE_COLORS = [
  '#6C63FF','#3ECFCF','#22c55e','#ef4444','#f59e0b',
  '#3b82f6','#8b5cf6','#06b6d4','#ec4899','#14b8a6',
  '#f97316','#a855f7','#84cc16','#0ea5e9','#fbbf24',
  '#e11d48',
];

// ════════════════════════════════════════════════════════════════════
// 10.  DASHBOARD PAGE
// ════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    const res  = await apiFetch(`/analytics?year=${currentYear}`);
    const data = await res.json();

    // KPI values
    document.getElementById('kpi-income').textContent      = fmt(data.total_income);
    document.getElementById('kpi-expense').textContent     = fmt(data.total_expense);
    document.getElementById('kpi-invest').textContent      = fmt(data.total_invested);
    document.getElementById('kpi-savings').textContent     = fmt(data.savings);
    document.getElementById('kpi-networth').textContent    = fmt(data.net_worth);
    document.getElementById('kpi-savingsrate').textContent = data.savings_rate.toFixed(1) + '%';

    // Monthly cash flow chart
    const mb      = data.monthly_breakdown;
    const incomes = MONTH_FULL.map(m => mb[m]?.income     || 0);
    const exps    = MONTH_FULL.map(m => mb[m]?.expense    || 0);
    const invs    = MONTH_FULL.map(m => mb[m]?.investment || 0);

    destroyChart('dash-cashflow-chart');
    const cashCtx = document.getElementById('dash-cashflow-chart').getContext('2d');
    activeCharts['dash-cashflow-chart'] = new Chart(cashCtx, {
      type: 'line',
      data: {
        labels: MONTHS,
        datasets: [
          {
            label: 'Income',
            data: incomes,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.08)',
            tension: 0.4, fill: true, pointRadius: 4,
          },
          {
            label: 'Expenses',
            data: exps,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239,68,68,0.06)',
            tension: 0.4, fill: true, pointRadius: 4,
          },
          {
            label: 'Investments',
            data: invs,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.06)',
            tension: 0.4, fill: true, pointRadius: 4,
          },
        ],
      },
      options: { ...baseChartOptions(), plugins: {
        ...baseChartOptions().plugins,
        legend: {
          display: true,
          position: 'top',
          labels: { color: chartColors().text, boxWidth: 12, font: { size: 11 } },
        },
      }},
    });

    // Budget allocation pie
    const pieTotal = data.total_expense + data.total_invested + data.savings;
    destroyChart('dash-pie-chart');
    const pieCtx = document.getElementById('dash-pie-chart').getContext('2d');
    activeCharts['dash-pie-chart'] = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['Expenses', 'Investments', 'Savings'],
        datasets: [{
          data: [data.total_expense, data.total_invested, Math.max(data.savings, 0)],
          backgroundColor: ['#ef4444','#3b82f6','#22c55e'],
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: makePieOptions('bottom'),
    });

  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

// ════════════════════════════════════════════════════════════════════
// 11.  INCOME PAGE
// ════════════════════════════════════════════════════════════════════
async function loadIncome() {
  try {
    const res  = await apiFetch(`/income?year=${currentYear}`);
    const data = await res.json();
    const { records, summary } = data;

    // KPIs
    document.getElementById('inc-total').textContent = fmt(summary.total);
    document.getElementById('inc-avg').textContent   = fmt(summary.average);
    document.getElementById('inc-high').textContent  = fmt(summary.highest);
    document.getElementById('inc-low').textContent   = fmt(summary.lowest);

    // Build month→amount map (sum in case of multiple entries per month)
    const monthMap = {};
    records.forEach(r => {
      monthMap[r.month] = (monthMap[r.month] || 0) + r.amount;
    });
    const amounts = MONTH_FULL.map(m => monthMap[m] || 0);

    // Trend chart
    destroyChart('income-trend-chart');
    const trendCtx = document.getElementById('income-trend-chart').getContext('2d');
    activeCharts['income-trend-chart'] = new Chart(trendCtx, {
      type: 'bar',
      data: {
        labels: MONTHS,
        datasets: [{
          label: 'Income',
          data: amounts,
          backgroundColor: 'rgba(34,197,94,0.75)',
          borderColor: '#22c55e',
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: baseChartOptions(),
    });

    // Growth-rate chart
    const growthRates = MONTH_FULL.map(m => {
      const r = records.find(x => x.month === m);
      return r ? r.growth_pct : 0;
    });
    destroyChart('income-growth-chart');
    const growthCtx = document.getElementById('income-growth-chart').getContext('2d');
    activeCharts['income-growth-chart'] = new Chart(growthCtx, {
      type: 'line',
      data: {
        labels: MONTHS,
        datasets: [{
          label: 'Growth %',
          data: growthRates,
          borderColor: '#6C63FF',
          backgroundColor: 'rgba(108,99,255,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#6C63FF',
        }],
      },
      options: {
        ...baseChartOptions(v => v.toFixed(1) + '%'),
        plugins: {
          ...baseChartOptions().plugins,
          tooltip: {
            ...baseChartOptions().plugins.tooltip,
            callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(2)}%` },
          },
        },
      },
    });

    // Table
    const tbody = document.getElementById('income-tbody');
    tbody.innerHTML = '';
    records.forEach(r => {
      const grow = r.growth_pct;
      const growClass = grow >= 0 ? 'text-green' : 'text-red';
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${r.month}</td>
          <td>${r.date}</td>
          <td><span class="badge badge-green">${r.source}</span></td>
          <td><strong>${fmt(r.amount)}</strong></td>
          <td class="${growClass}">${grow === 0 ? '—' : pct(grow)}</td>
        </tr>
      `);
    });

  } catch (err) { console.error('Income load error:', err); }
}

// ════════════════════════════════════════════════════════════════════
// 12.  EXPENDITURE PAGE
// ════════════════════════════════════════════════════════════════════
async function loadExpenditure() {
  try {
    const res  = await apiFetch(`/expenditure?year=${currentYear}`);
    const data = await res.json();
    const { records, summary } = data;

    const catTotals = summary.by_category;
    const total     = summary.total;
    const cats      = Object.keys(catTotals);
    const topCat    = cats.sort((a, b) => catTotals[b] - catTotals[a])[0];

    // KPIs
    document.getElementById('exp-total').textContent    = fmt(total);
    document.getElementById('exp-ratio').textContent    = '—'; // filled in analytics
    document.getElementById('exp-top-cat').textContent  = topCat || '—';
    document.getElementById('exp-cat-count').textContent = cats.length;

    // ── Try to get income total for ratio ──
    try {
      const incRes  = await apiFetch(`/income?year=${currentYear}`);
      const incData = await incRes.json();
      const ratio   = ((total / incData.summary.total) * 100).toFixed(1) + '%';
      document.getElementById('exp-ratio').textContent = ratio;
    } catch (_) {}

    // Pie — expense by category
    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const pieLabels  = sortedCats.map(([k]) => k);
    const pieValues  = sortedCats.map(([, v]) => v);

    destroyChart('exp-pie-chart');
    const pieCtx = document.getElementById('exp-pie-chart').getContext('2d');
    activeCharts['exp-pie-chart'] = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieValues,
          backgroundColor: PIE_COLORS,
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: makePieOptions('bottom'),
    });

    // Monthly spending trend line
    const monthExp = {};
    records.forEach(r => {
      monthExp[r.month] = (monthExp[r.month] || 0) + r.amount;
    });
    const monthValues = MONTH_FULL.map(m => monthExp[m] || 0);

    destroyChart('exp-trend-chart');
    const trendCtx = document.getElementById('exp-trend-chart').getContext('2d');
    activeCharts['exp-trend-chart'] = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: MONTHS,
        datasets: [{
          label: 'Expenses',
          data: monthValues,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
        }],
      },
      options: baseChartOptions(),
    });

    // Table — by category
    const tbody = document.getElementById('exp-tbody');
    tbody.innerHTML = '';
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([cat, amt]) => {
      const share = ((amt / total) * 100).toFixed(1) + '%';
      const avg   = fmt(amt / 12);
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${cat}</td>
          <td><strong>${fmt(amt)}</strong></td>
          <td><span class="badge badge-red">${share}</span></td>
          <td>${avg}</td>
        </tr>
      `);
    });

  } catch (err) { console.error('Expenditure load error:', err); }
}

// ════════════════════════════════════════════════════════════════════
// 13.  INVESTMENTS PAGE
// ════════════════════════════════════════════════════════════════════
async function loadInvestments() {
  try {
    const res  = await apiFetch(`/investments?year=${currentYear}`);
    const data = await res.json();
    const { records, summary } = data;

    // KPIs
    document.getElementById('inv-invested').textContent    = fmt(summary.total_invested);
    document.getElementById('inv-current').textContent     = fmt(summary.total_current);
    document.getElementById('inv-profit').textContent      = fmt(summary.total_profit);
    document.getElementById('inv-return-pct').textContent  = pct(summary.total_return_pct);

    // Pie — by investment type
    const byType = summary.by_type;
    const typeLabels = Object.keys(byType);
    const typeValues = typeLabels.map(t => byType[t].invested);

    destroyChart('inv-pie-chart');
    const pieCtx = document.getElementById('inv-pie-chart').getContext('2d');
    activeCharts['inv-pie-chart'] = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: typeLabels,
        datasets: [{
          data: typeValues,
          backgroundColor: PIE_COLORS,
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: makePieOptions('bottom'),
    });

    // Monthly investment bar
    const monthInv = {};
    records.forEach(r => {
      monthInv[r.month] = (monthInv[r.month] || 0) + r.invested_amt;
    });
    const barValues = MONTH_FULL.map(m => monthInv[m] || 0);

    destroyChart('inv-bar-chart');
    const barCtx = document.getElementById('inv-bar-chart').getContext('2d');
    activeCharts['inv-bar-chart'] = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: MONTHS,
        datasets: [{
          label: 'Invested',
          data: barValues,
          backgroundColor: 'rgba(59,130,246,0.75)',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: baseChartOptions(),
    });

    // Table
    const tbody = document.getElementById('inv-tbody');
    tbody.innerHTML = '';
    records.forEach(r => {
      const plClass  = r.profit_loss >= 0 ? 'text-green' : 'text-red';
      const retClass = r.return_pct  >= 0 ? 'badge-green' : 'badge-red';
      const typeColors = {
        'Mutual Fund': 'badge-blue', 'ETF': 'badge-cyan',
        'Stock': 'badge-purple', 'Gold': 'badge-amber',
        'Fixed Deposit': 'badge-green', 'SIP': 'badge-blue',
      };
      const typeBadge = typeColors[r.type] || 'badge-blue';
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td><strong>${r.name}</strong></td>
          <td><span class="badge ${typeBadge}">${r.type}</span></td>
          <td>${r.invest_date}</td>
          <td>${fmt(r.invested_amt)}</td>
          <td>${fmt(r.current_value)}</td>
          <td class="${plClass}">${r.profit_loss >= 0 ? '+' : ''}${fmt(r.profit_loss)}</td>
          <td><span class="badge ${retClass}">${pct(r.return_pct)}</span></td>
        </tr>
      `);
    });

  } catch (err) { console.error('Investments load error:', err); }
}

// ════════════════════════════════════════════════════════════════════
// 14.  ANALYTICS PAGE
// ════════════════════════════════════════════════════════════════════
async function loadAnalytics() {
  try {
    const res  = await apiFetch(`/analytics?year=${currentYear}`);
    const data = await res.json();

    // KPIs
    document.getElementById('an-income').textContent     = fmt(data.total_income);
    document.getElementById('an-expense').textContent    = fmt(data.total_expense);
    document.getElementById('an-invested').textContent   = fmt(data.total_invested);
    document.getElementById('an-savings').textContent    = fmt(data.savings);
    document.getElementById('an-networth').textContent   = fmt(data.net_worth);
    document.getElementById('an-inv-growth').textContent = pct(data.investment_growth_rate);

    // Monthly trend line (multi-series)
    const mb      = data.monthly_breakdown;
    const incomes = MONTH_FULL.map(m => mb[m]?.income     || 0);
    const exps    = MONTH_FULL.map(m => mb[m]?.expense    || 0);
    const invs    = MONTH_FULL.map(m => mb[m]?.investment || 0);

    destroyChart('an-line-chart');
    const lineCtx = document.getElementById('an-line-chart').getContext('2d');
    activeCharts['an-line-chart'] = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels: MONTHS,
        datasets: [
          { label: 'Income',      data: incomes, borderColor: '#22c55e', tension: 0.4, pointRadius: 3, backgroundColor: 'transparent' },
          { label: 'Expenses',    data: exps,    borderColor: '#ef4444', tension: 0.4, pointRadius: 3, backgroundColor: 'transparent' },
          { label: 'Investments', data: invs,    borderColor: '#3b82f6', tension: 0.4, pointRadius: 3, backgroundColor: 'transparent' },
        ],
      },
      options: {
        ...baseChartOptions(),
        plugins: {
          ...baseChartOptions().plugins,
          legend: {
            display: true, position: 'top',
            labels: { color: chartColors().text, boxWidth: 12, font: { size: 11 } },
          },
        },
      },
    });

    // Donut — fund distribution
    const totalSavings = Math.max(data.savings, 0);
    destroyChart('an-donut-chart');
    const donutCtx = document.getElementById('an-donut-chart').getContext('2d');
    activeCharts['an-donut-chart'] = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Income Spent', 'Invested', 'Saved'],
        datasets: [{
          data: [data.total_expense, data.total_invested, totalSavings],
          backgroundColor: ['#ef4444','#3b82f6','#22c55e'],
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: makePieOptions('bottom'),
    });

    // Ratio cards + progress bars
    const savRate  = Math.min(data.savings_rate, 100);
    const expRate  = Math.min(data.expense_ratio, 100);
    const invRate  = Math.min((data.total_invested / data.total_income) * 100, 100);
    const growRate = Math.min(Math.max(data.investment_growth_rate, 0), 100);

    document.getElementById('rat-savings').textContent = data.savings_rate.toFixed(1) + '%';
    document.getElementById('rat-expense').textContent = data.expense_ratio.toFixed(1) + '%';
    document.getElementById('rat-invest').textContent  = invRate.toFixed(1) + '%';
    document.getElementById('rat-growth').textContent  = data.investment_growth_rate.toFixed(1) + '%';

    // Animate bars with a tiny delay
    setTimeout(() => {
      document.getElementById('bar-savings').style.width = savRate + '%';
      document.getElementById('bar-expense').style.width = expRate + '%';
      document.getElementById('bar-invest').style.width  = invRate + '%';
      document.getElementById('bar-growth').style.width  = growRate + '%';
    }, 80);

  } catch (err) { console.error('Analytics load error:', err); }
}
