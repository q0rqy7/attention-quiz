/**
 * MindFocus Quiz Application
 * Modern attention & focus digital profiling quiz
 * Supports: Solo mode, Quizizz-style room lobby, Chart.js group analytics
 */

// ========================================================
// 1. Audio Engine (Procedural Web Audio API - Zero External Files)
// ========================================================
class SoundController {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('mindfocus_sound') !== 'false';
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playClick() {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.08);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch (e) {}
  }

  playChime() {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      [600, 900].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.1);
        gain.gain.setValueAtTime(0.2, t + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.1 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + idx * 0.1);
        osc.stop(t + idx * 0.1 + 0.2);
      });
    } catch(e) {}
  }

  playSuccess() {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.09);
        gain.gain.setValueAtTime(0.2, t + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.6);
      });
    } catch (e) {}
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('mindfocus_sound', this.enabled ? 'true' : 'false');
    if (this.enabled) {
      this.ensureContext();
      this.playChime();
    }
    return this.enabled;
  }
}

const sound = new SoundController();

// Unlock Web Audio Context on first interaction
document.addEventListener('pointerdown', () => {
  sound.ensureContext();
}, { once: true });

// BroadcastChannel for cross-tab realtime sync with Admin Dashboard
const roomChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mindfocus_room_sync') : null;

// ========================================================
// 2. Quiz Questions Dataset
// ========================================================
const QUIZ_QUESTIONS = [
  {
    id: 1,
    type: 'single',
    title: 'Последний раз, когда планировалось «глянуть одним глазком» в соцсеть, а в итоге листание заняло больше 10 минут — что изначально планировалось делать?',
    hint: 'Один вариант ответа',
    options: [
      { text: 'Учёба / работа / домашние задания', icon: 'book-open' },
      { text: 'Расслабиться перед сном', icon: 'moon' },
      { text: 'Ждать транспорт / стоять в очереди / сидеть в туалете', icon: 'hourglass' },
      { text: 'Делать дело, но застрять на трудном месте — «переключить мозг»', icon: 'zap-off' },
      { text: 'Другое', icon: 'compass' }
    ]
  },
  {
    id: 2,
    type: 'single',
    title: 'В момент, когда стало понятно, что «залип» — первая реакция была:',
    hint: 'Один вариант ответа',
    options: [
      { text: 'Раздражение: «опять убил время»', icon: 'frown' },
      { text: 'Безразличие: «да ладно, не срочно»', icon: 'meh' },
      { text: 'Быстро закрыть, но мысли остались на увиденном', icon: 'eye' },
      { text: 'Продолжить: раз нарушил правило — гулять так гулять', icon: 'flame' }
    ]
  },
  {
    id: 3,
    type: 'scale',
    min: 1,
    max: 5,
    category: 'fomo',
    title: 'Когда в соцсети видно, что друг «онлайн», но не отвечает — невольно возникает мысль: а вдруг было сказано что-то не то?',
    minLabel: 'Совсем не про меня',
    maxLabel: 'Точно про меня'
  },
  {
    id: 4,
    type: 'scale',
    min: 1,
    max: 5,
    category: 'fomo',
    title: 'Если какое-то время не заходить в соцсеть — появляется беспокойство, что пропущены смешные мемы или важный «движ» в чате.',
    minLabel: 'Совсем не про меня',
    maxLabel: 'Точно про меня'
  },
  {
    id: 5,
    type: 'scale',
    min: 1,
    max: 5,
    category: 'fomo',
    title: 'Часто кажется: у других в соцсетях жизнь насыщеннее, и если не смотреть — «отстаёшь».',
    minLabel: 'Совсем не про меня',
    maxLabel: 'Точно про меня'
  },
  {
    id: 6,
    type: 'scale',
    min: 1,
    max: 5,
    category: 'willpower',
    title: 'Умею сопротивляться соблазнам.',
    minLabel: 'Совсем не про меня',
    maxLabel: 'Точно про меня'
  },
  {
    id: 7,
    type: 'scale',
    min: 1,
    max: 5,
    category: 'impulse',
    title: 'Трудно избавляться от вредных привычек.',
    minLabel: 'Совсем не про меня',
    maxLabel: 'Точно про меня'
  },
  {
    id: 8,
    type: 'scale',
    min: 1,
    max: 5,
    category: 'impulse',
    title: 'Хотелось бы иметь больше силы воли.',
    minLabel: 'Совсем не про меня',
    maxLabel: 'Точно про меня'
  },
  {
    id: 9,
    type: 'scale',
    min: 1,
    max: 5,
    category: 'impulse',
    title: 'Часто действую импульсивно, не обдумав варианты.',
    minLabel: 'Совсем не про меня',
    maxLabel: 'Точно про меня'
  },
  {
    id: 10,
    type: 'scale',
    min: 1,
    max: 6,
    category: 'autopilot',
    title: 'Замечаю, что делаю что-то на автомате или думаю о другом, и прихожу в себя, только когда кто-то окликнет.',
    minLabel: 'Почти никогда',
    maxLabel: 'Почти всегда'
  },
  {
    id: 11,
    type: 'scale',
    min: 1,
    max: 6,
    category: 'autopilot',
    title: 'Листаю соцсеть, пальцы скользят, а голова пустая или думает о постороннем.',
    minLabel: 'Почти никогда',
    maxLabel: 'Почти всегда'
  },
  {
    id: 12,
    type: 'scale',
    min: 1,
    max: 6,
    category: 'autopilot',
    title: 'Машинально беру телефон и открываю соцсеть, когда ем / иду / моюсь.',
    minLabel: 'Почти никогда',
    maxLabel: 'Почти всегда'
  },
  {
    id: 13,
    type: 'single',
    title: 'Если бы пришлось удалить одну соцсеть на 7 дней — что, по-твоему, изменилось бы в внимании больше всего?',
    hint: 'Один вариант ответа',
    options: [
      { text: 'Стало бы невыносимо скучно, вообще не смог бы сосредоточиться на делах', icon: 'alert-triangle' },
      { text: 'Сначала было бы тяжело, но потом концентрация, возможно, улучшилась бы', icon: 'trending-up' },
      { text: 'Ничего бы не изменилось — и так мало листаю', icon: 'shield' },
      { text: 'Заходил бы через веб-версию / планшет тайком — меня не остановить', icon: 'lock' }
    ]
  }
];

// ========================================================
// 3. Archetypes / Diagnosis Definitions
// ========================================================
const DIAGNOSIS_DATA = {
  radar: {
    code: 'radar',
    title: 'Твой профиль: Тревожный радар',
    badge: '🔴 Тревожный радар',
    colorClass: 'text-rose-500 dark:text-rose-400',
    bgBorderClass: 'border-rose-500/40 bg-rose-500/10',
    accentColor: '#ef4444',
    diagnosis: 'Твоё внимание крадёт не сам телефон, а страх упустить что-то важное.',
    reason: 'Мозг воспринимает «не проверил» как угрозу. Ты открываешь соцсеть не чтобы отдохнуть, а чтобы убедиться, что всё в порядке.',
    recommendations: [
      { num: 1, text: 'Отключи галочки прочтения и статус «был(а) недавно» — меньше поводов для тревоги.' },
      { num: 2, text: 'Введи правило «одна проверка в час» по будильнику. Тревога учится ждать.' },
      { num: 3, text: 'Перед открытием чата спрашивай себя: «Я иду за конкретным ответом или просто проверяю, всё ли ок?»' }
    ]
  },
  brake: {
    code: 'brake',
    title: 'Твой профиль: Слабый тормоз',
    badge: '🟠 Слабый тормоз',
    colorClass: 'text-amber-500 dark:text-amber-400',
    bgBorderClass: 'border-amber-500/40 bg-amber-500/10',
    accentColor: '#f97316',
    diagnosis: 'Ты видишь проблему, но рука быстрее головы.',
    reason: 'Привычка срабатывает автоматически. Сила воли тут почти не работает, потому что решение принимается за долю секунды до того, как ты успеваешь подумать.',
    recommendations: [
      { num: 1, text: 'Убери иконку соцсети с главного экрана телефона (создай «трение»).' },
      { num: 2, text: 'Используй правило: «Если застрял в задаче — встаю и пью воду, а не беру телефон».' },
      { num: 3, text: 'Оставляй телефон на зарядке в другой комнате во время учёбы или работы.' }
    ]
  },
  autopilot: {
    code: 'autopilot',
    title: 'Твой профиль: Автопилот',
    badge: '🟡 Автопилот',
    colorClass: 'text-yellow-500 dark:text-yellow-400',
    bgBorderClass: 'border-yellow-500/40 bg-yellow-500/10',
    accentColor: '#eab308',
    diagnosis: 'Ты не зависишь от контента — ты просто не замечаешь момента, когда рука тянется к телефону.',
    reason: 'Действие отработано до автоматизма. Сознание подключается уже тогда, когда ты листаешь ленту.',
    recommendations: [
      { num: 1, text: 'Тренируй «стоп-паузу»: каждый раз, беря телефон, мысленно спрашивай «Зачем?».' },
      { num: 2, text: 'Один приём пищи в день — полностью без телефона.' },
      { num: 3, text: 'Раз в день смотри встроенную статистику «Экранное время» — это работает как будильник для осознанности.' }
    ]
  },
  mixed: {
    code: 'mixed',
    title: 'Твой профиль: Смешанный',
    badge: '🟢 Смешанный',
    colorClass: 'text-emerald-500 dark:text-emerald-400',
    bgBorderClass: 'border-emerald-500/40 bg-emerald-500/10',
    accentColor: '#10b981',
    diagnosis: 'У тебя неплохой контроль, но есть слабые зоны.',
    reason: 'Твой главный враг — не зависимость, а отсутствие четких правил. Ты залипаешь, когда сбивается привычный ритм.',
    recommendations: [
      { num: 1, text: 'Установи лимит экранного времени на 2 самые «залипательные» приложения.' },
      { num: 2, text: 'Определи для себя 1 час в день (например, за час до сна), когда телефон убирается в ящик.' },
      { num: 3, text: 'Создай визуальный триггер для работы: блокнот для записи внезапных мыслей, чтобы не лезть в телефон.' }
    ]
  }
};

// ========================================================
// 4. App State
// ========================================================
const state = {
  currentQuestionIndex: 0,
  answers: {},
  timerSeconds: 300,
  timerInterval: null,
  isFinished: false,
  studentName: '',
  roomPin: '',
  theme: localStorage.getItem('mindfocus_theme') || 'dark',
};

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const questionContainer = document.getElementById('question-container');
const prevBtn = document.getElementById('prev-question-btn');
const nextBtn = document.getElementById('next-question-btn');
const currentQNum = document.getElementById('current-question-num');
const progressPercent = document.getElementById('progress-percentage');
const progressBar = document.getElementById('quiz-progress-bar');
const timerContainer = document.getElementById('quiz-timer-container');
const timerDisplay = document.getElementById('timer-display');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const soundIcon = document.getElementById('sound-icon');
const startBtn = document.getElementById('start-quiz-btn');
const studentNameInput = document.getElementById('student-name-input');
const roomPinInput = document.getElementById('room-pin-input');
const headerRoomBadge = document.getElementById('header-room-badge');
const headerRoomText = document.getElementById('header-room-text');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Chart instance for Student Group Statistics
let studentChartInstance = null;
let currentStudentChartType = 'doughnut';

// ========================================================
// 5. Theme Initialization & Toggle
// ========================================================
function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('mindfocus_theme', theme);
  const html = document.documentElement;
  const themeIcon = document.getElementById('theme-icon');

  if (theme === 'dark') {
    html.classList.add('dark');
    if (themeIcon) themeIcon.className = 'w-4 h-4 text-amber-300';
  } else {
    html.classList.remove('dark');
    if (themeIcon) themeIcon.className = 'w-4 h-4 text-slate-700';
  }
  lucide.createIcons();
  if (studentChartInstance) renderStudentGroupChart();
}

themeToggleBtn.addEventListener('click', () => {
  sound.playClick();
  const newTheme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
});

soundToggleBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const isEnabled = sound.toggle();
  soundIcon.setAttribute('data-lucide', isEnabled ? 'volume-2' : 'volume-x');
  soundIcon.className = isEnabled ? 'w-4 h-4 text-slate-300' : 'w-4 h-4 text-rose-400';
  lucide.createIcons();
  showToast(isEnabled ? '🔊 Звуковые эффекты включены' : '🔇 Звуковые эффекты выключены');
});

// Check URL query parameters for room PIN
function parseUrlRoomPin() {
  const params = new URLSearchParams(window.location.search);
  const pin = params.get('pin');
  if (pin) {
    state.roomPin = pin.trim();
    if (roomPinInput) roomPinInput.value = state.roomPin;
    headerRoomBadge.classList.remove('hidden');
    headerRoomBadge.classList.add('flex');
    headerRoomText.textContent = `Комната: ${state.roomPin}`;
    const badge = document.getElementById('session-status-badge');
    if (badge) {
      badge.textContent = `Подключено: ${state.roomPin}`;
      badge.className = 'text-[11px] font-bold text-emerald-400';
    }
  }
}

// ========================================================
// 6. Timer Management (5 Minutes Countdown)
// ========================================================
function startTimer() {
  state.timerSeconds = 300;
  timerContainer.classList.remove('hidden');
  timerContainer.classList.add('flex');
  updateTimerDisplay();

  if (state.timerInterval) clearInterval(state.timerInterval);

  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();

    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      handleTimeExpired();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(Math.max(0, state.timerSeconds) / 60);
  const secs = Math.max(0, state.timerSeconds) % 60;
  timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (state.timerSeconds <= 30) {
    timerContainer.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-900/60 backdrop-blur-md text-xs font-mono font-semibold timer-danger';
  } else if (state.timerSeconds <= 60) {
    timerContainer.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-900/60 backdrop-blur-md text-xs font-mono font-semibold timer-warning';
  } else {
    timerContainer.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-700/60 bg-slate-900/60 backdrop-blur-md text-xs font-mono font-semibold text-slate-200';
  }
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function handleTimeExpired() {
  showToast('Время вышло! Формируем твой персональный разбор...');
  finishQuiz();
}

// ========================================================
// 7. Quiz Flow & Step Rendering
// ========================================================
function startQuiz() {
  sound.playClick();

  // Save student credentials
  state.studentName = (studentNameInput?.value.trim()) || 'Студент ' + Math.floor(10 + Math.random() * 90);
  state.roomPin = (roomPinInput?.value.trim().toUpperCase()) || state.roomPin || '582-104';

  welcomeScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');
  state.currentQuestionIndex = 0;
  state.answers = {};
  state.isFinished = false;

  headerRoomBadge.classList.remove('hidden');
  headerRoomBadge.classList.add('flex');
  headerRoomText.textContent = `Комната: ${state.roomPin}`;

  // Broadcast that student joined the room (for host lobby)
  broadcastStudentJoin();

  startTimer();
  renderQuestion(state.currentQuestionIndex);
}

function broadcastStudentJoin() {
  const joinData = {
    name: state.studentName,
    room: state.roomPin,
    status: 'answering',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  if (roomChannel) {
    roomChannel.postMessage({ type: 'STUDENT_JOINED', room: state.roomPin, participant: joinData });
  }
  const joinedKey = `mindfocus_joined_${state.roomPin}`;
  let joinedList = [];
  try { joinedList = JSON.parse(localStorage.getItem(joinedKey)) || []; } catch(e) { joinedList = []; }
  if (!joinedList.some(p => p.name === state.studentName)) {
    joinedList.push(joinData);
    localStorage.setItem(joinedKey, JSON.stringify(joinedList));
  }
}

function renderQuestion(index) {
  const q = QUIZ_QUESTIONS[index];
  const total = QUIZ_QUESTIONS.length;
  const currentNum = index + 1;
  const pct = Math.round((currentNum / total) * 100);

  currentQNum.textContent = currentNum;
  progressPercent.textContent = `${pct}%`;
  progressBar.style.width = `${pct}%`;
  prevBtn.disabled = index === 0;

  questionContainer.className = 'quiz-step-fade-in flex-1';

  let html = `
    <div class="mb-6">
      <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-800/60 text-slate-400 text-[11px] font-semibold mb-3 border border-slate-700/40">
        <i data-lucide="help-circle" class="w-3.5 h-3.5 text-indigo-400"></i>
        <span>Вопрос ${currentNum} из ${total}</span>
      </div>
      <h2 class="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
        ${q.title}
      </h2>
      ${q.hint ? `<p class="text-xs text-slate-400 mt-1.5 font-medium">${q.hint}</p>` : ''}
    </div>
  `;

  const savedAnswer = state.answers[q.id];

  if (q.type === 'single') {
    html += `<div class="space-y-3">`;
    q.options.forEach((opt, optIdx) => {
      const isSelected = savedAnswer === optIdx;
      html += `
        <button type="button" 
          onclick="handleSingleChoice(${q.id}, ${optIdx})"
          class="option-card w-full text-left p-4 rounded-2xl flex items-center justify-between gap-4 cursor-pointer ${isSelected ? 'selected' : ''}">
          <div class="flex items-center gap-3.5">
            <div class="opt-icon-box w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-slate-300 font-bold text-xs ${isSelected ? 'bg-indigo-600 text-white shadow-glow-indigo' : 'bg-slate-800/80 border border-slate-700/60'}">
              <i data-lucide="${opt.icon || 'circle'}" class="w-4 h-4"></i>
            </div>
            <span class="text-sm font-medium leading-relaxed">${opt.text}</span>
          </div>
          <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-400'}">
            ${isSelected ? '<div class="w-2 h-2 rounded-full bg-white"></div>' : ''}
          </div>
        </button>
      `;
    });
    html += `</div>`;
  } else if (q.type === 'scale') {
    html += `
      <div class="py-4">
        <div style="display: grid; grid-template-columns: repeat(${q.max}, minmax(0, 1fr)); gap: 0.5rem;" class="mb-4">
    `;
    for (let val = q.min; val <= q.max; val++) {
      const isSelected = savedAnswer === val;
      html += `
        <button type="button"
          onclick="handleScaleChoice(${q.id}, ${val})"
          class="scale-button h-14 sm:h-16 rounded-2xl flex flex-col items-center justify-center font-bold text-base sm:text-lg cursor-pointer ${isSelected ? 'selected' : ''}">
          <span>${val}</span>
        </button>
      `;
    }
    html += `
        </div>
        <div class="flex items-center justify-between text-xs font-medium text-slate-400 px-1 pt-1">
          <span class="flex items-center gap-1.5"><i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> ${q.min} — ${q.minLabel}</span>
          <span class="flex items-center gap-1.5">${q.max} — ${q.maxLabel} <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
        </div>
      </div>
    `;
  }

  questionContainer.innerHTML = html;
  lucide.createIcons();
  updateNextButtonState();
}

function updateNextButtonState() {
  const currentQ = QUIZ_QUESTIONS[state.currentQuestionIndex];
  const hasAnswer = state.answers[currentQ.id] !== undefined;
  nextBtn.disabled = !hasAnswer;

  const hint = document.getElementById('auto-advance-hint');
  if (hint) {
    hint.textContent = hasAnswer ? 'Ответ выбран • Нажмите «Далее»' : 'Выберите вариант';
    hint.className = hasAnswer ? 'text-[11px] text-indigo-400 font-semibold hidden sm:inline-block' : 'text-[11px] text-slate-400 hidden sm:inline-block';
  }

  const isLast = state.currentQuestionIndex === QUIZ_QUESTIONS.length - 1;
  nextBtn.innerHTML = isLast 
    ? `<span>Узнать диагноз</span> <i data-lucide="sparkles" class="w-4 h-4"></i>`
    : `<span>Далее</span> <i data-lucide="chevron-right" class="w-4 h-4"></i>`;
  lucide.createIcons();
}

// User explicitly clicks next — NO AUTO-ADVANCE!
window.handleSingleChoice = function(questionId, optionIndex) {
  sound.playClick();
  state.answers[questionId] = optionIndex;
  renderQuestion(state.currentQuestionIndex);
};

window.handleScaleChoice = function(questionId, value) {
  sound.playClick();
  state.answers[questionId] = value;
  renderQuestion(state.currentQuestionIndex);
};

function goToNextQuestion() {
  sound.playClick();
  if (state.currentQuestionIndex < QUIZ_QUESTIONS.length - 1) {
    state.currentQuestionIndex++;
    renderQuestion(state.currentQuestionIndex);
  } else {
    finishQuiz();
  }
}

function goToPrevQuestion() {
  sound.playClick();
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
    renderQuestion(state.currentQuestionIndex);
  }
}

nextBtn.addEventListener('click', goToNextQuestion);
prevBtn.addEventListener('click', goToPrevQuestion);
startBtn.addEventListener('click', startQuiz);

// ========================================================
// 8. Scoring & Diagnosis Algorithm
// ========================================================
function calculateResults() {
  const q3 = Number(state.answers[3]) || 1;
  const q4 = Number(state.answers[4]) || 1;
  const q5 = Number(state.answers[5]) || 1;
  const sumA = q3 + q4 + q5;
  const isHighA = sumA > 10;
  const pctA = Math.round((sumA / 15) * 100);

  const q7 = Number(state.answers[7]) || 1;
  const q8 = Number(state.answers[8]) || 1;
  const q9 = Number(state.answers[9]) || 1;
  const sumB = q7 + q8 + q9;
  const isHighB = sumB > 10;
  const pctB = Math.round((sumB / 15) * 100);

  const q10 = Number(state.answers[10]) || 1;
  const q11 = Number(state.answers[11]) || 1;
  const q12 = Number(state.answers[12]) || 1;
  const sumC = q10 + q11 + q12;
  const isHighC = sumC > 12;
  const pctC = Math.round((sumC / 18) * 100);

  let dominantProfileKey = 'mixed';
  const triggeredCount = (isHighA ? 1 : 0) + (isHighB ? 1 : 0) + (isHighC ? 1 : 0);

  if (triggeredCount === 0) {
    dominantProfileKey = 'mixed';
  } else if (triggeredCount === 1) {
    if (isHighA) dominantProfileKey = 'radar';
    else if (isHighB) dominantProfileKey = 'brake';
    else if (isHighC) dominantProfileKey = 'autopilot';
  } else {
    const scores = [
      { key: 'radar', pct: pctA, isHigh: isHighA },
      { key: 'brake', pct: pctB, isHigh: isHighB },
      { key: 'autopilot', pct: pctC, isHigh: isHighC }
    ].filter(s => s.isHigh);

    scores.sort((a, b) => b.pct - a.pct);
    dominantProfileKey = scores[0].key;
  }

  return {
    profile: DIAGNOSIS_DATA[dominantProfileKey],
    dominantKey: dominantProfileKey,
    metrics: {
      radar: { sum: sumA, max: 15, pct: pctA, isHigh: isHighA, label: 'Тревожный радар (FOMO)', color: 'bg-rose-500' },
      brake: { sum: sumB, max: 15, pct: pctB, isHigh: isHighB, label: 'Слабый тормоз (Импульсивность)', color: 'bg-amber-500' },
      autopilot: { sum: sumC, max: 18, pct: pctC, isHigh: isHighC, label: 'Автопилот (Машинальность)', color: 'bg-yellow-500' }
    },
    personalInsights: getPersonalInsights()
  };
}

function getPersonalInsights() {
  const q1Answer = state.answers[1] !== undefined ? QUIZ_QUESTIONS[0].options[state.answers[1]].text : 'Не указано';
  const q2Answer = state.answers[2] !== undefined ? QUIZ_QUESTIONS[1].options[state.answers[2]].text : 'Не указано';
  const q6Score = Number(state.answers[6]) || 3;
  const q13Answer = state.answers[13] !== undefined ? QUIZ_QUESTIONS[12].options[state.answers[13]].text : 'Не указано';

  let willpowerEvaluation = 'Умеренная';
  let willpowerComment = 'Твоя способность противостоять соблазнам находится на среднем уровне. Многое зависит от усталости в конце дня.';
  if (q6Score >= 4) {
    willpowerEvaluation = 'Высокая';
    willpowerComment = 'У тебя есть внутренний стержень самоконтроля. Главное — устранить автоматические внешние раздражители.';
  } else if (q6Score <= 2) {
    willpowerEvaluation = 'Уязвимая';
    willpowerComment = 'Полагаться только на силу воли неэффективно. Тебе необходима внешняя организация пространства без отвлекающих факторов.';
  }

  return {
    q1: q1Answer,
    q2: q2Answer,
    willpowerScore: q6Score,
    willpowerEvaluation,
    willpowerComment,
    q13: q13Answer
  };
}

// Broadcast and store student result into session
function submitStudentResult(results) {
  const submission = {
    name: state.studentName,
    room: state.roomPin,
    profileKey: results.dominantKey,
    fomo: results.metrics.radar.sum,
    impulse: results.metrics.brake.sum,
    autopilot: results.metrics.autopilot.sum,
    willpower: results.personalInsights.willpowerScore,
    trigger: results.personalInsights.q1,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  // 1. BroadcastChannel (instant live update to host admin tab)
  if (roomChannel) {
    roomChannel.postMessage({ type: 'NEW_SUBMISSION', room: state.roomPin, submission });
  }

  // 2. localStorage sync
  const key = `mindfocus_room_${state.roomPin}`;
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(key)) || [];
  } catch(e) {
    list = [];
  }
  list.unshift(submission);
  localStorage.setItem(key, JSON.stringify(list));

  // 3. Cloud Firebase sync if URL exists
  const fbUrl = localStorage.getItem('mindfocus_firebase_url');
  if (fbUrl) {
    fetch(`${fbUrl.replace(/\/$/, '')}/rooms/${state.roomPin}/submissions.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission)
    }).catch(() => {});
  }
}

// ========================================================
// 9. Render Final Screen (Diagnosis + Group Analytics)
// ========================================================
function finishQuiz() {
  stopTimer();
  timerContainer.classList.add('hidden');
  quizScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');

  sound.playSuccess();
  triggerCelebrationConfetti();

  const results = calculateResults();
  submitStudentResult(results);

  const profile = results.profile;
  const m = results.metrics;
  const insights = results.personalInsights;

  let recommendationsHtml = '';
  profile.recommendations.forEach(rec => {
    recommendationsHtml += `
      <div class="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50">
        <div class="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
          ${rec.num}
        </div>
        <p class="text-xs sm:text-sm text-slate-200 leading-relaxed">${rec.text}</p>
      </div>
    `;
  });

  resultScreen.innerHTML = `
    <div class="space-y-6">
      
      <!-- Primary Profile Card -->
      <div class="glass-card rounded-3xl p-6 sm:p-10 border shadow-2xl relative overflow-hidden ${profile.bgBorderClass}">
        
        <div class="flex items-center justify-between gap-3 mb-4">
          <span class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border ${profile.bgBorderClass}">
            <span class="w-2 h-2 rounded-full animate-pulse" style="background-color: ${profile.accentColor}"></span>
            ${profile.badge}
          </span>
          <span class="text-xs text-slate-400 font-medium">Для: <strong class="text-indigo-400">${state.studentName}</strong></span>
        </div>

        <h2 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">
          ${profile.title}
        </h2>

        <!-- Diagnosis Box -->
        <div class="p-4 sm:p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 mb-5">
          <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
            <i data-lucide="activity" class="w-4 h-4 text-indigo-400"></i>
            <span>Диагноз:</span>
          </div>
          <p class="text-base sm:text-lg font-bold text-slate-100 leading-snug">
            ${profile.diagnosis}
          </p>
        </div>

        <!-- Reason -->
        <div class="mb-6">
          <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
            <i data-lucide="help-circle" class="w-4 h-4 text-indigo-400"></i>
            <span>Почему так происходит:</span>
          </div>
          <p class="text-sm text-slate-300 leading-relaxed">
            ${profile.reason}
          </p>
        </div>

        <!-- Recommendations -->
        <div>
          <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>
            <span>Рекомендации (3 конкретных шага):</span>
          </div>
          <div class="space-y-2.5">
            ${recommendationsHtml}
          </div>
        </div>

      </div>

      <!-- Radar / Multi-Metric Breakdown Card -->
      <div class="glass-card rounded-3xl p-6 sm:p-8 border border-slate-800/80 shadow-xl">
        <div class="flex items-center gap-2 text-sm font-bold text-slate-200 mb-4">
          <i data-lucide="bar-chart-3" class="w-4 h-4 text-indigo-400"></i>
          <span>Твои индивидуальные шкалы внимания:</span>
        </div>

        <div class="space-y-4">
          <div>
            <div class="flex justify-between text-xs font-semibold mb-1.5">
              <span class="text-slate-300 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-rose-500"></span> ${m.radar.label}
              </span>
              <span class="font-mono text-slate-400">${m.radar.sum} / ${m.radar.max} (${m.radar.pct}%)</span>
            </div>
            <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full rounded-full bg-rose-500 transition-all duration-1000" style="width: ${m.radar.pct}%"></div>
            </div>
          </div>

          <div>
            <div class="flex justify-between text-xs font-semibold mb-1.5">
              <span class="text-slate-300 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-amber-500"></span> ${m.brake.label}
              </span>
              <span class="font-mono text-slate-400">${m.brake.sum} / ${m.brake.max} (${m.brake.pct}%)</span>
            </div>
            <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full rounded-full bg-amber-500 transition-all duration-1000" style="width: ${m.brake.pct}%"></div>
            </div>
          </div>

          <div>
            <div class="flex justify-between text-xs font-semibold mb-1.5">
              <span class="text-slate-300 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-yellow-500"></span> ${m.autopilot.label}
              </span>
              <span class="font-mono text-slate-400">${m.autopilot.sum} / ${m.autopilot.max} (${m.autopilot.pct}%)</span>
            </div>
            <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full rounded-full bg-yellow-500 transition-all duration-1000" style="width: ${m.autopilot.pct}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- GROUP STATISTICS & LIVE CHARTS CARD -->
      <div class="glass-card rounded-3xl p-6 sm:p-8 border shadow-xl">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <div class="flex items-center gap-2 text-sm font-bold text-white">
              <i data-lucide="users" class="w-4 h-4 text-indigo-400"></i>
              <span>Результаты группы / аудитории</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Live
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">Сессия комнаты: <strong class="text-indigo-400">${state.roomPin}</strong></p>
          </div>

          <!-- Chart Type Pills -->
          <div class="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-800/40 border border-slate-700/60 text-xs">
            <button type="button" onclick="setStudentChartType('doughnut')" id="res-chart-pill-doughnut" class="chart-type-pill active px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <i data-lucide="pie-chart" class="w-3.5 h-3.5"></i>
              <span>Круговая</span>
            </button>
            <button type="button" onclick="setStudentChartType('bar')" id="res-chart-pill-bar" class="chart-type-pill px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i>
              <span>Столбчатая</span>
            </button>
            <button type="button" onclick="setStudentChartType('radar')" id="res-chart-pill-radar" class="chart-type-pill px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <i data-lucide="target" class="w-3.5 h-3.5"></i>
              <span>Радар</span>
            </button>
          </div>
        </div>

        <!-- Canvas -->
        <div class="relative w-full h-64 sm:h-72 my-2 flex items-center justify-center">
          <canvas id="student-group-chart"></canvas>
        </div>

        <!-- Breakdown Badges -->
        <div id="student-group-breakdown" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-800/60">
          <!-- Rendered dynamically -->
        </div>
      </div>

      <!-- Personalized Trigger & Habit Insights (Questions 1, 2, 6, 13) -->
      <div class="glass-card rounded-3xl p-6 sm:p-8 border border-slate-800/80 shadow-xl">
        <div class="flex items-center gap-2 text-sm font-bold text-slate-200 mb-4">
          <i data-lucide="layers" class="w-4 h-4 text-cyan-400"></i>
          <span>Твои индивидуальные триггеры и привычки:</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div class="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/40">
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Главный триггер входа (Вопрос 1)</div>
            <div class="text-xs font-medium text-slate-200">«${insights.q1}»</div>
          </div>

          <div class="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/40">
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Реакция на «залипание» (Вопрос 2)</div>
            <div class="text-xs font-medium text-slate-200">«${insights.q2}»</div>
          </div>

          <div class="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/40">
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Самооценка силы воли (${insights.willpowerScore} из 5)</div>
            <div class="text-xs font-medium text-slate-200">${insights.willpowerComment}</div>
          </div>

          <div class="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/40">
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Ожидание от 7-дневного детокса (Вопрос 13)</div>
            <div class="text-xs font-medium text-slate-200">«${insights.q13}»</div>
          </div>
        </div>
      </div>

      <!-- Interactive Actions: Native Share, Copy & Retake -->
      <div class="flex flex-col sm:flex-row items-center gap-3">
        <button id="native-share-btn" type="button"
          class="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold text-sm shadow-glow-indigo hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          <i data-lucide="share-2" class="w-4 h-4"></i>
          <span>Поделиться</span>
        </button>

        <button id="copy-result-btn" type="button"
          class="w-full sm:w-auto py-3.5 px-5 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-slate-200 hover:text-white font-bold text-sm hover:border-slate-500 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          <i data-lucide="copy" class="w-4 h-4"></i>
          <span>Скопировать результат и ссылку</span>
        </button>

        <button id="retake-quiz-btn" type="button"
          class="w-full sm:w-auto py-3.5 px-5 rounded-2xl border border-slate-700/80 bg-slate-900/40 text-slate-300 hover:text-white font-bold text-sm hover:border-slate-500 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
          <span>Заново</span>
        </button>
      </div>

    </div>
  `;

  lucide.createIcons();
  renderStudentGroupChart();

  // Attach event listeners
  document.getElementById('native-share-btn').addEventListener('click', () => {
    sound.playClick();
    handleNativeShare(results);
  });

  document.getElementById('copy-result-btn').addEventListener('click', () => {
    sound.playClick();
    copyResultToClipboard(results);
  });

  document.getElementById('retake-quiz-btn').addEventListener('click', () => {
    sound.playClick();
    retakeQuiz();
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================================================
// 10. Group Chart.js Controller on Result Screen
// ========================================================
window.setStudentChartType = function(type) {
  currentStudentChartType = type;
  document.querySelectorAll('#res-chart-pill-doughnut, #res-chart-pill-bar, #res-chart-pill-radar').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`res-chart-pill-${type}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderStudentGroupChart();
};

function renderStudentGroupChart() {
  const canvas = document.getElementById('student-group-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (studentChartInstance) studentChartInstance.destroy();

  const key = `mindfocus_room_${state.roomPin || '582-104'}`;
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(key)) || [];
  } catch(e) {
    list = [];
  }

  // If no submissions in room yet, show only current user's result
  if (list.length === 0) {
    const res = calculateResults();
    list = [{
      profileKey: res.dominantKey,
      fomo: res.metrics.radar.sum,
      impulse: res.metrics.brake.sum,
      autopilot: res.metrics.autopilot.sum,
      willpower: res.personalInsights.willpowerScore
    }];
  }

  const counts = { radar: 0, brake: 0, autopilot: 0, mixed: 0 };
  let totalFomo = 0, totalImp = 0, totalAuto = 0, totalWill = 0;

  list.forEach(s => {
    if (counts[s.profileKey] !== undefined) counts[s.profileKey]++;
    totalFomo += (s.fomo || 5);
    totalImp += (s.impulse || 5);
    totalAuto += (s.autopilot || 5);
    totalWill += (s.willpower || 3);
  });

  const total = list.length || 1;
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#cbd5e1' : '#1e293b';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  if (currentStudentChartType === 'doughnut') {
    studentChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Тревожный радар', 'Слабый тормоз', 'Автопилот', 'Смешанный'],
        datasets: [{
          data: [counts.radar, counts.brake, counts.autopilot, counts.mixed],
          backgroundColor: ['#ef4444', '#f97316', '#eab308', '#10b981'],
          borderWidth: 2,
          borderColor: isDark ? '#0f172a' : '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Plus Jakarta Sans', weight: '600', size: 11 } } },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw} чел. (${Math.round((c.raw/total)*100)}%)` } }
        },
        cutout: '62%'
      }
    });
  } else if (currentStudentChartType === 'bar') {
    studentChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Тревожный радар', 'Слабый тормоз', 'Автопилот', 'Смешанный'],
        datasets: [{
          label: 'Студенты',
          data: [counts.radar, counts.brake, counts.autopilot, counts.mixed],
          backgroundColor: ['#ef4444', '#f97316', '#eab308', '#10b981'],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 10 } }, grid: { display: false } },
          y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });
  } else if (currentStudentChartType === 'radar') {
    const avgFomo = Math.round((totalFomo / total / 15) * 100);
    const avgImp = Math.round((totalImp / total / 15) * 100);
    const avgAuto = Math.round((totalAuto / total / 18) * 100);
    const avgWill = Math.round((totalWill / total / 5) * 100);

    const myFomo = Math.round(((Number(state.answers[3]||1) + Number(state.answers[4]||1) + Number(state.answers[5]||1)) / 15) * 100);
    const myImp = Math.round(((Number(state.answers[7]||1) + Number(state.answers[8]||1) + Number(state.answers[9]||1)) / 15) * 100);
    const myAuto = Math.round(((Number(state.answers[10]||1) + Number(state.answers[11]||1) + Number(state.answers[12]||1)) / 18) * 100);
    const myWill = Math.round((Number(state.answers[6]||3) / 5) * 100);

    studentChartInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['FOMO', 'Импульсивность', 'Автопилот', 'Самоконтроль'],
        datasets: [
          {
            label: 'Твой результат (%)',
            data: [myFomo, myImp, myAuto, myWill],
            backgroundColor: 'rgba(99, 102, 241, 0.35)',
            borderColor: '#6366f1',
            pointBackgroundColor: '#818cf8',
            pointBorderColor: '#fff'
          },
          {
            label: 'Среднее по группе (%)',
            data: [avgFomo, avgImp, avgAuto, avgWill],
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderColor: '#10b981',
            pointBackgroundColor: '#34d399',
            pointBorderColor: '#fff'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { weight: '600' } } } },
        scales: {
          r: {
            angleLines: { color: gridColor },
            grid: { color: gridColor },
            pointLabels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 10, weight: 'bold' } },
            ticks: { display: false, beginAtZero: true, max: 100 }
          }
        }
      }
    });
  }

  const breakdownContainer = document.getElementById('student-group-breakdown');
  if (breakdownContainer) {
    breakdownContainer.innerHTML = `
      <div class="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center">
        <div class="text-[10px] font-bold text-rose-400">Радар</div>
        <div class="text-sm font-extrabold text-white">${counts.radar} <span class="text-[10px] font-normal text-rose-300">(${Math.round(counts.radar/total*100)}%)</span></div>
      </div>
      <div class="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
        <div class="text-[10px] font-bold text-amber-400">Тормоз</div>
        <div class="text-sm font-extrabold text-white">${counts.brake} <span class="text-[10px] font-normal text-amber-300">(${Math.round(counts.brake/total*100)}%)</span></div>
      </div>
      <div class="p-2.5 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-center">
        <div class="text-[10px] font-bold text-yellow-400">Автопилот</div>
        <div class="text-sm font-extrabold text-white">${counts.autopilot} <span class="text-[10px] font-normal text-yellow-300">(${Math.round(counts.autopilot/total*100)}%)</span></div>
      </div>
      <div class="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
        <div class="text-[10px] font-bold text-emerald-400">Смешанный</div>
        <div class="text-sm font-extrabold text-white">${counts.mixed} <span class="text-[10px] font-normal text-emerald-300">(${Math.round(counts.mixed/total*100)}%)</span></div>
      </div>
    `;
  }
}

// ========================================================
// 11. Share & Clipboard Functions
// ========================================================
function generateSummaryText(results) {
  const p = results.profile;
  const m = results.metrics;
  return `🧠 Тест: Кто управляет твоим вниманием?\n\n` +
    `Твой профиль: ${p.title}\n` +
    `💡 Диагноз: ${p.diagnosis}\n\n` +
    `📊 Выраженность зон:\n` +
    `• FOMO (страх упустить): ${m.radar.pct}%\n` +
    `• Импульсивность (слабый тормоз): ${m.brake.pct}%\n` +
    `• Автопилот (машинальность): ${m.autopilot.pct}%\n\n` +
    `Рекомендации:\n` +
    p.recommendations.map(r => `${r.num}. ${r.text}`).join('\n');
}

async function handleNativeShare(results) {
  const summary = generateSummaryText(results);
  const cleanUrl = window.location.href.split('?')[0].split('#')[0];
  const shareData = {
    title: 'Тест: Кто управляет твоим вниманием?',
    text: summary,
    url: `${cleanUrl}?pin=${state.roomPin}`
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      showToast('Вы успешно поделились результатом!');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  copyResultToClipboard(results);
}

function copyResultToClipboard(results) {
  const cleanUrl = window.location.href.split('?')[0].split('#')[0];
  const fullText = generateSummaryText(results) + `\n\n🔗 Пройти тест в группе: ${cleanUrl}?pin=${state.roomPin}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fullText).then(() => {
      showToast('Результат и ссылка скопированы в буфер обмена!');
    }).catch(() => {
      fallbackCopy(fullText);
    });
  } else {
    fallbackCopy(fullText);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('Результат и ссылка скопированы!');
  } catch (err) {
    showToast('Не удалось скопировать.');
  }
  document.body.removeChild(textarea);
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.remove('opacity-0', 'translate-y-24', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');

  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-24', 'pointer-events-none');
  }, 3500);
}

function retakeQuiz() {
  resultScreen.classList.add('hidden');
  welcomeScreen.classList.remove('hidden');
  state.currentQuestionIndex = 0;
  state.answers = {};
  stopTimer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function triggerCelebrationConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => {
      confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
    }, 250);
  }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  parseUrlRoomPin();
  if (soundIcon) {
    soundIcon.setAttribute('data-lucide', sound.enabled ? 'volume-2' : 'volume-x');
    soundIcon.className = sound.enabled ? 'w-4 h-4 text-slate-300' : 'w-4 h-4 text-rose-400';
  }
  lucide.createIcons();
});
