// ===== 1. Данные =====
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

let transactions = load('transactions'); // доходы и расходы
let events = load('events');             // события календаря
let budgets = load('budgets');           // лимиты по категориям
let goals = load('goals');               // копилки

function save() {
  localStorage.setItem('transactions', JSON.stringify(transactions));
  localStorage.setItem('events', JSON.stringify(events));
  localStorage.setItem('budgets', JSON.stringify(budgets));
  localStorage.setItem('goals', JSON.stringify(goals));
}

const $ = (id) => document.getElementById(id);

// Уникальный номер для каждой записи
let idCounter = 0;
const newId = () => Date.now() * 1000 + (idCounter++ % 1000);

const CATEGORIES = ['Еда', 'Транспорт', 'Дом', 'Здоровье', 'Развлечения', 'Покупки', 'Зарплата', 'Другое'];

const CATEGORY_ICONS = {
  'Еда': '🛒', 'Транспорт': '🚕', 'Дом': '🏠', 'Здоровье': '💊',
  'Развлечения': '🎬', 'Покупки': '🛍️', 'Зарплата': '💼', 'Другое': '📦',
};

const CATEGORY_COLORS = {
  'Еда': '#ff9f43', 'Транспорт': '#4dabf7', 'Дом': '#845ef7', 'Здоровье': '#ff6b6b',
  'Развлечения': '#f06595', 'Покупки': '#20c997', 'Зарплата': '#51cf66', 'Другое': '#adb5bd',
};

const REPEAT_LABELS = { monthly: 'каждый месяц', yearly: 'каждый год', once: 'разово' };

// Названия месяцев в разных падежах
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const MONTHS_TO = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// ===== 2. Даты и деньги =====
const pad = (n) => String(n).padStart(2, '0');

// Date → "2026-11-23"
function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-11-23" → Date
function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const today = () => toISO(new Date());

function addDays(dateString, n) {
  const d = fromISO(dateString);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

// "2026-11-23" → "2026-11"
const monthKey = (dateString) => dateString.slice(0, 7);

// Сдвиг месяца: shiftMonth("2026-01", -1) → "2025-12"
function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// "2026-11" → "Ноябрь 2026"
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// 85000 → "85 000 ₽", 1245.5 → "1 245,50 ₽"
function formatMoney(n) {
  const digits = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2;
  return n.toLocaleString('ru-RU', {
    style: 'currency', currency: 'RUB',
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

// "2026-11-23" → "23 ноября"
const formatDay = (s) => fromISO(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

// Заголовок дня в истории
function dayLabel(s) {
  if (s === today()) return 'Сегодня';
  if (s === addDays(today(), -1)) return 'Вчера';
  const options = { day: 'numeric', month: 'long' };
  if (fromISO(s).getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return fromISO(s).toLocaleDateString('ru-RU', options);
}

const sumOf = (list, type) =>
  list.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0);

const sortedTransactions = () =>
  [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

function emptyBlock(text) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.textContent = text;
  return el;
}

function showMessage(id, text, isError) {
  $(id).textContent = text;
  $(id).className = 'message ' + (isError ? 'error' : 'success');
}

// "-1 234,56" → -1234.56
function parseAmount(value) {
  if (!value) return NaN;
  let s = String(value).replace(/[\s\u00A0]/g, '').replace(/−/g, '-');
  s = s.includes(',') && s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
  s = s.replace(/[^\d.\-]/g, '');
  return parseFloat(s);
}

// ===== 3. Категории =====
const CATEGORY_KEYWORDS = {
  'Еда': ['пятерочка', 'перекресток', 'магнит', 'лента', 'ашан', 'вкусвилл', 'дикси',
    'азбука', 'супермаркет', 'продукт', 'кафе', 'ресторан', 'кофе', 'макдон', 'вкусно',
    'kfc', 'бургер', 'пицц', 'самокат', 'лавка', 'фастфуд'],
  'Транспорт': ['такси', 'taxi', 'метро', 'транспорт', 'азс', 'лукойл', 'роснефть',
    'газпромнефть', 'бензин', 'топливо', 'парковк', 'каршеринг', 'делимобиль', 'ржд', 'аэрофлот'],
  'Дом': ['жкх', 'коммунал', 'квартплат', 'аренд', 'электроэнерг', 'интернет', 'связь', 'мтс',
    'билайн', 'мегафон', 'теле2', 'ростелеком', 'леруа', 'хозтовар'],
  'Здоровье': ['аптек', 'клиник', 'стоматолог', 'медицин', 'здоров', 'анализ', 'больниц'],
  'Развлечения': ['кино', 'театр', 'концерт', 'игр', 'steam', 'подписк', 'кинопоиск',
    'okko', 'ivi', 'развлечен'],
  'Покупки': ['wildberries', 'вайлдберриз', 'ozon', 'озон', 'маркет', 'одежд', 'обув', 'магазин'],
  'Зарплата': ['зарплат', 'заработн', 'аванс', 'salary'],
};

function guessCategory(text) {
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((word) => lower.includes(word))) return category;
  }
  return 'Другое';
}

function fillCategorySelect(select, list) {
  select.innerHTML = list.map((c) => `<option value="${c}">${CATEGORY_ICONS[c]} ${c}</option>`).join('');
}

// ===== 4. Операции =====
function transactionItem(t) {
  const el = document.createElement('div');
  el.className = 'item clickable';
  el.innerHTML = `
    <div class="item-icon"></div>
    <div class="item-info"><strong></strong><small></small></div>
    <span class="item-sum ${t.type}"></span>
    <button class="item-delete" aria-label="Удалить">✕</button>
  `;
  el.querySelector('.item-icon').textContent = CATEGORY_ICONS[t.category] || '📦';
  el.querySelector('strong').textContent = t.title;
  el.querySelector('small').textContent = `${t.category} · ${formatDay(t.date)}`;
  el.querySelector('.item-sum').textContent =
    (t.type === 'income' ? '+' : '−') + formatMoney(t.amount);

  // Нажатие на операцию — редактирование
  el.onclick = () => openTxSheet(t);

  el.querySelector('.item-delete').onclick = (e) => {
    e.stopPropagation(); // чтобы не открылось редактирование
    if (confirm(`Удалить «${t.title}»?`)) {
      transactions = transactions.filter((x) => x.id !== t.id);
      save();
      renderAll();
    }
  };
  return el;
}

let editingId = null;

function openTxSheet(t = null) {
  const form = $('txForm');
  form.reset();
  editingId = t ? t.id : null;
  $('txSheetTitle').textContent = t ? 'Изменить операцию' : 'Новая операция';
  $('txSubmit').textContent = t ? 'Сохранить' : 'Добавить';

  if (t) {
    form.elements.type.value = t.type;
    $('title').value = t.title;
    $('amount').value = t.amount;
    $('category').value = t.category;
    $('date').value = t.date;
  } else {
    $('date').value = today();
  }
  $('txSheet').hidden = false;
}

// ===== 5. Календарь: расчёт событий =====

// Происходит ли событие в этот день
function occursOn(event, d) {
  const start = fromISO(event.date);
  if (d < start) return false;
  if (event.repeat === 'once') return toISO(d) === event.date;

  // Если событие 31-го, а в месяце 30 дней — переносим на последний день
  const targetDay = Math.min(start.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
  if (event.repeat === 'monthly') return d.getDate() === targetDay;
  if (event.repeat === 'yearly') return d.getMonth() === start.getMonth() && d.getDate() === targetDay;
  return false;
}

// Ключ периода, чтобы помнить, что платёж за этот месяц/год уже сделан
function periodKey(event, dateString) {
  if (event.repeat === 'monthly') return dateString.slice(0, 7);
  if (event.repeat === 'yearly') return dateString.slice(0, 4);
  return 'once';
}

// Все события в промежутке дат
function getOccurrences(fromDate, toDate) {
  const result = [];
  const end = fromISO(toDate);
  for (let d = fromISO(fromDate); d <= end; d.setDate(d.getDate() + 1)) {
    events.forEach((event) => {
      if (occursOn(event, d)) {
        const date = toISO(d);
        result.push({
          event,
          date,
          paid: Boolean(event.paid && event.paid[periodKey(event, date)]),
        });
      }
    });
  }
  return result;
}

function statusOf(date, type) {
  const diff = Math.round((fromISO(date) - fromISO(today())) / 86400000);
  if (diff < 0) return { text: type === 'income' ? 'Не получено' : 'Просрочено', cls: 'late' };
  if (diff === 0) return { text: 'Сегодня', cls: 'late' };
  if (diff === 1) return { text: 'Завтра', cls: 'soon' };
  return { text: `Через ${diff} дн.`, cls: 'soon' };
}

// Отметить событие выполненным и записать операцию
function markPaid(occurrence) {
  const event = occurrence.event;
  let amount = event.amount;

  if (!amount) {
    const input = prompt(`Сумма для «${event.title}», ₽`);
    if (input === null) return;
    amount = parseAmount(input);
    if (!(amount > 0)) {
      alert('Введите сумму больше нуля');
      return;
    }
  }

  transactions.push({
    id: newId(),
    type: event.type,
    title: event.title,
    amount: Math.round(amount * 100) / 100,
    category: guessCategory(event.title),
    date: occurrence.date <= today() ? occurrence.date : today(),
  });

  event.paid = event.paid || {};
  event.paid[periodKey(event, occurrence.date)] = true;
  save();
  renderAll();
}

function eventItem(occurrence) {
  const event = occurrence.event;
  const el = document.createElement('div');
  el.className = 'item';
  el.innerHTML = `
    <div class="item-icon ${event.type === 'income' ? 'ev-income' : 'ev-expense'}">
      ${event.type === 'income' ? '💰' : '🧾'}
    </div>
    <div class="item-info"><strong></strong><small></small></div>
    <div class="item-side"></div>
    <button class="item-delete" aria-label="Удалить событие">✕</button>
  `;
  el.querySelector('strong').textContent = event.title;

  const parts = [formatDay(occurrence.date), REPEAT_LABELS[event.repeat]];
  if (event.amount) parts.push(formatMoney(event.amount));
  el.querySelector('small').textContent = parts.join(' · ');

  const side = el.querySelector('.item-side');
  if (occurrence.paid) {
    const badge = document.createElement('span');
    badge.className = 'badge done';
    badge.textContent = event.type === 'income' ? 'Получено' : 'Оплачено';
    side.append(badge);
  } else {
    const status = statusOf(occurrence.date, event.type);
    const badge = document.createElement('span');
    badge.className = 'badge ' + status.cls;
    badge.textContent = status.text;

    const button = document.createElement('button');
    button.className = 'pay-btn';
    button.textContent = '✓';
    button.title = event.type === 'income' ? 'Отметить полученным' : 'Отметить оплаченным';
    button.onclick = () => markPaid(occurrence);

    side.append(badge, button);
  }

  el.querySelector('.item-delete').onclick = () => {
    if (confirm(`Удалить событие «${event.title}»?`)) {
      events = events.filter((x) => x.id !== event.id);
      save();
      renderAll();
    }
  };
  return el;
}

// ===== 6. Копилки =====
function goalForecast(goal) {
  if (goal.saved >= goal.target) return '🎉 Цель достигнута!';
  const deposits = goal.deposits || [];
  const depositedTotal = deposits.reduce((sum, d) => sum + d.amount, 0);
  if (!depositedTotal) return 'Пополните копилку, чтобы увидеть прогноз';

  // Средний темп пополнения в месяц с момента создания копилки
  const days = Math.max(1, Math.round((fromISO(today()) - fromISO(goal.created)) / 86400000));
  const perMonth = depositedTotal / Math.max(1, days / 30);
  const monthsLeft = Math.ceil((goal.target - goal.saved) / perMonth);

  const d = new Date();
  d.setMonth(d.getMonth() + monthsLeft);
  return `При текущем темпе накопите к ${MONTHS_TO[d.getMonth()]} ${d.getFullYear()}`;
}

function goalItem(goal) {
  const el = document.createElement('div');
  el.className = 'goal';
  const percent = Math.min(100, Math.round((goal.saved / goal.target) * 100));
  el.innerHTML = `
    <div class="goal-top">
      <strong></strong>
      <span class="muted">${percent}%</span>
      <button class="item-delete" aria-label="Удалить копилку">✕</button>
    </div>
    <div class="goal-sums">
      <span class="goal-saved"></span>
      <span class="muted goal-target"></span>
    </div>
    <div class="progress"><div class="progress-bar" style="width: ${percent}%"></div></div>
    <div class="goal-bottom">
      <small class="muted goal-forecast"></small>
      <button class="add-small goal-add">+ Пополнить</button>
    </div>
  `;
  el.querySelector('strong').textContent = '🎯 ' + goal.title;
  el.querySelector('.goal-saved').textContent = formatMoney(goal.saved);
  el.querySelector('.goal-target').textContent = 'из ' + formatMoney(goal.target);
  el.querySelector('.goal-forecast').textContent = goalForecast(goal);

  el.querySelector('.goal-add').onclick = () => {
    const input = prompt(`Сколько отложить в «${goal.title}», ₽?`);
    if (input === null) return;
    const amount = parseAmount(input);
    if (!(amount > 0)) {
      alert('Введите сумму больше нуля');
      return;
    }
    goal.saved = Math.round((goal.saved + amount) * 100) / 100;
    goal.deposits = goal.deposits || [];
    goal.deposits.push({ date: today(), amount });
    save();
    renderAll();
  };

  el.querySelector('.item-delete').onclick = () => {
    if (confirm(`Удалить копилку «${goal.title}»?`)) {
      goals = goals.filter((x) => x.id !== goal.id);
      save();
      renderAll();
    }
  };
  return el;
}

// ===== 7. Экран «Обзор» =====
function renderHome() {
  $('todayLabel').textContent = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  $('balance').textContent = formatMoney(sumOf(transactions, 'income') - sumOf(transactions, 'expense'));

  const month = monthKey(today());
  const monthTransactions = transactions.filter((t) => monthKey(t.date) === month);
  $('monthIncome').textContent = formatMoney(sumOf(monthTransactions, 'income'));
  $('monthExpense').textContent = formatMoney(sumOf(monthTransactions, 'expense'));

  // Ближайшие платежи: неоплаченные за прошлую неделю и следующие 30 дней
  const upcoming = $('upcomingList');
  upcoming.innerHTML = '';
  const nextEvents = getOccurrences(addDays(today(), -7), addDays(today(), 30))
    .filter((o) => !o.paid)
    .slice(0, 3);
  if (nextEvents.length) {
    nextEvents.forEach((o) => upcoming.appendChild(eventItem(o)));
  } else {
    upcoming.appendChild(emptyBlock('Ближайших платежей нет. Добавьте их в разделе «Календарь».'));
  }

  // Копилки
  const goalsBox = $('goalsList');
  goalsBox.innerHTML = '';
  if (goals.length) {
    goals.forEach((g) => goalsBox.appendChild(goalItem(g)));
  } else {
    goalsBox.appendChild(emptyBlock('Создайте копилку, например «Отпуск» или «Новый телефон».'));
  }

  // Последние операции
  const recent = $('recentList');
  recent.innerHTML = '';
  const lastFive = sortedTransactions().slice(0, 5);
  if (lastFive.length) {
    lastFive.forEach((t) => recent.appendChild(transactionItem(t)));
  } else {
    recent.appendChild(emptyBlock('Пока нет операций. Нажмите «+», чтобы добавить первую.'));
  }
}

// ===== 8. Экран «История» =====
let historyFilter = 'all';
let historyMonth = 'all';
let historySearch = '';

function renderMonthFilter() {
  const months = [...new Set(transactions.map((t) => monthKey(t.date)))].sort().reverse();
  if (historyMonth !== 'all' && !months.includes(historyMonth)) historyMonth = 'all';
  $('monthFilter').innerHTML =
    '<option value="all">📅 Все месяцы</option>' +
    months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  $('monthFilter').value = historyMonth;
}

function renderHistory() {
  renderMonthFilter();

  const query = historySearch.trim().toLowerCase();
  const list = sortedTransactions().filter((t) =>
    (historyFilter === 'all' || t.type === historyFilter) &&
    (historyMonth === 'all' || monthKey(t.date) === historyMonth) &&
    (!query || t.title.toLowerCase().includes(query) || t.category.toLowerCase().includes(query))
  );

  $('historySummary').textContent = list.length
    ? `Найдено: ${list.length} · расходы ${formatMoney(sumOf(list, 'expense'))} · доходы ${formatMoney(sumOf(list, 'income'))}`
    : '';

  const box = $('historyList');
  box.innerHTML = '';
  if (!list.length) {
    box.appendChild(emptyBlock(transactions.length ? 'Ничего не найдено.' : 'Здесь появятся ваши операции.'));
    return;
  }

  // Группируем по дням
  let currentDay = null;
  let group = null;
  list.forEach((t) => {
    if (t.date !== currentDay) {
      currentDay = t.date;
      const title = document.createElement('p');
      title.className = 'day-title';
      title.textContent = dayLabel(t.date);
      box.appendChild(title);
      group = document.createElement('div');
      group.className = 'list';
      box.appendChild(group);
    }
    group.appendChild(transactionItem(t));
  });
}

// ===== 9. Экран «Аналитика» =====
let statsMonth = monthKey(today());

const expensesOf = (month) =>
  transactions.filter((t) => t.type === 'expense' && monthKey(t.date) === month);

function totalsByCategory(list) {
  const result = {};
  list.forEach((t) => {
    result[t.category] = (result[t.category] || 0) + t.amount;
  });
  return result;
}

// Круговая диаграмма из кружков SVG
function drawDonut(entries, total) {
  const r = 48;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  let html = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--line)" stroke-width="16"/>`;

  if (total > 0) {
    entries.forEach(([category, amount]) => {
      const length = (amount / total) * circumference;
      html += `<circle cx="60" cy="60" r="${r}" fill="none"
        stroke="${CATEGORY_COLORS[category] || '#adb5bd'}" stroke-width="16"
        stroke-dasharray="${length} ${circumference - length}"
        stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
      offset += length;
    });
  }
  $('donut').innerHTML = html;
}

function renderStats() {
  $('statsMonthTitle').textContent = monthLabel(statsMonth);

  const previous = shiftMonth(statsMonth, -1);
  const expenses = expensesOf(statsMonth);
  const previousExpenses = expensesOf(previous);
  const total = sumOf(expenses, 'expense');
  const previousTotal = sumOf(previousExpenses, 'expense');

  $('donutTotal').textContent = formatMoney(total);

  // Сравнение с прошлым месяцем
  const compare = $('compareLine');
  const previousName = MONTHS_IN[Number(previous.slice(5)) - 1];
  compare.className = 'compare';
  if (total && previousTotal) {
    const diff = Math.round(((total - previousTotal) / previousTotal) * 100);
    if (diff === 0) {
      compare.textContent = `Потрачено столько же, сколько в ${previousName}`;
    } else {
      compare.textContent = `На ${Math.abs(diff)}% ${diff < 0 ? 'меньше' : 'больше'}, чем в ${previousName}`;
      compare.classList.add(diff < 0 ? 'good' : 'bad');
    }
  } else {
    compare.textContent = total ? `В ${previousName} расходов не было` : 'В этом месяце расходов нет';
  }

  // Диаграмма и легенда
  const byCategory = totalsByCategory(expenses);
  const previousByCategory = totalsByCategory(previousExpenses);
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  drawDonut(entries, total);

  const legend = $('categoryLegend');
  legend.innerHTML = '';
  entries.forEach(([category, amount]) => {
    const row = document.createElement('div');
    row.className = 'legend-row';

    const before = previousByCategory[category];
    let compareText = 'новое';
    let compareClass = '';
    if (before) {
      const diff = Math.round(((amount - before) / before) * 100);
      compareText = diff === 0 ? 'как раньше' : `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)}%`;
      compareClass = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
    }

    row.innerHTML = `
      <span class="legend-dot" style="background: ${CATEGORY_COLORS[category] || '#adb5bd'}"></span>
      <span class="legend-name">${CATEGORY_ICONS[category] || '📦'} ${category}</span>
      <span class="legend-values">
        <strong>${formatMoney(amount)}</strong>
        <small>${Math.round((amount / total) * 100)}% · <span class="${compareClass}">${compareText}</span></small>
      </span>
    `;
    legend.appendChild(row);
  });

  renderBars();
  renderBudgets();
}

// Столбики за 6 месяцев
function renderBars() {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(statsMonth, -i));

  const data = months.map((m) => {
    const list = transactions.filter((t) => monthKey(t.date) === m);
    return { month: m, income: sumOf(list, 'income'), expense: sumOf(list, 'expense') };
  });
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));

  const box = $('barChart');
  box.innerHTML = data.map((d) => `
    <div class="bar-col ${d.month === statsMonth ? 'current' : ''}">
      <div class="bar-pair">
        <div class="bar inc" style="height: ${(d.income / max) * 100}%"></div>
        <div class="bar exp" style="height: ${(d.expense / max) * 100}%"></div>
      </div>
      <span>${MONTHS_SHORT[Number(d.month.slice(5)) - 1]}</span>
    </div>
  `).join('');

  // Нажатие на столбик — открыть этот месяц
  box.querySelectorAll('.bar-col').forEach((col, i) => {
    col.onclick = () => {
      statsMonth = data[i].month;
      renderStats();
    };
  });
}

// Бюджеты
function renderBudgets() {
  const box = $('budgetsList');
  box.innerHTML = '';
  if (!budgets.length) {
    box.appendChild(emptyBlock('Задайте лимит на категорию, например 15 000 ₽ на еду в месяц.'));
    return;
  }

  const byCategory = totalsByCategory(expensesOf(statsMonth));
  budgets.forEach((budget) => {
    const spent = byCategory[budget.category] || 0;
    const percent = Math.round((spent / budget.limit) * 100);
    const level = percent >= 100 ? 'over' : percent >= 80 ? 'warn' : 'ok';
    const left = budget.limit - spent;

    const el = document.createElement('div');
    el.className = 'budget';
    el.innerHTML = `
      <div class="budget-top">
        <span>${CATEGORY_ICONS[budget.category] || '📦'}</span>
        <strong>${budget.category}</strong>
        <span class="muted">${formatMoney(spent)} из ${formatMoney(budget.limit)}</span>
        <button class="item-delete" aria-label="Удалить бюджет">✕</button>
      </div>
      <div class="progress"><div class="progress-bar ${level}" style="width: ${Math.min(100, percent)}%"></div></div>
      <div class="budget-bottom">
        <span>${percent}%</span>
        <span class="${left < 0 ? 'over-text' : ''}">
          ${left < 0 ? 'Превышено на ' + formatMoney(-left) : 'Осталось ' + formatMoney(left)}
        </span>
      </div>
    `;
    el.onclick = () => openBudgetSheet(budget);
    el.querySelector('.item-delete').onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Удалить бюджет «${budget.category}»?`)) {
        budgets = budgets.filter((b) => b.category !== budget.category);
        save();
        renderAll();
      }
    };
    box.appendChild(el);
  });
}

function openBudgetSheet(budget = null) {
  $('budgetForm').reset();
  if (budget) {
    $('budgetCategory').value = budget.category;
    $('budgetLimit').value = budget.limit;
  }
  $('budgetSheet').hidden = false;
}

// ===== 10. Экран «Календарь» =====
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedDate = null;

function renderCalendar() {
  const first = new Date(calYear, calMonth, 1);
  $('monthTitle').textContent = `${MONTHS[calMonth]} ${calYear}`;

  const total = daysInMonth(calYear, calMonth);
  const occurrences = getOccurrences(toISO(first), toISO(new Date(calYear, calMonth, total)));

  // Сетка дней
  const grid = $('calGrid');
  grid.innerHTML = '';
  const offset = (first.getDay() + 6) % 7; // неделя начинается с понедельника
  for (let i = 0; i < offset; i++) grid.appendChild(document.createElement('span'));

  for (let day = 1; day <= total; day++) {
    const date = toISO(new Date(calYear, calMonth, day));
    const dayEvents = occurrences.filter((o) => o.date === date);

    const button = document.createElement('button');
    button.className = 'cal-day';
    if (date === today()) button.classList.add('today');
    if (date === selectedDate) button.classList.add('selected');
    button.innerHTML = `
      <span>${day}</span>
      <span class="dots">${dayEvents.slice(0, 3).map((o) => `<i class="dot ${o.event.type}"></i>`).join('')}</span>
    `;
    button.onclick = () => {
      selectedDate = selectedDate === date ? null : date;
      renderCalendar();
    };
    grid.appendChild(button);
  }

  // Список событий под календарём
  const list = $('eventsList');
  list.innerHTML = '';
  const shown = selectedDate ? occurrences.filter((o) => o.date === selectedDate) : occurrences;
  $('eventsTitle').textContent = selectedDate ? `На ${formatDay(selectedDate)}` : 'События месяца';

  if (shown.length) {
    shown.forEach((o) => list.appendChild(eventItem(o)));
  } else if (events.length) {
    list.appendChild(emptyBlock('В этот период событий нет.'));
  } else {
    list.appendChild(emptyBlock('Добавьте зарплату, квартплату и другие регулярные платежи кнопкой «+ Событие».'));
  }
}

function renderAll() {
  renderHome();
  renderHistory();
  renderStats();
  renderCalendar();
}

// ===== 11. Навигация =====
function showTab(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.hidden = screen.id !== `screen-${name}`;
  });
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => showTab(tab.dataset.tab);
});
document.querySelectorAll('[data-go]').forEach((button) => {
  button.onclick = () => showTab(button.dataset.go);
});

// Фильтры истории
document.querySelectorAll('#historyFilter button').forEach((button) => {
  button.onclick = () => {
    historyFilter = button.dataset.filter;
    document.querySelectorAll('#historyFilter button').forEach((b) => {
      b.classList.toggle('active', b === button);
    });
    renderHistory();
  };
});
$('search').addEventListener('input', () => {
  historySearch = $('search').value;
  renderHistory();
});
$('monthFilter').addEventListener('change', () => {
  historyMonth = $('monthFilter').value;
  renderHistory();
});

// Переключение месяцев
$('statsPrev').onclick = () => { statsMonth = shiftMonth(statsMonth, -1); renderStats(); };
$('statsNext').onclick = () => { statsMonth = shiftMonth(statsMonth, 1); renderStats(); };

$('prevMonth').onclick = () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  selectedDate = null;
  renderCalendar();
};
$('nextMonth').onclick = () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  selectedDate = null;
  renderCalendar();
};

// ===== 12. Всплывающие окна и формы =====
document.querySelectorAll('.overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
  overlay.querySelectorAll('[data-close]').forEach((button) => {
    button.onclick = () => { overlay.hidden = true; };
  });
});

fillCategorySelect($('category'), CATEGORIES);
fillCategorySelect($('budgetCategory'), CATEGORIES.filter((c) => c !== 'Зарплата'));

// Операция
$('addTxBtn').onclick = () => openTxSheet();

$('title').addEventListener('input', () => {
  const category = guessCategory($('title').value);
  if (category !== 'Другое') $('category').value = category;
});

$('txForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const title = $('title').value.trim();
  const amount = Number($('amount').value);
  if (!title || !(amount > 0)) return;

  const data = {
    type: form.elements.type.value,
    title,
    amount: Math.round(amount * 100) / 100,
    category: $('category').value,
    date: $('date').value,
  };

  if (editingId) {
    const existing = transactions.find((t) => t.id === editingId);
    if (existing) Object.assign(existing, data);
  } else {
    transactions.push({ id: newId(), ...data });
  }

  save();
  renderAll();
  $('txSheet').hidden = true;
});

// Событие
$('addEventBtn').onclick = () => {
  $('eventForm').reset();
  $('eventDate').value = selectedDate || today();
  $('eventSheet').hidden = false;
};

$('eventForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const title = $('eventTitle').value.trim();
  if (!title) return;
  const amountValue = $('eventAmount').value;

  events.push({
    id: newId(),
    title,
    type: form.elements.eventType.value,
    amount: amountValue ? Math.round(Number(amountValue) * 100) / 100 : null,
    date: $('eventDate').value,
    repeat: $('eventRepeat').value,
    paid: {},
  });
  save();
  renderAll();
  $('eventSheet').hidden = true;
});

// Бюджет
$('addBudgetBtn').onclick = () => openBudgetSheet();

$('budgetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const category = $('budgetCategory').value;
  const limit = Number($('budgetLimit').value);
  if (!(limit > 0)) return;

  const existing = budgets.find((b) => b.category === category);
  if (existing) existing.limit = limit;
  else budgets.push({ category, limit });

  save();
  renderAll();
  $('budgetSheet').hidden = true;
});

// Копилка
$('addGoalBtn').onclick = () => {
  $('goalForm').reset();
  $('goalSheet').hidden = false;
};

$('goalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('goalTitle').value.trim();
  const target = Number($('goalTarget').value);
  const saved = Number($('goalSaved').value) || 0;
  if (!title || !(target > 0)) return;

  goals.push({ id: newId(), title, target, saved, created: today(), deposits: [] });
  save();
  renderAll();
  $('goalSheet').hidden = true;
});

// ===== 13. Настройки: резервная копия =====
$('settingsBtn').onclick = () => {
  $('importMessage').textContent = '';
  $('backupMessage').textContent = '';
  $('settingsSheet').hidden = false;
};

$('backupBtn').onclick = async () => {
  const data = {
    app: 'kopeyka',
    version: 1,
    created: new Date().toISOString(),
    transactions, events, budgets, goals,
  };
  const name = `kopeyka-backup-${today()}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

  // На айфоне открываем меню «Поделиться», чтобы сохранить файл в «Файлы»
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Резервная копия «Копейки»' });
      showMessage('backupMessage', 'Копия сохранена.', false);
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return; // пользователь закрыл меню
  }

  // На компьютере просто скачиваем файл
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  showMessage('backupMessage', 'Файл копии скачан.', false);
};

$('restoreFile').addEventListener('change', async () => {
  const input = $('restoreFile');
  const file = input.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.transactions)) throw new Error('wrong file');

    if (confirm('Текущие данные будут заменены данными из копии. Продолжить?')) {
      transactions = data.transactions;
      events = Array.isArray(data.events) ? data.events : [];
      budgets = Array.isArray(data.budgets) ? data.budgets : [];
      goals = Array.isArray(data.goals) ? data.goals : [];
      save();
      renderAll();
      showMessage('backupMessage', `Восстановлено операций: ${transactions.length}.`, false);
    }
  } catch {
    showMessage('backupMessage', 'Это не похоже на файл копии «Копейки».', true);
  }
  input.value = '';
});

// ===== 14. Настройки: демо-данные и очистка =====
const DEMO_EXPENSES = [
  ['Пятёрочка', 'Еда', 600, 3500],
  ['ВкусВилл', 'Еда', 500, 2500],
  ['Кофейня', 'Еда', 250, 650],
  ['Самокат', 'Еда', 900, 2800],
  ['Яндекс Такси', 'Транспорт', 300, 1100],
  ['Метро', 'Транспорт', 60, 120],
  ['АЗС Лукойл', 'Транспорт', 1500, 3000],
  ['Аптека', 'Здоровье', 200, 1500],
  ['Кино', 'Развлечения', 500, 1200],
  ['Подписка Кинопоиск', 'Развлечения', 299, 299],
  ['Wildberries', 'Покупки', 700, 4500],
  ['Ozon', 'Покупки', 500, 3500],
];

function fillDemo() {
  const now = new Date();

  for (let back = 2; back >= 0; back--) {
    const first = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const y = first.getFullYear();
    const m = first.getMonth();
    const lastDay = back === 0 ? now.getDate() : daysInMonth(y, m);

    const add = (day, type, title, category, amount) => {
      if (day > lastDay) return;
      transactions.push({
        id: newId(), type, title, category,
        amount: Math.round(amount),
        date: toISO(new Date(y, m, day)),
      });
    };

    add(10, 'income', 'Зарплата ООО «Ромашка»', 'Зарплата', 85000);
    add(25, 'income', 'Аванс', 'Зарплата', 40000);
    add(20, 'expense', 'Квартплата', 'Дом', 6500);
    add(15, 'expense', 'Интернет', 'Дом', 700);

    for (let i = 0; i < 22; i++) {
      const [title, category, min, max] = DEMO_EXPENSES[Math.floor(Math.random() * DEMO_EXPENSES.length)];
      const day = 1 + Math.floor(Math.random() * lastDay);
      add(day, 'expense', title, category, min + Math.random() * (max - min));
    }
  }

  // События календаря на текущий месяц
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = (day) => toISO(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
  const paidIfPassed = (day) => (now.getDate() >= day ? { [monthKey(today())]: true } : {});

  events.push(
    { id: newId(), title: 'Зарплата', type: 'income', amount: 85000, date: dayOfMonth(10), repeat: 'monthly', paid: paidIfPassed(10) },
    { id: newId(), title: 'Интернет', type: 'expense', amount: 700, date: dayOfMonth(15), repeat: 'monthly', paid: paidIfPassed(15) },
    { id: newId(), title: 'Квартплата', type: 'expense', amount: 6500, date: dayOfMonth(20), repeat: 'monthly', paid: paidIfPassed(20) },
    { id: newId(), title: 'Аванс', type: 'income', amount: 40000, date: dayOfMonth(25), repeat: 'monthly', paid: paidIfPassed(25) },
    { id: newId(), title: 'Страховка ОСАГО', type: 'expense', amount: 9000, date: addDays(today(), 12), repeat: 'yearly', paid: {} },
  );

  // Бюджеты (только если таких ещё нет)
  [['Еда', 15000], ['Транспорт', 5000], ['Развлечения', 3000]].forEach(([category, limit]) => {
    if (!budgets.some((b) => b.category === category)) budgets.push({ category, limit });
  });

  // Копилка
  goals.push({
    id: newId(),
    title: 'Отпуск',
    target: 120000,
    saved: 35000,
    created: addDays(today(), -60),
    deposits: [
      { date: addDays(today(), -30), amount: 10000 },
      { date: addDays(today(), -5), amount: 10000 },
    ],
  });

  save();
  renderAll();
}

$('demoBtn').onclick = () => {
  const hasData = transactions.length || events.length || goals.length;
  const question = hasData
    ? 'Добавить примерные данные к вашим? Убрать их можно только вместе со всеми данными.'
    : 'Заполнить приложение примерными данными?';
  if (!confirm(question)) return;
  fillDemo();
  $('settingsSheet').hidden = true;
  showTab('home');
};

$('clearBtn').onclick = () => {
  if (!confirm('Удалить все операции, события, бюджеты и копилки? Это нельзя отменить.')) return;
  transactions = [];
  events = [];
  budgets = [];
  goals = [];
  save();
  renderAll();
  $('settingsSheet').hidden = true;
};

// ===== 15. Импорт выписки =====

// Читаем файл: пробуем UTF-8, если текст «сломан» — русскую кодировку Windows
async function readFileText(file) {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.includes('\uFFFD')) {
    text = new TextDecoder('windows-1251').decode(buffer);
  }
  return text.replace(/^\uFEFF/, '');
}

// Разбираем CSV на строки и ячейки (с учётом кавычек)
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0];
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolons >= commas ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// "21.11.2026 14:05:00" или "2026-11-21" → "2026-11-21"
function parseDate(value) {
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

async function importStatement(file) {
  const text = await readFileText(file);
  const rows = parseCSV(text);

  // Ищем строку с заголовками (в ней есть «Дата» и «Сумма»/«Приход»/«Расход»)
  const headerIndex = rows.findIndex((r, i) =>
    i < 30 &&
    r.some((cell) => cell.toLowerCase().includes('дата')) &&
    r.some((cell) => /сумм|приход|расход|поступ|списан/i.test(cell))
  );
  if (headerIndex === -1) {
    showMessage('importMessage', 'Не нашёл в файле столбцы «Дата» и «Сумма». Проверьте, что это выписка в CSV.', true);
    return;
  }

  // Находим номера нужных столбцов по их названиям
  const headers = rows[headerIndex].map((h) => h.trim().toLowerCase());
  const find = (...names) => {
    for (const name of names) {
      const index = headers.findIndex((h) => h.includes(name));
      if (index !== -1) return index;
    }
    return -1;
  };
  const col = {
    date: find('дата операции', 'дата'),
    amount: find('сумма операции', 'сумма платежа', 'сумма'),
    income: find('приход', 'поступлен', 'зачислен'),
    expense: find('расход', 'списан'),
    type: find('тип операции', 'вид операции'),
    title: find('описание', 'назначение', 'контрагент', 'получатель', 'место', 'наименование'),
    bankCategory: find('категория'),
    status: find('статус'),
  };

  // Чтобы не добавить одну операцию дважды
  const existing = new Set(transactions.map((t) => `${t.date}|${t.amount}|${t.title}`));
  let added = 0;
  let duplicates = 0;
  let skipped = 0;

  rows.slice(headerIndex + 1).forEach((r) => {
    const cell = (index) => (index === -1 ? '' : (r[index] || '').trim());

    if (/failed|отклон|ошибк/i.test(cell(col.status))) { skipped++; return; }

    const date = parseDate(cell(col.date));
    if (!date) { skipped++; return; }

    let amount;
    let type;

    if (col.income !== -1 || col.expense !== -1) {
      // Выписка с отдельными столбцами «Приход» и «Расход»
      const income = parseAmount(cell(col.income));
      const expense = parseAmount(cell(col.expense));
      if (income > 0) { amount = income; type = 'income'; }
      else if (Math.abs(expense) > 0) { amount = Math.abs(expense); type = 'expense'; }
    } else {
      // Выписка с одним столбцом «Сумма»: минус — расход, плюс — доход
      const value = parseAmount(cell(col.amount));
      if (!value) { skipped++; return; }
      amount = Math.abs(value);
      type = value < 0 ? 'expense' : 'income';

      const typeText = cell(col.type).toLowerCase();
      if (/спис|расход|покупк|оплат/.test(typeText)) type = 'expense';
      else if (/зачисл|поступ|приход|пополн/.test(typeText)) type = 'income';
    }

    if (!(amount > 0)) { skipped++; return; }
    amount = Math.round(amount * 100) / 100;

    const title = cell(col.title) || cell(col.bankCategory) || 'Операция по карте';
    const key = `${date}|${amount}|${title}`;
    if (existing.has(key)) { duplicates++; return; }
    existing.add(key);

    transactions.push({
      id: newId(),
      type,
      title,
      amount,
      category: guessCategory(`${title} ${cell(col.bankCategory)}`),
      date,
    });
    added++;
  });

  save();
  renderAll();

  let message = `Добавлено операций: ${added}.`;
  if (duplicates) message += ` Уже были в приложении: ${duplicates}.`;
  if (skipped) message += ` Пропущено строк: ${skipped}.`;
  showMessage('importMessage', message, added === 0 && duplicates === 0);
}

$('importFile').addEventListener('change', async () => {
  const input = $('importFile');
  const file = input.files[0];
  if (!file) return;
  try {
    await importStatement(file);
  } catch (error) {
    showMessage('importMessage', 'Не удалось прочитать файл. Проверьте, что это CSV.', true);
  }
  input.value = ''; // чтобы можно было выбрать тот же файл ещё раз
});

// ===== 16. Запуск =====
renderAll();

// Обновляем экран, когда приложение снова открывают (например, на следующий день)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderAll();
});

// Офлайн-режим
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}