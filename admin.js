/**
 * MindFocus Admin & Host Dashboard
 * Manages room sessions, participant real-time results, Chart.js analytics & export
 * Pure real-time cross-device cloud sync: participants appear from ANY device!
 */

const AdminState = {
  isUnlocked: sessionStorage.getItem('mindfocus_admin_unlocked') === 'true',
  masterPassword: localStorage.getItem('mindfocus_admin_pass') || '1234',
  firebaseUrl: localStorage.getItem('mindfocus_firebase_url') || '',
  currentRoomPin: localStorage.getItem('mindfocus_current_room') || '582-104',
  chartType: 'doughnut',
  submissions: [],
  joinedParticipants: [],
  kickedStudents: [],
  chartInstance: null,
  theme: localStorage.getItem('mindfocus_theme') || 'dark',
};

// Clean up any legacy demo data from previous sessions
(function cleanLegacyDemo() {
  const pin = AdminState.currentRoomPin;
  const raw = localStorage.getItem(`mindfocus_room_${pin}`);
  if (raw && (raw.includes('Алихан Н.') || raw.includes('Диана С.'))) {
    localStorage.removeItem(`mindfocus_room_${pin}`);
  }
})();

// BroadcastChannel for instant local cross-tab sync
const roomChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mindfocus_room_sync') : null;
let activeEventSource = null;
let pollingInterval = null;

// DOM Elements
const lockScreen = document.getElementById('admin-lock-screen');
const dashboardView = document.getElementById('admin-dashboard-view');
const loginForm = document.getElementById('admin-login-form');
const passInput = document.getElementById('admin-pass-input');
const pinDisplay = document.getElementById('current-room-pin-display');
const copyJoinBtn = document.getElementById('copy-join-link-btn');
const newPinBtn = document.getElementById('generate-new-pin-btn');
const projectorBtn = document.getElementById('projector-mode-btn');
const lobbyCountText = document.getElementById('lobby-count-text');
const lobbyChips = document.getElementById('lobby-participants-chips');
const studentsTbody = document.getElementById('admin-students-tbody');
const searchInput = document.getElementById('student-search-input');
const exportCsvBtn = document.getElementById('export-csv-btn');
const clearSessionBtn = document.getElementById('clear-session-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const cloudBtn = document.getElementById('admin-cloud-btn');
const cloudModal = document.getElementById('cloud-modal');
const closeCloudModalBtn = document.getElementById('close-cloud-modal-btn');
const saveCloudSettingsBtn = document.getElementById('save-cloud-settings-btn');
const firebaseInput = document.getElementById('firebase-url-input');
const adminNewPassInput = document.getElementById('admin-new-pass-input');
const syncIndicator = document.getElementById('sync-mode-indicator');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Archetype styling constants
const ARCHETYPE_META = {
  radar: { title: 'Тревожный радар', color: '#ef4444', badgeClass: 'bg-rose-500/20 text-rose-400 border border-rose-500/30' },
  brake: { title: 'Слабый тормоз', color: '#f97316', badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  autopilot: { title: 'Автопилот', color: '#eab308', badgeClass: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
  mixed: { title: 'Смешанный', color: '#10b981', badgeClass: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' }
};

// ========================================================
// 1. Password Lock & Auth
// ========================================================
function checkAuth() {
  if (AdminState.isUnlocked) {
    lockScreen.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    initDashboard();
  } else {
    lockScreen.classList.remove('hidden');
    dashboardView.classList.add('hidden');
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const entered = passInput.value.trim();
  if (entered === AdminState.masterPassword) {
    AdminState.isUnlocked = true;
    sessionStorage.setItem('mindfocus_admin_unlocked', 'true');
    checkAuth();
  } else {
    showToast('Неверный пароль!');
    passInput.classList.add('border-rose-500');
    setTimeout(() => passInput.classList.remove('border-rose-500'), 2000);
  }
});

// ========================================================
// 2. Room & Session Management
// ========================================================
function setRoomPin(pin) {
  AdminState.currentRoomPin = pin;
  localStorage.setItem('mindfocus_current_room', pin);
  pinDisplay.textContent = pin;
  AdminState.submissions = [];
  AdminState.joinedParticipants = [];
  AdminState.kickedStudents = [];
  saveLocalSubmissions();
  saveJoinedParticipants();
  localStorage.setItem(`mindfocus_kicked_${pin}`, '[]');
  subscribeToCloudRoom(pin);
  renderAll();
}

function generateRandomPin() {
  const num1 = Math.floor(100 + Math.random() * 900);
  const num2 = Math.floor(100 + Math.random() * 900);
  return `${num1}-${num2}`;
}

newPinBtn.addEventListener('click', () => {
  const newPin = generateRandomPin();
  setRoomPin(newPin);
  showToast(`Создана новая сессия: PIN ${newPin}`);
});

copyJoinBtn.addEventListener('click', () => {
  const baseUrl = window.location.href.split('admin.html')[0];
  const joinUrl = `${baseUrl}index.html?pin=${AdminState.currentRoomPin}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(joinUrl).then(() => {
      showToast('Ссылка на подключение скопирована в буфер обмена!');
    });
  } else {
    showToast(`Ссылка: ${joinUrl}`);
  }
});

projectorBtn.addEventListener('click', () => {
  const doc = document.documentElement;
  if (!document.fullscreenElement) {
    doc.requestFullscreen ? doc.requestFullscreen() : null;
    showToast('Включен полноэкранный режим для проектора');
  } else {
    document.exitFullscreen ? document.exitFullscreen() : null;
  }
});

// ========================================================
// 3. Cross-Device Cloud Sync Engine (ntfy.sh & fallback)
// ========================================================
function getCloudTopic(pin) {
  return `mf_room_${pin.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function getStorageKey() {
  return `mindfocus_room_${AdminState.currentRoomPin}`;
}

function getJoinedKey() {
  return `mindfocus_joined_${AdminState.currentRoomPin}`;
}

function subscribeToCloudRoom(pin) {
  const topic = getCloudTopic(pin);
  syncIndicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block mr-1"></span> Режим: Live Cloud (Все устройства)`;

  // 1. Initial history fetch from cloud
  fetchCloudHistory(topic);

  // 2. Realtime Server-Sent Events (SSE) Stream
  if (activeEventSource) {
    activeEventSource.close();
  }

  try {
    const sse = new EventSource(`https://ntfy.sh/${topic}/sse`);
    sse.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data);
        if (item.event === 'message' && item.message) {
          const payload = JSON.parse(item.message);
          handleCloudMessage(payload);
        }
      } catch(e) {}
    };
    activeEventSource = sse;
  } catch(e) {}

  // 3. Periodic fallback poll every 4 seconds
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => {
    fetchCloudHistory(topic, false);
  }, 4000);
}

function fetchCloudHistory(topic, triggerToast = true) {
  fetch(`https://ntfy.sh/${topic}/json?poll=1`)
    .then(r => r.text())
    .then(text => {
      if (!text || !text.trim()) return;
      const lines = text.trim().split('\n');
      let newCount = 0;
      lines.forEach(line => {
        try {
          const item = JSON.parse(line);
          if (item.event === 'message' && item.message) {
            const payload = JSON.parse(item.message);
            if (handleCloudMessage(payload, false)) {
              newCount++;
            }
          }
        } catch(e) {}
      });
      if (newCount > 0) {
        saveLocalSubmissions();
        saveJoinedParticipants();
        renderAll();
      }
    })
    .catch(() => {});
}

function handleCloudMessage(payload, doRender = true) {
  if (!payload || !payload.type) return false;

  const rawName = (payload.name || '').trim();
  const lowerName = rawName.toLowerCase();

  // Handle kick event from any coordinator device
  if (payload.type === 'KICK_STUDENT') {
    if (lowerName && !AdminState.kickedStudents.includes(lowerName)) {
      AdminState.kickedStudents.push(lowerName);
      localStorage.setItem(`mindfocus_kicked_${AdminState.currentRoomPin}`, JSON.stringify(AdminState.kickedStudents));
    }
    AdminState.submissions = AdminState.submissions.filter(s => (s.name || '').toLowerCase() !== lowerName);
    AdminState.joinedParticipants = AdminState.joinedParticipants.filter(p => (p.name || '').toLowerCase() !== lowerName);
    if (doRender) {
      saveLocalSubmissions();
      saveJoinedParticipants();
      renderAll();
    }
    return true;
  }

  // If user was kicked, block them from re-entering/submitting
  if (AdminState.kickedStudents.includes(lowerName)) {
    return false;
  }

  let changed = false;

  if (payload.type === 'STUDENT_JOINED') {
    if (!AdminState.joinedParticipants.some(p => (p.name || '').toLowerCase() === lowerName)) {
      AdminState.joinedParticipants.push({
        name: rawName,
        status: 'answering',
        time: payload.time || ''
      });
      changed = true;
      if (doRender) {
        showToast(`Студент подключился: ${rawName}`);
        renderAll();
      }
    }
  } else if (payload.type === 'NEW_SUBMISSION') {
    // Check if already in submissions
    const existing = AdminState.submissions.find(s => (s.name || '').toLowerCase() === lowerName);
    if (!existing) {
      AdminState.submissions.unshift(payload);
      changed = true;

      // Update in joinedParticipants lobby
      const joinedItem = AdminState.joinedParticipants.find(p => (p.name || '').toLowerCase() === lowerName);
      if (joinedItem) {
        joinedItem.status = 'completed';
        joinedItem.profileKey = payload.profileKey;
      } else {
        AdminState.joinedParticipants.push({
          name: rawName,
          status: 'completed',
          profileKey: payload.profileKey,
          time: payload.time
        });
      }

      if (doRender) {
        showToast(`Сдал тест: ${rawName} (${ARCHETYPE_META[payload.profileKey]?.title || 'Смешанный'})`);
        renderAll();
      }
    }
  }

  return changed;
}

window.kickStudent = function(rawName) {
  const studentName = decodeURIComponent(rawName);
  if (!confirm(`Вы действительно хотите удалить участника "${studentName}" из этой сессии?`)) {
    return;
  }

  const lowerName = studentName.toLowerCase();
  if (!AdminState.kickedStudents.includes(lowerName)) {
    AdminState.kickedStudents.push(lowerName);
    localStorage.setItem(`mindfocus_kicked_${AdminState.currentRoomPin}`, JSON.stringify(AdminState.kickedStudents));
  }

  AdminState.submissions = AdminState.submissions.filter(s => (s.name || '').toLowerCase() !== lowerName);
  AdminState.joinedParticipants = AdminState.joinedParticipants.filter(p => (p.name || '').toLowerCase() !== lowerName);

  saveLocalSubmissions();
  saveJoinedParticipants();
  renderAll();

  const kickEvent = {
    type: 'KICK_STUDENT',
    name: studentName,
    room: AdminState.currentRoomPin,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  // 1. BroadcastChannel (same browser profiles)
  if (roomChannel) {
    try { roomChannel.postMessage(kickEvent); } catch(e) {}
  }

  // 2. Cloud ntfy.sh (cross-device push to students on smartphones/tablets)
  const topic = getCloudTopic(AdminState.currentRoomPin);
  fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    body: JSON.stringify(kickEvent),
    headers: { 'Title': 'Kick Student', 'Priority': '3' }
  }).catch(() => {});

  showToast(`Участник "${studentName}" удален из сессии`);
};

function loadLocalSubmissions() {
  const raw = localStorage.getItem(getStorageKey());
  if (raw) {
    try { AdminState.submissions = JSON.parse(raw) || []; } catch (e) { AdminState.submissions = []; }
  } else {
    AdminState.submissions = [];
  }

  const rawJoined = localStorage.getItem(getJoinedKey());
  if (rawJoined) {
    try { AdminState.joinedParticipants = JSON.parse(rawJoined) || []; } catch(e) { AdminState.joinedParticipants = []; }
  } else {
    AdminState.joinedParticipants = [];
  }

  const rawKicked = localStorage.getItem(`mindfocus_kicked_${AdminState.currentRoomPin}`);
  if (rawKicked) {
    try { AdminState.kickedStudents = JSON.parse(rawKicked) || []; } catch(e) { AdminState.kickedStudents = []; }
  } else {
    AdminState.kickedStudents = [];
  }
}

function saveLocalSubmissions() {
  localStorage.setItem(getStorageKey(), JSON.stringify(AdminState.submissions));
}

function saveJoinedParticipants() {
  localStorage.setItem(getJoinedKey(), JSON.stringify(AdminState.joinedParticipants));
}

// Local BroadcastChannel listener
if (roomChannel) {
  roomChannel.onmessage = (event) => {
    if (!event.data || event.data.room !== AdminState.currentRoomPin) return;
    handleCloudMessage(event.data, true);
  };
}

// ========================================================
// 4. Chart.js Controller
// ========================================================
window.setAdminChartType = function(type) {
  AdminState.chartType = type;
  document.querySelectorAll('.chart-type-pill').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`admin-chart-pill-${type}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderChart();
};

function renderChart() {
  const canvas = document.getElementById('admin-main-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (AdminState.chartInstance) {
    AdminState.chartInstance.destroy();
    AdminState.chartInstance = null;
  }

  const counts = { radar: 0, brake: 0, autopilot: 0, mixed: 0 };
  let totalFomo = 0, totalImpulse = 0, totalAuto = 0, totalWillpower = 0;

  AdminState.submissions.forEach(s => {
    if (counts[s.profileKey] !== undefined) counts[s.profileKey]++;
    totalFomo += (s.fomo || 5);
    totalImpulse += (s.impulse || 5);
    totalAuto += (s.autopilot || 5);
    totalWillpower += (s.willpower || 3);
  });

  const total = AdminState.submissions.length;
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#cbd5e1' : '#1e293b';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  if (total === 0) {
    AdminState.chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Ожидание подключений...'],
        datasets: [{
          data: [1],
          backgroundColor: [isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, font: { family: 'Plus Jakarta Sans', weight: '600' } }
          },
          tooltip: { enabled: false }
        },
        cutout: '68%'
      }
    });
    return;
  }

  if (AdminState.chartType === 'doughnut') {
    AdminState.chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Тревожный радар', 'Слабый тормоз', 'Автопилот', 'Смешанный'],
        datasets: [{
          data: [counts.radar, counts.brake, counts.autopilot, counts.mixed],
          backgroundColor: ['#ef4444', '#f97316', '#eab308', '#10b981'],
          borderWidth: 2,
          borderColor: isDark ? '#0f172a' : '#ffffff',
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, font: { family: 'Plus Jakarta Sans', weight: '600', size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw} чел. (${Math.round((ctx.raw / total) * 100)}%)`
            }
          }
        },
        cutout: '62%'
      }
    });
  } else if (AdminState.chartType === 'bar') {
    AdminState.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Тревожный радар', 'Слабый тормоз', 'Автопилот', 'Смешанный'],
        datasets: [{
          label: 'Количество студентов',
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
          x: { ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } }, grid: { display: false } },
          y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });
  } else if (AdminState.chartType === 'radar') {
    const avgFomo = Math.round((totalFomo / total / 15) * 100);
    const avgImp = Math.round((totalImpulse / total / 15) * 100);
    const avgAuto = Math.round((totalAuto / total / 18) * 100);
    const avgWill = Math.round((totalWillpower / total / 5) * 100);

    AdminState.chartInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['FOMO (Страх упустить)', 'Импульсивность', 'Автопилот', 'Самоконтроль'],
        datasets: [{
          label: 'Средний профиль группы (%)',
          data: [avgFomo, avgImp, avgAuto, avgWill],
          backgroundColor: 'rgba(99, 102, 241, 0.25)',
          borderColor: '#6366f1',
          pointBackgroundColor: '#818cf8',
          pointBorderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor, font: { weight: '600' } } } },
        scales: {
          r: {
            angleLines: { color: gridColor },
            grid: { color: gridColor },
            pointLabels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11, weight: 'bold' } },
            ticks: { display: false, beginAtZero: true, max: 100 }
          }
        }
      }
    });
  }
}

// ========================================================
// 5. Render Tables, Badges & Insights
// ========================================================
function renderAll() {
  const list = AdminState.submissions;
  const joined = AdminState.joinedParticipants;

  const totalCount = Math.max(list.length, joined.length);
  lobbyCountText.textContent = totalCount;

  // Render Lobby Chips
  if (joined.length === 0 && list.length === 0) {
    lobbyChips.innerHTML = `<span class="text-xs text-slate-400 italic">Ожидание подключений... Отправьте код комнаты ${AdminState.currentRoomPin} студентам!</span>`;
  } else {
    const displayList = joined.length > 0 ? joined : list;
    lobbyChips.innerHTML = displayList.map(p => {
      const encName = encodeURIComponent(p.name);
      if (p.status === 'completed' || p.profileKey) {
        const meta = ARCHETYPE_META[p.profileKey] || ARCHETYPE_META.mixed;
        return `
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs text-slate-200">
            <span class="w-2 h-2 rounded-full" style="background-color: ${meta.color}"></span>
            <span class="font-bold">${p.name}</span>
            <span class="text-[10px] text-slate-400">(${meta.title})</span>
            <button type="button" onclick="kickStudent('${encName}')" title="Удалить из сессии" class="ml-1 text-slate-400 hover:text-rose-400 p-0.5 rounded transition-colors inline-flex items-center justify-center">
              <i data-lucide="x" class="w-3 h-3"></i>
            </button>
          </div>
        `;
      } else {
        return `
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span class="font-bold">${p.name}</span>
            <span class="text-[10px] text-amber-400/80">(проходит...)</span>
            <button type="button" onclick="kickStudent('${encName}')" title="Удалить из сессии" class="ml-1 text-amber-400/70 hover:text-rose-400 p-0.5 rounded transition-colors inline-flex items-center justify-center">
              <i data-lucide="x" class="w-3 h-3"></i>
            </button>
          </div>
        `;
      }
    }).join('');
  }

  // Count Archetypes
  const counts = { radar: 0, brake: 0, autopilot: 0, mixed: 0 };
  let totalFomo = 0, totalImp = 0, totalAuto = 0;

  list.forEach(s => {
    if (counts[s.profileKey] !== undefined) counts[s.profileKey]++;
    totalFomo += (s.fomo || 5);
    totalImp += (s.impulse || 5);
    totalAuto += (s.autopilot || 5);
  });

  const total = list.length;

  // Archetype Badges under Chart
  document.getElementById('admin-archetype-badges').innerHTML = `
    <div class="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center">
      <div class="text-[11px] font-bold text-rose-400">Тревожный радар</div>
      <div class="text-lg font-extrabold text-white">${counts.radar} <span class="text-xs font-normal text-rose-300">(${total > 0 ? Math.round(counts.radar / total * 100) : 0}%)</span></div>
    </div>
    <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
      <div class="text-[11px] font-bold text-amber-400">Слабый тормоз</div>
      <div class="text-lg font-extrabold text-white">${counts.brake} <span class="text-xs font-normal text-amber-300">(${total > 0 ? Math.round(counts.brake / total * 100) : 0}%)</span></div>
    </div>
    <div class="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-center">
      <div class="text-[11px] font-bold text-yellow-400">Автопилот</div>
      <div class="text-lg font-extrabold text-white">${counts.autopilot} <span class="text-xs font-normal text-yellow-300">(${total > 0 ? Math.round(counts.autopilot / total * 100) : 0}%)</span></div>
    </div>
    <div class="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
      <div class="text-[11px] font-bold text-emerald-400">Смешанный</div>
      <div class="text-lg font-extrabold text-white">${counts.mixed} <span class="text-xs font-normal text-emerald-300">(${total > 0 ? Math.round(counts.mixed / total * 100) : 0}%)</span></div>
    </div>
  `;

  // Key University Insights
  if (total > 0) {
    const dominant = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    document.getElementById('insight-dominant-profile').textContent = `${ARCHETYPE_META[dominant].title} (${Math.round(counts[dominant] / total * 100)}%)`;
    document.getElementById('insight-avg-fomo').textContent = `${Math.round(totalFomo / total)} / 15 баллов`;
    document.getElementById('insight-avg-impulse').textContent = `${Math.round(totalImp / total)} / 15 баллов`;
    document.getElementById('insight-avg-autopilot').textContent = `${Math.round(totalAuto / total)} / 18 баллов`;
  } else {
    document.getElementById('insight-dominant-profile').textContent = 'Ожидание ответов...';
    document.getElementById('insight-avg-fomo').textContent = '—';
    document.getElementById('insight-avg-impulse').textContent = '—';
    document.getElementById('insight-avg-autopilot').textContent = '—';
  }

  // Render Table Rows
  renderStudentsTable();

  // Re-render Chart
  renderChart();
  lucide.createIcons();
}

function renderStudentsTable() {
  const query = (searchInput.value || '').toLowerCase().trim();
  const filtered = AdminState.submissions.filter(s => (s.name || '').toLowerCase().includes(query));

  if (filtered.length === 0) {
    studentsTbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-10 text-center text-slate-400 italic">
          Пока никто не сдал тест в этой сессии.<br>
          <span class="text-xs text-indigo-400 mt-1 inline-block">Отправьте студентам код <strong>${AdminState.currentRoomPin}</strong></span>
        </td>
      </tr>
    `;
    return;
  }

  studentsTbody.innerHTML = filtered.map((s, idx) => {
    const meta = ARCHETYPE_META[s.profileKey] || ARCHETYPE_META.mixed;
    const encName = encodeURIComponent(s.name);
    return `
      <tr class="hover:bg-slate-800/30 transition-colors">
        <td class="py-3 px-4 font-mono text-slate-400 font-bold">${idx + 1}</td>
        <td class="py-3 px-4 font-bold text-white">${s.name}</td>
        <td class="py-3 px-4">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${meta.badgeClass}">
            <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${meta.color}"></span>
            ${meta.title}
          </span>
        </td>
        <td class="py-3 px-4 font-mono">${s.fomo || '—'} / 15</td>
        <td class="py-3 px-4 font-mono">${s.impulse || '—'} / 15</td>
        <td class="py-3 px-4 font-mono">${s.autopilot || '—'} / 18</td>
        <td class="py-3 px-4 font-mono">${s.willpower || '—'} / 5</td>
        <td class="py-3 px-4 text-slate-400 text-[11px] max-w-xs truncate">${s.trigger || '—'}</td>
        <td class="py-3 px-4 font-mono text-slate-400 text-[11px]">${s.time || '—'}</td>
        <td class="py-3 px-4 text-center">
          <button type="button" onclick="kickStudent('${encName}')" title="Удалить из сессии"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-semibold border border-rose-500/30 transition-all hover:scale-105 active:scale-95">
            <i data-lucide="user-x" class="w-3.5 h-3.5"></i>
            <span>Выгнать</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

searchInput.addEventListener('input', renderStudentsTable);

// Clear Session
clearSessionBtn.addEventListener('click', () => {
  if (confirm(`Вы уверены, что хотите очистить результаты сессии ${AdminState.currentRoomPin}?`)) {
    AdminState.submissions = [];
    AdminState.joinedParticipants = [];
    AdminState.kickedStudents = [];
    saveLocalSubmissions();
    saveJoinedParticipants();
    localStorage.removeItem(`mindfocus_kicked_${AdminState.currentRoomPin}`);
    renderAll();
    showToast('Результаты сессии очищены');
  }
});

// CSV Export
exportCsvBtn.addEventListener('click', () => {
  if (AdminState.submissions.length === 0) {
    showToast('Нет данных для выгрузки. Дождитесь ответов студентов.');
    return;
  }

  let csv = "№,Имя студента,Архетип,FOMO (из 15),Импульсивность (из 15),Автопилот (из 18),Сила воли (из 5),Триггер входа,Время\n";
  AdminState.submissions.forEach((s, i) => {
    const meta = ARCHETYPE_META[s.profileKey] || ARCHETYPE_META.mixed;
    csv += `${i + 1},"${s.name}","${meta.title}",${s.fomo || 0},${s.impulse || 0},${s.autopilot || 0},${s.willpower || 0},"${s.trigger || ''}",${s.time || ''}\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mindfocus_group_${AdminState.currentRoomPin}_results.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Таблица успешно выгружена в CSV!');
});

// ========================================================
// 6. Cloud Settings Modal (Firebase / Supabase)
// ========================================================
cloudBtn.addEventListener('click', () => {
  firebaseInput.value = AdminState.firebaseUrl;
  adminNewPassInput.value = AdminState.masterPassword;
  cloudModal.classList.remove('hidden');
});

closeCloudModalBtn.addEventListener('click', () => {
  cloudModal.classList.add('hidden');
});

saveCloudSettingsBtn.addEventListener('click', () => {
  const url = firebaseInput.value.trim();
  const pass = adminNewPassInput.value.trim();

  AdminState.firebaseUrl = url;
  localStorage.setItem('mindfocus_firebase_url', url);

  if (pass) {
    AdminState.masterPassword = pass;
    localStorage.setItem('mindfocus_admin_pass', pass);
  }

  cloudModal.classList.add('hidden');
  showToast('Настройки сохранены');
  subscribeToCloudRoom(AdminState.currentRoomPin);
});

// Theme Toggle
themeToggleBtn.addEventListener('click', () => {
  const newTheme = AdminState.theme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
});

function applyTheme(theme) {
  AdminState.theme = theme;
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
  if (AdminState.chartInstance) renderChart();
}

function showToast(msg) {
  toastMessage.textContent = msg;
  toast.classList.remove('opacity-0', 'translate-y-24', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-24', 'pointer-events-none');
  }, 3500);
}

function initDashboard() {
  pinDisplay.textContent = AdminState.currentRoomPin;
  applyTheme(AdminState.theme);
  loadLocalSubmissions();
  subscribeToCloudRoom(AdminState.currentRoomPin);
  renderAll();
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(AdminState.theme);
  checkAuth();
  lucide.createIcons();
});
