/* ==============================================
   PERSONAL FINANCE TRACKER — APP.JS
   Full-featured vanilla JS SPA
   ============================================== */

'use strict';

// ============================================================
// DATA LAYER — localStorage persistence
// ============================================================
const DB = {
  get: (key, def = []) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; }
    catch { return def; }
  },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  del: (key) => localStorage.removeItem(key),
};

// Generate unique ID
const uid = () => '_' + Math.random().toString(36).slice(2, 11);

// ─── CURRENCY STATE ───────────────────────────────────────────
// Single source of truth — always read live from storage so that
// every call to fmt() immediately reflects the latest selection.
const getCurrencySymbol = () => DB.get('settings', {}).currency || '$';

// Format currency — no hardcoded symbol anywhere in the app
const fmt = (n) => {
  const sym = getCurrencySymbol();
  return sym + Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * updateCurrencySymbol()
 * Call this whenever the user changes currency in Settings.
 * It persists the new value then re-renders every financial
 * surface (navbar balance + whichever page is active + forces
 * a full dashboard refresh so chart tooltips are also updated).
 * @param {string} symbol  e.g. '$', '€', '£', '₹', '¥'
 */
function updateCurrencySymbol(symbol) {
  // 1. Persist
  saveSetting('currency', symbol);

  // 2. Keep the selector in sync (in case called programmatically)
  const sel = document.getElementById('currency-sel');
  if (sel && sel.value !== symbol) sel.value = symbol;

  // 3. Always refresh navbar balance (visible on every page)
  updateNavBalance();

  // 4. Re-render the currently visible page so numbers update
  //    immediately without the user having to navigate away.
  const activePage = document.querySelector('.page.active');
  const pageId = activePage ? activePage.id.replace('page-', '') : '';

  switch (pageId) {
    case 'dashboard': renderDashboard(); break;
    case 'income':    renderIncomePage(); break;
    case 'expense':   renderExpensePage(); break;
    case 'planned':   renderPlannedPage(); break;
    case 'budget':    renderBudgetPage(); break;
    case 'reports':   updateReports(); break;
    // 'settings' page has no monetary displays — nothing extra needed
  }

  showToast(`Currency updated to ${symbol}`, 'success');
}

// Format date
const fmtDate = (d) => {
  if (!d) return '—';
  const fmt = DB.get('settings', {}).dateFormat || 'MM/DD/YYYY';
  const [y, m, day] = d.split('-');
  if (fmt === 'DD/MM/YYYY') return `${day}/${m}/${y}`;
  if (fmt === 'YYYY-MM-DD') return d;
  return `${m}/${day}/${y}`;
};

// Chart instance store
const Charts = {};

// Destroy chart if exists
const destroyChart = (id) => {
  if (Charts[id]) { Charts[id].destroy(); delete Charts[id]; }
};

// ============================================================
// AUTH
// ============================================================
const CREDS = { demo: 'demo123' };

function handleLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const err = document.getElementById('login-error');

  if (CREDS[user] === pass) {
    err.classList.add('hidden');
    DB.set('loggedIn', true);
    DB.set('username', user);
    document.getElementById('login-page').style.opacity = '0';
    document.getElementById('login-page').style.transition = 'opacity 0.4s';
    setTimeout(() => {
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      initApp();
    }, 400);
  } else {
    err.classList.remove('hidden');
    document.getElementById('login-pass').value = '';
  }
}

// Allow Enter key on login
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-user').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // Auto-login if session exists
  if (DB.get('loggedIn', false)) {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    initApp();
  }
});

// ============================================================
// APP INIT
// ============================================================
function initApp() {
  loadSettings();
  setupNav();
  renderThemeChips();   // populate AI Theme Studio preset chips
  navigateTo('dashboard');
  updateAllUI();
  populateReportMonthFilter();
}

// ============================================================
// NAVIGATION
// ============================================================
function setupNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navigateTo(link.dataset.page);
      // Close mobile nav
      document.getElementById('nav-links').classList.remove('mobile-open');
    });
  });
}

function navigateTo(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  // Show target page
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  const link = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (link) link.classList.add('active');

  // Refresh page-specific data
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'income': renderIncomePage(); break;
    case 'expense': renderExpensePage(); break;
    case 'planned': renderPlannedPage(); break;
    case 'budget': renderBudgetPage(); break;
    case 'reports': updateReports(); break;
    case 'settings': loadSettings(); break;
  }
}

function toggleMobileNav() {
  document.getElementById('nav-links').classList.toggle('mobile-open');
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('open');
  // Set today's date in date fields
  const today = new Date().toISOString().split('T')[0];
  if (id === 'income-modal') {
    if (!document.getElementById('income-edit-id').value) {
      document.getElementById('income-form').reset();
      document.getElementById('inc-date').value = today;
      document.getElementById('income-modal-title').textContent = 'Add Income';
      document.getElementById('income-edit-id').value = '';
    }
  }
  if (id === 'expense-modal') {
    if (!document.getElementById('expense-edit-id').value) {
      document.getElementById('expense-form').reset();
      document.getElementById('exp-date').value = today;
      document.getElementById('expense-modal-title').textContent = 'Add Expense';
      document.getElementById('expense-edit-id').value = '';
    }
  }
  if (id === 'planned-modal') {
    if (!document.getElementById('planned-edit-id').value) {
      document.getElementById('planned-form').reset();
      document.getElementById('plan-due').value = today;
      document.getElementById('planned-modal-title').textContent = 'Add Planned Expense';
      document.getElementById('planned-edit-id').value = '';
    }
  }
  if (id === 'budget-modal') {
    const budget = DB.get('budget', {});
    if (budget.year) document.getElementById('bud-year').value = budget.year;
    if (budget.savings) document.getElementById('bud-savings').value = budget.savings;
    if (budget.invest) document.getElementById('bud-invest').value = budget.invest;
    if (budget.milestone) document.getElementById('bud-milestone').value = budget.milestone;
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'income-modal') document.getElementById('income-edit-id').value = '';
  if (id === 'expense-modal') document.getElementById('expense-edit-id').value = '';
  if (id === 'planned-modal') document.getElementById('planned-edit-id').value = '';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ============================================================
// INCOME CRUD
// ============================================================
function saveIncome(e) {
  e.preventDefault();
  const id = document.getElementById('income-edit-id').value;
  const entry = {
    id: id || uid(),
    date: document.getElementById('inc-date').value,
    source: document.getElementById('inc-source').value.trim(),
    category: document.getElementById('inc-category').value,
    amount: parseFloat(document.getElementById('inc-amount').value),
    type: document.getElementById('inc-type').value,
    notes: document.getElementById('inc-notes').value.trim(),
  };

  let incomes = DB.get('incomes', []);
  if (id) {
    incomes = incomes.map(i => i.id === id ? entry : i);
    showToast('Income updated successfully', 'success');
  } else {
    incomes.push(entry);
    showToast('Income added successfully', 'success');
  }

  DB.set('incomes', incomes);
  closeModal('income-modal');
  document.getElementById('income-edit-id').value = '';
  updateAllUI();
}

function editIncome(id) {
  const inc = DB.get('incomes', []).find(i => i.id === id);
  if (!inc) return;
  document.getElementById('income-edit-id').value = inc.id;
  document.getElementById('inc-date').value = inc.date;
  document.getElementById('inc-source').value = inc.source;
  document.getElementById('inc-category').value = inc.category;
  document.getElementById('inc-amount').value = inc.amount;
  document.getElementById('inc-type').value = inc.type;
  document.getElementById('inc-notes').value = inc.notes || '';
  document.getElementById('income-modal-title').textContent = 'Edit Income';
  openModal('income-modal');
}

function deleteIncome(id) {
  if (!confirm('Delete this income entry?')) return;
  const incomes = DB.get('incomes', []).filter(i => i.id !== id);
  DB.set('incomes', incomes);
  showToast('Income deleted', 'error');
  updateAllUI();
}

// ============================================================
// EXPENSE CRUD
// ============================================================
function saveExpense(e) {
  e.preventDefault();
  const id = document.getElementById('expense-edit-id').value;
  const entry = {
    id: id || uid(),
    date: document.getElementById('exp-date').value,
    category: document.getElementById('exp-category').value,
    amount: parseFloat(document.getElementById('exp-amount').value),
    payment: document.getElementById('exp-payment').value,
    notes: document.getElementById('exp-notes').value.trim(),
  };

  let expenses = DB.get('expenses', []);
  if (id) {
    expenses = expenses.map(e => e.id === id ? entry : e);
    showToast('Expense updated successfully', 'success');
  } else {
    expenses.push(entry);
    showToast('Expense added successfully', 'success');
  }

  DB.set('expenses', expenses);
  closeModal('expense-modal');
  document.getElementById('expense-edit-id').value = '';
  updateAllUI();
}

function editExpense(id) {
  const exp = DB.get('expenses', []).find(e => e.id === id);
  if (!exp) return;
  document.getElementById('expense-edit-id').value = exp.id;
  document.getElementById('exp-date').value = exp.date;
  document.getElementById('exp-category').value = exp.category;
  document.getElementById('exp-amount').value = exp.amount;
  document.getElementById('exp-payment').value = exp.payment;
  document.getElementById('exp-notes').value = exp.notes || '';
  document.getElementById('expense-modal-title').textContent = 'Edit Expense';
  openModal('expense-modal');
}

function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  const expenses = DB.get('expenses', []).filter(e => e.id !== id);
  DB.set('expenses', expenses);
  showToast('Expense deleted', 'error');
  updateAllUI();
}

// ============================================================
// PLANNED CRUD
// ============================================================
function savePlanned(e) {
  e.preventDefault();
  const id = document.getElementById('planned-edit-id').value;
  const entry = {
    id: id || uid(),
    name: document.getElementById('plan-name').value.trim(),
    category: document.getElementById('plan-category').value,
    amount: parseFloat(document.getElementById('plan-amount').value),
    due: document.getElementById('plan-due').value,
    frequency: document.getElementById('plan-frequency').value,
    status: document.getElementById('plan-status').value,
    notes: document.getElementById('plan-notes').value.trim(),
  };

  let planned = DB.get('planned', []);
  if (id) {
    planned = planned.map(p => p.id === id ? entry : p);
    showToast('Planned expense updated', 'success');
  } else {
    planned.push(entry);
    showToast('Planned expense added', 'success');
  }

  DB.set('planned', planned);
  closeModal('planned-modal');
  document.getElementById('planned-edit-id').value = '';
  updateAllUI();
}

function editPlanned(id) {
  const plan = DB.get('planned', []).find(p => p.id === id);
  if (!plan) return;
  document.getElementById('planned-edit-id').value = plan.id;
  document.getElementById('plan-name').value = plan.name;
  document.getElementById('plan-category').value = plan.category;
  document.getElementById('plan-amount').value = plan.amount;
  document.getElementById('plan-due').value = plan.due;
  document.getElementById('plan-frequency').value = plan.frequency;
  document.getElementById('plan-status').value = plan.status;
  document.getElementById('plan-notes').value = plan.notes || '';
  document.getElementById('planned-modal-title').textContent = 'Edit Planned Expense';
  openModal('planned-modal');
}

function deletePlanned(id) {
  if (!confirm('Delete this planned expense?')) return;
  const planned = DB.get('planned', []).filter(p => p.id !== id);
  DB.set('planned', planned);
  showToast('Planned expense deleted', 'error');
  updateAllUI();
}

// ============================================================
// BUDGET CRUD
// ============================================================
function saveBudget(e) {
  e.preventDefault();
  const budget = {
    year: parseInt(document.getElementById('bud-year').value),
    savings: parseFloat(document.getElementById('bud-savings').value) || 0,
    invest: parseFloat(document.getElementById('bud-invest').value) || 0,
    milestone: parseFloat(document.getElementById('bud-milestone').value) || 0,
  };
  DB.set('budget', budget);
  closeModal('budget-modal');
  showToast('Budget goals saved', 'success');
  updateAllUI();
}

// ============================================================
// CALCULATIONS
// ============================================================
function totalIncome(list = null) {
  const data = list || DB.get('incomes', []);
  return data.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

function totalExpense(list = null) {
  const data = list || DB.get('expenses', []);
  return data.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function totalPlanned() {
  return DB.get('planned', []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

function currentMonthItems(data) {
  const now = new Date();
  const m = now.getMonth(); const y = now.getFullYear();
  return data.filter(item => {
    const d = new Date(item.date || item.due);
    return d.getMonth() === m && d.getFullYear() === y;
  });
}

function getExpenseByCategory(expenses) {
  const map = {};
  expenses.forEach(e => {
    map[e.category] = (map[e.category] || 0) + Number(e.amount);
  });
  return map;
}

// ============================================================
// UPDATE ALL UI
// ============================================================
function updateAllUI() {
  updateNavBalance();
  const page = document.querySelector('.page.active');
  if (!page) return;
  const id = page.id.replace('page-', '');
  switch (id) {
    case 'dashboard': renderDashboard(); break;
    case 'income': renderIncomePage(); break;
    case 'expense': renderExpensePage(); break;
    case 'planned': renderPlannedPage(); break;
    case 'budget': renderBudgetPage(); break;
    case 'reports': updateReports(); break;
  }
}

function updateNavBalance() {
  const bal = totalIncome() - totalExpense();
  document.getElementById('nav-balance').textContent = fmt(bal);
}

// ============================================================
// PAGE 1: DASHBOARD
// ============================================================
function renderDashboard() {
  const incomes = DB.get('incomes', []);
  const expenses = DB.get('expenses', []);
  const planned = DB.get('planned', []);

  const inc = totalIncome(incomes);
  const exp = totalExpense(expenses);
  const savings = inc - exp;
  const plannedAmt = planned.filter(p => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const forecast = savings - plannedAmt;

  // Cards
  setEl('dash-income', fmt(inc));
  setEl('dash-expense', fmt(exp));
  setEl('dash-savings', fmt(savings));
  setEl('dash-forecast', fmt(forecast));

  // AI Insights
  const monthInc = currentMonthItems(incomes);
  const monthExp = currentMonthItems(expenses);
  const expectedInc = totalIncome(monthInc);
  const fixedExp = totalExpense(monthExp);

  const days = new Date().getDate();
  const dailyAvg = days > 0 ? fixedExp / days : 0;

  setEl('ai-expected-income', fmt(expectedInc));
  setEl('ai-fixed-expense', fmt(fixedExp));
  setEl('ai-daily-spend', fmt(dailyAvg));

  generateRecommendations(inc, exp, savings, dailyAvg, monthInc, monthExp);

  // Charts
  renderLineChart();
  renderPieChart();
}

function generateRecommendations(inc, exp, sav, daily, monthInc, monthExp) {
  const recs = [];
  const savingsRate = inc > 0 ? (sav / inc) * 100 : 0;

  if (inc === 0) {
    recs.push('Add your income sources to get personalized insights.');
  } else {
    if (savingsRate < 10) recs.push(`Your savings rate is ${savingsRate.toFixed(0)}% — aim for at least 20%.`);
    else if (savingsRate >= 30) recs.push(`Excellent! Your savings rate is ${savingsRate.toFixed(0)}% — keep it up.`);
    else recs.push(`Savings rate: ${savingsRate.toFixed(0)}%. Target 30%+ by reducing discretionary spending.`);

    if (daily > 0) recs.push(`Daily spending: ${fmt(daily)} — ${daily > 100 ? 'consider cutting back on non-essentials.' : 'looks reasonable!'}`);

    if (exp > inc) recs.push('⚠️ Expenses exceed income this month. Review your spending immediately.');

    const catMap = getExpenseByCategory(DB.get('expenses', []));
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    if (topCat) recs.push(`Your biggest expense category is "${topCat[0]}" at ${fmt(topCat[1])}.`);
  }

  if (recs.length === 0) recs.push('Keep tracking your finances for better insights!');

  const ul = document.getElementById('ai-recommendations');
  if (ul) ul.innerHTML = recs.map(r => `<li>${r}</li>`).join('');
}

function renderLineChart() {
  destroyChart('lineChart');
  const incomes = DB.get('incomes', []);
  const expenses = DB.get('expenses', []);

  // Group by month
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const incByMonth = new Array(12).fill(0);
  const expByMonth = new Array(12).fill(0);

  incomes.forEach(i => {
    const m = new Date(i.date).getMonth();
    if (!isNaN(m)) incByMonth[m] += Number(i.amount);
  });
  expenses.forEach(e => {
    const m = new Date(e.date).getMonth();
    if (!isNaN(m)) expByMonth[m] += Number(e.amount);
  });

  const ctx = document.getElementById('lineChart')?.getContext('2d');
  if (!ctx) return;

  Charts.lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Income',
          data: incByMonth,
          borderColor: '#4ade80',
          backgroundColor: 'rgba(74,222,128,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#4ade80',
          pointRadius: 4,
        },
        {
          label: 'Expenses',
          data: expByMonth,
          borderColor: '#f87171',
          backgroundColor: 'rgba(248,113,113,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#f87171',
          pointRadius: 4,
        }
      ]
    },
    options: chartDefaults()
  });
}

function renderPieChart() {
  destroyChart('pieChart');
  const expenses = DB.get('expenses', []);
  const catMap = getExpenseByCategory(expenses);
  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  const ctx = document.getElementById('pieChart')?.getContext('2d');
  if (!ctx) return;

  Charts.pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: pieColors(labels.length),
        borderColor: 'transparent',
        hoverOffset: 6,
      }]
    },
    options: {
      ...chartDefaults(),
      cutout: '65%',
    }
  });
}

// ============================================================
// PAGE 2: INCOME
// ============================================================
function renderIncomePage() {
  const incomes = DB.get('incomes', []);
  const total = totalIncome(incomes);
  const recurring = incomes.filter(i => i.type === 'recurring').reduce((s, i) => s + Number(i.amount), 0);

  setEl('inc-total', fmt(total));
  setEl('inc-recurring', fmt(recurring));

  const tbody = document.getElementById('income-tbody');
  if (!tbody) return;

  if (incomes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">💸</div><p>No income records yet. Add your first income!</p></div></td></tr>`;
    return;
  }

  const sorted = [...incomes].sort((a, b) => new Date(b.date) - new Date(a.date));
  tbody.innerHTML = sorted.map(i => `
    <tr>
      <td>${fmtDate(i.date)}</td>
      <td>${esc(i.source)}</td>
      <td>${esc(i.category)}</td>
      <td class="amount-positive">${fmt(i.amount)}</td>
      <td><span class="badge badge-${i.type === 'recurring' ? 'recurring' : 'one-time'}">${i.type}</span></td>
      <td>${esc(i.notes) || '—'}</td>
      <td>
        <button class="btn-edit" onclick="editIncome('${i.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteIncome('${i.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// ============================================================
// PAGE 3: EXPENSE
// ============================================================
function renderExpensePage() {
  const expenses = DB.get('expenses', []);
  const total = totalExpense(expenses);
  const monthExp = totalExpense(currentMonthItems(expenses));
  const catMap = getExpenseByCategory(expenses);
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  setEl('exp-total', fmt(total));
  setEl('exp-month', fmt(monthExp));
  setEl('exp-top-cat', topCat ? topCat[0] : '—');

  // Category breakdown
  renderCategoryBreakdown(catMap, total);

  const tbody = document.getElementById('expense-tbody');
  if (!tbody) return;

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">📊</div><p>No expenses recorded yet.</p></div></td></tr>`;
    return;
  }

  const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  tbody.innerHTML = sorted.map(e => `
    <tr>
      <td>${fmtDate(e.date)}</td>
      <td>${esc(e.category)}</td>
      <td class="amount-negative">${fmt(e.amount)}</td>
      <td>${esc(e.payment)}</td>
      <td>${esc(e.notes) || '—'}</td>
      <td>
        <button class="btn-edit" onclick="editExpense('${e.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteExpense('${e.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderCategoryBreakdown(catMap, total) {
  const container = document.getElementById('category-breakdown');
  if (!container) return;

  if (Object.keys(catMap).length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Add expenses to see category breakdown.</p>';
    return;
  }

  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted.map(([cat, amt]) => {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
    return `
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-name">${cat}</span>
          <span class="breakdown-pct">${pct}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:${pct}%; background: ${getCatColor(cat)};"></div>
        </div>
        <div class="breakdown-detail">
          <span>${fmt(amt)}</span>
          <span>of ${fmt(total)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// PAGE 4: PLANNED
// ============================================================
function renderPlannedPage() {
  const planned = DB.get('planned', []);
  const total = planned.reduce((s, p) => s + Number(p.amount), 0);
  const paid = planned.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const upcoming = planned.filter(p => p.status === 'upcoming').reduce((s, p) => s + Number(p.amount), 0);
  const recurring = planned.filter(p => p.frequency === 'Monthly').reduce((s, p) => s + Number(p.amount), 0);

  setEl('plan-total', fmt(total));
  setEl('plan-paid', fmt(paid));
  setEl('plan-upcoming', fmt(upcoming));
  setEl('plan-recurring', fmt(recurring));

  const tbody = document.getElementById('planned-tbody');
  if (!tbody) return;

  if (planned.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📅</div><p>No planned expenses. Add bills and subscriptions!</p></div></td></tr>`;
    return;
  }

  const sorted = [...planned].sort((a, b) => new Date(a.due) - new Date(b.due));
  tbody.innerHTML = sorted.map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.category)}</td>
      <td class="amount-neutral">${fmt(p.amount)}</td>
      <td>${fmtDate(p.due)}</td>
      <td>${esc(p.frequency)}</td>
      <td><span class="badge badge-${p.status}">${p.status}</span></td>
      <td>
        <button class="btn-edit" onclick="editPlanned('${p.id}')">Edit</button>
        <button class="btn-delete" onclick="deletePlanned('${p.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// ============================================================
// PAGE 5: BUDGET & GOALS
// ============================================================
function renderBudgetPage() {
  const incomes = DB.get('incomes', []);
  const expenses = DB.get('expenses', []);
  const budget = DB.get('budget', {});
  const year = budget.year || new Date().getFullYear();

  const yearlyInc = incomes
    .filter(i => new Date(i.date).getFullYear() === year)
    .reduce((s, i) => s + Number(i.amount), 0);
  const yearlyExp = expenses
    .filter(e => new Date(e.date).getFullYear() === year)
    .reduce((s, e) => s + Number(e.amount), 0);
  const yearlySav = yearlyInc - yearlyExp;

  setEl('bud-yearly-income', fmt(yearlyInc));
  setEl('bud-yearly-expense', fmt(yearlyExp));
  setEl('bud-yearly-savings', fmt(yearlySav));

  // Savings progress
  const savTarget = budget.savings || 0;
  const savPct = savTarget > 0 ? Math.min(100, (yearlySav / savTarget) * 100).toFixed(0) : 0;
  setEl('savings-pct', savPct + '%');
  setEl('savings-achieved', fmt(yearlySav));
  setEl('savings-target-lbl', fmt(savTarget));
  const savBar = document.getElementById('savings-prog');
  if (savBar) savBar.style.width = savPct + '%';

  // Investment progress (approximation: use Investment category expenses)
  const investAmt = expenses
    .filter(e => e.category === 'Investment' && new Date(e.date).getFullYear() === year)
    .reduce((s, e) => s + Number(e.amount), 0);
  const invTarget = budget.invest || 0;
  const invPct = invTarget > 0 ? Math.min(100, (investAmt / invTarget) * 100).toFixed(0) : 0;
  setEl('invest-pct', invPct + '%');
  setEl('invest-achieved', fmt(investAmt));
  setEl('invest-target-lbl', fmt(invTarget));
  const invBar = document.getElementById('invest-prog');
  if (invBar) invBar.style.width = invPct + '%';

  // Monthly cards
  renderMonthlyCards(incomes, expenses, budget, year);
}

function renderMonthlyCards(incomes, expenses, budget, year) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const milestone = budget.milestone || 0;
  const grid = document.getElementById('monthly-grid');
  if (!grid) return;

  const now = new Date();

  grid.innerHTML = months.map((m, idx) => {
    const monthInc = incomes
      .filter(i => { const d = new Date(i.date); return d.getFullYear() === year && d.getMonth() === idx; })
      .reduce((s, i) => s + Number(i.amount), 0);
    const monthExp = expenses
      .filter(e => { const d = new Date(e.date); return d.getFullYear() === year && d.getMonth() === idx; })
      .reduce((s, e) => s + Number(e.amount), 0);
    const achieved = monthInc - monthExp;
    const isPast = (idx < now.getMonth() && year === now.getFullYear()) || year < now.getFullYear();
    const isCurrent = idx === now.getMonth() && year === now.getFullYear();

    let statusClass = 'status-pending';
    let statusText = 'Pending';
    if (isPast || isCurrent) {
      if (achieved >= milestone) { statusClass = 'status-achieved'; statusText = 'Achieved'; }
      else { statusClass = 'status-missed'; statusText = 'Missed'; }
    }

    return `
      <div class="month-card">
        <div class="month-name">${m}</div>
        <div class="month-target">Target: ${fmt(milestone)}</div>
        <div class="month-achieved">${fmt(achieved)}</div>
        <div class="month-status ${statusClass}">${statusText}</div>
      </div>
    `;
  }).join('');
}

// ============================================================
// PAGE 6: REPORTS
// ============================================================
function populateReportMonthFilter() {
  const sel = document.getElementById('report-month');
  if (!sel) return;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  // Last 12 months
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
    const label = `${months[d.getMonth()]} ${d.getFullYear()}`;
    const opt = new Option(label, val);
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

function updateReports() {
  const sel = document.getElementById('report-month');
  const filter = sel ? sel.value : 'all';

  let incomes = DB.get('incomes', []);
  let expenses = DB.get('expenses', []);

  if (filter !== 'all') {
    const [y, m] = filter.split('-').map(Number);
    incomes = incomes.filter(i => { const d = new Date(i.date); return d.getFullYear() === y && d.getMonth() + 1 === m; });
    expenses = expenses.filter(e => { const d = new Date(e.date); return d.getFullYear() === y && d.getMonth() + 1 === m; });
  }

  const inc = totalIncome(incomes);
  const exp = totalExpense(expenses);
  const sav = inc - exp;
  const days = filter !== 'all' ? new Date(filter.split('-')[0], filter.split('-')[1], 0).getDate() : 30;
  const daily = exp / Math.max(days, 1);

  setEl('rep-income', fmt(inc));
  setEl('rep-expense', fmt(exp));
  setEl('rep-savings', fmt(sav));
  setEl('rep-daily', fmt(daily));
  setEl('rep-income-count', `${incomes.length} transactions`);
  setEl('rep-expense-count', `${expenses.length} transactions`);

  renderRepLineChart(incomes, expenses);
  renderRepIncomePie(incomes);
  renderRepExpenseBar(expenses);
  renderRepPaymentPie(expenses);
  renderRepCategoryProgress(expenses);
}

function renderRepLineChart(incomes, expenses) {
  destroyChart('repLineChart');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const incByMonth = new Array(12).fill(0);
  const expByMonth = new Array(12).fill(0);
  incomes.forEach(i => { const m = new Date(i.date).getMonth(); if (!isNaN(m)) incByMonth[m] += Number(i.amount); });
  expenses.forEach(e => { const m = new Date(e.date).getMonth(); if (!isNaN(m)) expByMonth[m] += Number(e.amount); });

  const ctx = document.getElementById('repLineChart')?.getContext('2d');
  if (!ctx) return;
  Charts.repLineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Income', data: incByMonth, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.08)', tension: 0.4, fill: true, pointRadius: 3 },
        { label: 'Expenses', data: expByMonth, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)', tension: 0.4, fill: true, pointRadius: 3 }
      ]
    },
    options: chartDefaults()
  });
}

function renderRepIncomePie(incomes) {
  destroyChart('repIncomePie');
  const map = {};
  incomes.forEach(i => { map[i.category] = (map[i.category] || 0) + Number(i.amount); });
  const ctx = document.getElementById('repIncomePie')?.getContext('2d');
  if (!ctx) return;
  Charts.repIncomePie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(map),
      datasets: [{ data: Object.values(map), backgroundColor: pieColors(Object.keys(map).length), borderColor: 'transparent' }]
    },
    options: { ...chartDefaults(), cutout: '65%' }
  });
}

function renderRepExpenseBar(expenses) {
  destroyChart('repExpenseBar');
  const catMap = getExpenseByCategory(expenses);
  const ctx = document.getElementById('repExpenseBar')?.getContext('2d');
  if (!ctx) return;
  Charts.repExpenseBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(catMap),
      datasets: [{
        label: 'Amount',
        data: Object.values(catMap),
        backgroundColor: pieColors(Object.keys(catMap).length),
        borderRadius: 4,
      }]
    },
    options: { ...chartDefaults(), plugins: { ...chartDefaults().plugins, legend: { display: false } } }
  });
}

function renderRepPaymentPie(expenses) {
  destroyChart('repPaymentPie');
  const map = {};
  expenses.forEach(e => { map[e.payment] = (map[e.payment] || 0) + Number(e.amount); });
  const ctx = document.getElementById('repPaymentPie')?.getContext('2d');
  if (!ctx) return;
  Charts.repPaymentPie = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(map),
      datasets: [{ data: Object.values(map), backgroundColor: pieColors(Object.keys(map).length), borderColor: 'transparent' }]
    },
    options: chartDefaults()
  });
}

function renderRepCategoryProgress(expenses) {
  const catMap = getExpenseByCategory(expenses);
  const total = Object.values(catMap).reduce((s, v) => s + v, 0);
  const container = document.getElementById('rep-category-progress');
  if (!container) return;

  if (Object.keys(catMap).length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No expense data for selected period.</p>';
    return;
  }

  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted.map(([cat, amt]) => {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
    return `
      <div class="rep-prog-item">
        <span class="rep-prog-name">${cat}</span>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%; background:${getCatColor(cat)};"></div></div>
        <span class="rep-prog-amount">${fmt(amt)}</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// EXPORT
// ============================================================
function exportCSV() {
  const incomes = DB.get('incomes', []);
  const expenses = DB.get('expenses', []);

  let csv = 'Type,Date,Description,Category,Amount,Notes\n';
  incomes.forEach(i => { csv += `Income,${i.date},${i.source},${i.category},${i.amount},"${i.notes || ''}"\n`; });
  expenses.forEach(e => { csv += `Expense,${e.date},,${e.category},${e.amount},"${e.notes || ''}"\n`; });

  downloadFile(csv, 'finance-report.csv', 'text/csv');
  showToast('CSV exported successfully', 'success');
}

function exportPDF() {
  // Simple print-based PDF export
  window.print();
  showToast('Use browser print dialog to save as PDF', 'info');
}

function exportAllData() {
  const data = {
    incomes: DB.get('incomes', []),
    expenses: DB.get('expenses', []),
    planned: DB.get('planned', []),
    budget: DB.get('budget', {}),
    settings: DB.get('settings', {}),
    exportedAt: new Date().toISOString(),
  };
  downloadFile(JSON.stringify(data, null, 2), 'finance-backup.json', 'application/json');
  showToast('Data exported!', 'success');
}

function downloadBackup() {
  exportAllData();
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function clearAllData() {
  if (!confirm('Are you sure you want to clear ALL financial data? This cannot be undone.')) return;
  DB.del('incomes'); DB.del('expenses'); DB.del('planned'); DB.del('budget');
  showToast('All data cleared', 'error');
  updateAllUI();
}

function deleteAccount() {
  if (!confirm('Permanently delete account and ALL data? You will be logged out.')) return;
  localStorage.clear();
  location.reload();
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
  const settings = DB.get('settings', {});

  // Theme — apply saved custom theme vars first, then base mode
  const isDark = settings.theme !== 'light';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  const tog = document.getElementById('dark-mode-toggle');
  if (tog) tog.checked = isDark;

  // Restore any saved custom theme CSS variables
  if (settings.customTheme) applyTheme(settings.customTheme, false);

  // Currency — sync selector; no toast on load
  const cur = document.getElementById('currency-sel');
  if (cur && settings.currency) cur.value = settings.currency;

  // Date format
  const df = document.getElementById('date-format-sel');
  if (df && settings.dateFormat) df.value = settings.dateFormat;

  // Notifications
  const notif = document.getElementById('notif-toggle');
  if (notif) notif.checked = !!settings.notifications;

  const bill = document.getElementById('bill-toggle');
  if (bill) bill.checked = !!settings.billReminders;
}

function saveSetting(key, val) {
  const settings = DB.get('settings', {});
  settings[key] = val;
  DB.set('settings', settings);
}

function toggleTheme(isDark) {
  const theme = isDark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  saveSetting('theme', theme);
  // Clear any custom theme so base dark/light CSS vars take over again
  saveSetting('customTheme', null);
  showToast(`Switched to ${theme} mode`, 'info');
}

// ============================================================
// AI DYNAMIC THEME ENGINE
// ============================================================

/**
 * PRESET THEME LIBRARY
 * Each entry maps a human-readable name → a complete set of CSS
 * variable overrides.  Add more entries to extend the palette.
 * Keys must match CSS custom properties declared in :root.
 */
const THEME_PRESETS = {
  /* ── Blues ── */
  'ocean blue': {
    label: 'Ocean Blue',
    '--bg-primary':    '#020c18',
    '--bg-secondary':  '#041628',
    '--bg-card':       '#061e38',
    '--bg-card-hover': '#0a2848',
    '--bg-input':      '#071f3a',
    '--bg-modal':      '#051628',
    '--border':        '#0d3660',
    '--border-light':  '#0a2848',
    '--text-primary':  '#e0f0ff',
    '--text-secondary':'#6ba3cc',
    '--text-muted':    '#3d6a8a',
    '--accent':        '#38bdf8',
    '--accent-dim':    'rgba(56,189,248,0.15)',
    '--accent-glow':   'rgba(56,189,248,0.4)',
    '--green':         '#34d399',
    '--red':           '#f87171',
    '--blue':          '#60a5fa',
  },
  'midnight blue': {
    label: 'Midnight Blue',
    '--bg-primary':    '#010918',
    '--bg-secondary':  '#030d22',
    '--bg-card':       '#06122e',
    '--bg-card-hover': '#0b1d42',
    '--bg-input':      '#07142f',
    '--bg-modal':      '#04102a',
    '--border':        '#1a2e5a',
    '--border-light':  '#0f2040',
    '--text-primary':  '#d6e8ff',
    '--text-secondary':'#5a85c2',
    '--text-muted':    '#304d7a',
    '--accent':        '#818cf8',
    '--accent-dim':    'rgba(129,140,248,0.15)',
    '--accent-glow':   'rgba(129,140,248,0.4)',
    '--green':         '#4ade80',
    '--red':           '#f87171',
    '--blue':          '#60a5fa',
  },

  /* ── Warm ── */
  'sunset orange': {
    label: 'Sunset Orange',
    '--bg-primary':    '#140800',
    '--bg-secondary':  '#200e00',
    '--bg-card':       '#291200',
    '--bg-card-hover': '#361900',
    '--bg-input':      '#2c1400',
    '--bg-modal':      '#221000',
    '--border':        '#5c2a00',
    '--border-light':  '#3d1c00',
    '--text-primary':  '#fff0e0',
    '--text-secondary':'#c07840',
    '--text-muted':    '#7a4420',
    '--accent':        '#fb923c',
    '--accent-dim':    'rgba(251,146,60,0.15)',
    '--accent-glow':   'rgba(251,146,60,0.4)',
    '--green':         '#4ade80',
    '--red':           '#f87171',
    '--blue':          '#60a5fa',
  },
  'rose gold': {
    label: 'Rose Gold',
    '--bg-primary':    '#160a0d',
    '--bg-secondary':  '#210e13',
    '--bg-card':       '#2c1219',
    '--bg-card-hover': '#3a1820',
    '--bg-input':      '#2e131a',
    '--bg-modal':      '#230f14',
    '--border':        '#6b2535',
    '--border-light':  '#451822',
    '--text-primary':  '#ffe8ec',
    '--text-secondary':'#cc7a8a',
    '--text-muted':    '#7a3a45',
    '--accent':        '#fb7185',
    '--accent-dim':    'rgba(251,113,133,0.15)',
    '--accent-glow':   'rgba(251,113,133,0.4)',
    '--green':         '#4ade80',
    '--red':           '#fca5a5',
    '--blue':          '#60a5fa',
  },

  /* ── Greens ── */
  'emerald dark': {
    label: 'Emerald Dark',
    '--bg-primary':    '#011008',
    '--bg-secondary':  '#031a0c',
    '--bg-card':       '#052212',
    '--bg-card-hover': '#0a3020',
    '--bg-input':      '#062416',
    '--bg-modal':      '#041c0e',
    '--border':        '#0d5028',
    '--border-light':  '#093a1c',
    '--text-primary':  '#d0ffe8',
    '--text-secondary':'#4db880',
    '--text-muted':    '#1f6640',
    '--accent':        '#34d399',
    '--accent-dim':    'rgba(52,211,153,0.15)',
    '--accent-glow':   'rgba(52,211,153,0.4)',
    '--green':         '#4ade80',
    '--red':           '#f87171',
    '--blue':          '#38bdf8',
  },
  'forest': {
    label: 'Forest',
    '--bg-primary':    '#050f06',
    '--bg-secondary':  '#091808',
    '--bg-card':       '#0e2010',
    '--bg-card-hover': '#162e18',
    '--bg-input':      '#0f2212',
    '--bg-modal':      '#0b1c0c',
    '--border':        '#1e4822',
    '--border-light':  '#163618',
    '--text-primary':  '#d4edd0',
    '--text-secondary':'#5a9c5e',
    '--text-muted':    '#2a5c2e',
    '--accent':        '#86efac',
    '--accent-dim':    'rgba(134,239,172,0.15)',
    '--accent-glow':   'rgba(134,239,172,0.4)',
    '--green':         '#4ade80',
    '--red':           '#f87171',
    '--blue':          '#60a5fa',
  },

  /* ── Purples ── */
  'cosmic purple': {
    label: 'Cosmic Purple',
    '--bg-primary':    '#09030f',
    '--bg-secondary':  '#110618',
    '--bg-card':       '#180a22',
    '--bg-card-hover': '#220f30',
    '--bg-input':      '#190c25',
    '--bg-modal':      '#13071d',
    '--border':        '#3d1260',
    '--border-light':  '#280d40',
    '--text-primary':  '#ede0ff',
    '--text-secondary':'#9d6ec0',
    '--text-muted':    '#5a3880',
    '--accent':        '#c084fc',
    '--accent-dim':    'rgba(192,132,252,0.15)',
    '--accent-glow':   'rgba(192,132,252,0.4)',
    '--green':         '#4ade80',
    '--red':           '#f87171',
    '--blue':          '#818cf8',
  },
  'neon purple': {
    label: 'Neon Purple',
    '--bg-primary':    '#060010',
    '--bg-secondary':  '#0d0020',
    '--bg-card':       '#12002c',
    '--bg-card-hover': '#1a003c',
    '--bg-input':      '#14003a',
    '--bg-modal':      '#0f0025',
    '--border':        '#4400aa',
    '--border-light':  '#2c0070',
    '--text-primary':  '#f0e0ff',
    '--text-secondary':'#b060ff',
    '--text-muted':    '#6020a0',
    '--accent':        '#a855f7',
    '--accent-dim':    'rgba(168,85,247,0.2)',
    '--accent-glow':   'rgba(168,85,247,0.5)',
    '--green':         '#4ade80',
    '--red':           '#f87171',
    '--blue':          '#60a5fa',
  },

  /* ── Monochrome ── */
  'arctic white': {
    label: 'Arctic White',
    '--bg-primary':    '#f0f4f8',
    '--bg-secondary':  '#ffffff',
    '--bg-card':       '#ffffff',
    '--bg-card-hover': '#f8fafc',
    '--bg-input':      '#eef2f6',
    '--bg-modal':      '#ffffff',
    '--border':        '#d0dae6',
    '--border-light':  '#e4ecf4',
    '--text-primary':  '#0d1520',
    '--text-secondary':'#4a6080',
    '--text-muted':    '#90a8c0',
    '--accent':        '#0ea5e9',
    '--accent-dim':    'rgba(14,165,233,0.12)',
    '--accent-glow':   'rgba(14,165,233,0.35)',
    '--green':         '#16a34a',
    '--red':           '#dc2626',
    '--blue':          '#2563eb',
  },
  'cyberpunk': {
    label: 'Cyberpunk',
    '--bg-primary':    '#000a0a',
    '--bg-secondary':  '#001414',
    '--bg-card':       '#001c1c',
    '--bg-card-hover': '#002828',
    '--bg-input':      '#001e1e',
    '--bg-modal':      '#001818',
    '--border':        '#004444',
    '--border-light':  '#002e2e',
    '--text-primary':  '#ccffff',
    '--text-secondary':'#00c0b0',
    '--text-muted':    '#006858',
    '--accent':        '#00ffcc',
    '--accent-dim':    'rgba(0,255,204,0.12)',
    '--accent-glow':   'rgba(0,255,204,0.4)',
    '--green':         '#00ff88',
    '--red':           '#ff4466',
    '--blue':          '#00ccff',
  },
};

/**
 * applyTheme(themeObject, save = true)
 * Injects a complete set of CSS variable overrides onto :root.
 * Works alongside (not replacing) the base dark/light CSS vars —
 * it only overrides what the theme defines.
 *
 * @param {object}  themeObject  A THEME_PRESETS entry or any {--var: val} map
 * @param {boolean} save         Whether to persist to localStorage (default true)
 */
function applyTheme(themeObject, save = true) {
  if (!themeObject) return;

  const root = document.documentElement;

  // Smooth transition so all color changes animate
  root.style.setProperty('transition',
    'background 0.5s ease, color 0.5s ease');

  // Inject every variable the preset defines
  Object.entries(themeObject).forEach(([prop, val]) => {
    if (prop.startsWith('--')) root.style.setProperty(prop, val);
  });

  // Persist the raw themeObject (so page load can re-apply it)
  if (save) saveSetting('customTheme', themeObject);

  // Remove the transition after it completes so it doesn't interfere
  // with hover/focus transitions defined in CSS
  setTimeout(() => root.style.removeProperty('transition'), 600);
}

/**
 * resolveThemeName(input) → themeObject | null
 * Maps a user-typed string to a preset, with fuzzy matching so
 * "Ocean", "ocean blue", "OCEAN BLUE" all resolve correctly.
 */
function resolveThemeName(input) {
  const q = input.toLowerCase().trim();

  // 1. Exact key match
  if (THEME_PRESETS[q]) return THEME_PRESETS[q];

  // 2. Fuzzy: find the first preset whose key *contains* any word
  //    from the query, or whose label matches
  const words = q.split(/\s+/);
  return Object.entries(THEME_PRESETS).find(([key, preset]) => {
    const searchable = key + ' ' + (preset.label || '').toLowerCase();
    return words.some(w => searchable.includes(w));
  })?.[1] || null;
}

/**
 * renderThemeChips()
 * Dynamically builds one clickable chip per preset so users can
 * apply themes without typing.  Call once on initApp().
 */
function renderThemeChips() {
  const container = document.getElementById('theme-chips');
  if (!container) return;

  container.innerHTML = Object.entries(THEME_PRESETS).map(([key, preset]) => {
    // Use the preset's own accent colour as the swatch dot
    const dotColor = preset['--accent'] || '#D4AF37';
    return `
      <button
        class="theme-chip"
        onclick="applyTheme(THEME_PRESETS['${key}']); showToast('✨ ${preset.label} applied!','success')"
        title="Apply ${preset.label} theme"
      >
        <span class="theme-chip-dot" style="background:${dotColor};"></span>
        ${preset.label}
      </button>
    `;
  }).join('');
}

/**
 * requestAITheme()
 * Reads the text input, resolves the theme, applies it.
 * Triggered by the "Apply Theme" button in Settings HTML.
 */
function requestAITheme() {
  const input = document.getElementById('ai-theme-input');
  if (!input) return;
  const query = input.value.trim();
  if (!query) { showToast('Enter a theme name first', 'error'); return; }

  const theme = resolveThemeName(query);
  if (!theme) {
    showToast(`Theme "${query}" not found. Try: ${Object.keys(THEME_PRESETS).slice(0,4).join(', ')}…`, 'error');
    return;
  }

  applyTheme(theme);
  showToast(`✨ ${theme.label || query} theme applied!`, 'success');
  input.value = '';

  // Rebuild charts so their grid/text colours update
  const activePage = document.querySelector('.page.active');
  const pageId = activePage ? activePage.id.replace('page-', '') : '';
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'reports')   updateReports();
}

/**
 * resetCustomTheme()
 * Wipes all inline CSS variable overrides and falls back to the
 * base dark/light stylesheet.
 */
function resetCustomTheme() {
  const root = document.documentElement;
  // Remove every custom property we might have set
  Object.keys(THEME_PRESETS[Object.keys(THEME_PRESETS)[0]]).forEach(prop => {
    if (prop.startsWith('--')) root.style.removeProperty(prop);
  });
  saveSetting('customTheme', null);
  showToast('Theme reset to default', 'info');
}

// ============================================================
// TABLE SEARCH FILTER
// ============================================================
function filterTable(tableId, query) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  const q = query.toLowerCase();
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

// ============================================================
// CHART HELPERS
// ============================================================
function chartDefaults() {
  const isDark = document.documentElement.dataset.theme !== 'light';
  const textColor = isDark ? '#888888' : '#555555';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: textColor,
          padding: 16,
          font: { family: "'JetBrains Mono', monospace", size: 11 },
          boxWidth: 12,
          boxHeight: 12,
        }
      },
      tooltip: {
        backgroundColor: isDark ? '#1a1a1a' : '#fff',
        titleColor: isDark ? '#f0f0f0' : '#0a0a0a',
        bodyColor: textColor,
        borderColor: isDark ? '#2a2a2a' : '#e5e5e5',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      }
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 10 } }
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 10 } }
      }
    }
  };
}

const PIE_COLORS = [
  '#D4AF37','#4ade80','#60a5fa','#f87171','#a78bfa',
  '#fb923c','#34d399','#f472b6','#facc15','#38bdf8',
  '#c084fc','#86efac'
];

function pieColors(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(PIE_COLORS[i % PIE_COLORS.length]);
  return arr;
}

function getCatColor(cat) {
  const map = {
    'Food & Dining': '#fb923c',
    'Transportation': '#60a5fa',
    'Housing': '#a78bfa',
    'Utilities': '#38bdf8',
    'Healthcare': '#34d399',
    'Entertainment': '#f472b6',
    'Shopping': '#facc15',
    'Education': '#c084fc',
    'Insurance': '#86efac',
    'Savings': '#4ade80',
    'Investment': '#D4AF37',
    'Other': '#888888',
  };
  return map[cat] || '#D4AF37';
}

// ============================================================
// UTILS
// ============================================================
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Escape HTML to prevent XSS
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}