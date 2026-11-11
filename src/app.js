'use strict';

const STORE_KEY = 'rollcall-siwes-v1';
const SESSION_KEY = 'rollcall-current-user';
const QR_LIFETIME_HOURS = 12;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let store;
let currentUser = null;
let authMode = 'signin';
let scanner = null;
let toastTimer;

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}
function makeToken() {
  const values = new Uint8Array(12);
  crypto.getRandomValues(values);
  return [...values].map(value => value.toString(16).padStart(2, '0')).join('');
}
function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}
function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && Array.isArray(saved.users) && Array.isArray(saved.sessions) && Array.isArray(saved.attendance)) return saved;
  } catch (error) {
    console.warn('Could not read the local demo data.', error);
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30);
  const todayExpired = new Date(startOfToday.getTime() + 12 * 60 * 60 * 1000);
  const previous = new Date(now.getTime() - 86400000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
  return {
    users: [],
    sessions: [
      { id: 'demo_session_today', title: 'SIWES project briefing', course: 'Industrial Training · 300L', startsAt: startOfToday.toISOString(), expiresAt: todayExpired.toISOString(), token: 'rollcall-demo-briefing', active: true, createdAt: startOfToday.toISOString() },
      { id: 'demo_session_yesterday', title: 'Workplace safety induction', course: 'Industrial Training · 300L', startsAt: new Date(previous.setHours(9, 0, 0, 0)).toISOString(), expiresAt: new Date(previous.getTime() + 12 * 3600000).toISOString(), token: 'rollcall-demo-safety', active: false, createdAt: new Date(previous.getTime() - 3600000).toISOString() },
      { id: 'demo_session_two_days', title: 'Weekly logbook review', course: 'Industrial Training · 300L', startsAt: new Date(twoDaysAgo.setHours(10, 0, 0, 0)).toISOString(), expiresAt: new Date(twoDaysAgo.getTime() + 12 * 3600000).toISOString(), token: 'rollcall-demo-logbook', active: false, createdAt: new Date(twoDaysAgo.getTime() - 3600000).toISOString() },
      { id: 'demo_session_future', title: 'Industry mentor check-in', course: 'Industrial Training · 300L', startsAt: new Date(now.getTime() + 86400000).toISOString(), expiresAt: new Date(now.getTime() + 86400000 + 12 * 3600000).toISOString(), token: 'rollcall-demo-mentor', active: true, createdAt: now.toISOString() }
    ],
    attendance: []
  };
}
async function passwordHash(password, salt) {
  if (!crypto.subtle) throw new Error('Secure browser crypto is unavailable. Open this app on localhost or in a modern browser.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(value => value.toString(16).padStart(2, '0')).join('');
}
function setAuthMode(mode) {
  authMode = mode;
  const signingIn = mode === 'signin';
  $('#signin-tab').classList.toggle('active', signingIn);
  $('#signup-tab').classList.toggle('active', !signingIn);
  $('#signin-tab').setAttribute('aria-selected', String(signingIn));
  $('#signup-tab').setAttribute('aria-selected', String(!signingIn));
  $('#name-field').hidden = signingIn;
  $('#auth-password').autocomplete = signingIn ? 'current-password' : 'new-password';
  $('#auth-eyebrow').textContent = signingIn ? 'WELCOME BACK' : 'GET STARTED';
  $('#auth-title').textContent = signingIn ? 'Sign in to your account' : 'Create your account';
  $('#auth-subtitle').textContent = signingIn ? 'Your attendance record, right where you left it.' : 'Join your SIWES attendance workspace.';
  $('#auth-submit').innerHTML = signingIn ? 'Sign in <span aria-hidden="true">→</span>' : 'Create account <span aria-hidden="true">→</span>';
  $('#auth-error').hidden = true;
}
function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
function showError(message) {
  const error = $('#auth-error');
  error.textContent = message;
  error.hidden = false;
}
function dateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: '' };
  return {
    date: new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' }).format(date)
  };
}
function updateTopbarMeta() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(now).toUpperCase();
  const time = new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(now);
  $('#today-date').textContent = date;
  $('#live-clock').textContent = `${time} local time`;
}
function isExpired(session) {
  return !session.active || new Date(session.expiresAt).getTime() <= Date.now();
}
function attended(sessionId, userId = currentUser.id) {
  return store.attendance.some(record => record.sessionId === sessionId && record.userId === userId);
}
function applicableSessions() {
  return store.sessions.filter(session => session.course === 'All students' || session.course.toLowerCase().includes('300l') || currentUser.role === 'admin');
}
function computedSummary() {
  const sessions = applicableSessions();
  const closed = sessions.filter(isExpired);
  const completed = closed.length;
  const present = closed.filter(session => attended(session.id)).length;
  return { total: completed, attended: present, missed: Math.max(0, completed - present), upcoming: sessions.filter(session => !isExpired(session)).length, rate: completed ? Math.round((present / completed) * 100) : 0 };
}
function renderApp() {
  const admin = currentUser.role === 'admin';
  $('#auth-screen').hidden = true;
  $('#app-shell').hidden = false;
  $('#user-name').textContent = currentUser.name;
  $('#greeting-name').textContent = currentUser.name.split(' ')[0];
  $('#user-role').textContent = admin ? 'Administrator' : 'Student · 300L';
  $('#role-chip').textContent = admin ? 'ADMINISTRATOR' : 'STUDENT';
  const initials = currentUser.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  $('#user-avatar').textContent = initials;
  $('#topbar-avatar').textContent = initials;
  $$('.admin-only').forEach(element => { element.hidden = !admin; });
  $('#history-filter').value = 'all';
  updateTopbarMeta();
  renderAll();
}
function renderAll() {
  renderOverview();
  renderHistory();
  renderSessions();
}
function renderOverview() {
  const summary = computedSummary();
  $('#metric-rate').innerHTML = `${summary.rate}<span>%</span>`;
  $('#rate-bar').style.width = `${summary.rate}%`;
  $('#metric-rate-caption').textContent = `${summary.attended} of ${summary.total} closed sessions`;
  $('#metric-attended').textContent = summary.attended;
  $('#metric-missed').textContent = summary.missed;
  $('#metric-upcoming').textContent = summary.upcoming;
  const openSessions = applicableSessions().filter(session => !isExpired(session)).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const next = openSessions[0];
  $('#next-session-title').textContent = next ? next.title : 'No session on the calendar';
  $('#next-session-meta').textContent = next ? `${next.course} · ${dateParts(next.startsAt).date} at ${dateParts(next.startsAt).time}` : 'Check back when an administrator schedules a class.';
  const latest = store.attendance.filter(record => record.userId === currentUser.id).map(record => ({ record, session: store.sessions.find(item => item.id === record.sessionId) })).filter(item => item.session).sort((a, b) => new Date(b.record.markedAt) - new Date(a.record.markedAt)).slice(0, 4);
  const closedMissed = applicableSessions().filter(session => isExpired(session) && !attended(session.id)).slice(0, Math.max(0, 4 - latest.length));
  const activity = [...latest.map(item => ({ session: item.session, markedAt: item.record.markedAt, status: 'attended' })), ...closedMissed.map(session => ({ session, markedAt: session.expiresAt, status: 'missed' }))].sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt)).slice(0, 4);
  $('#recent-activity').innerHTML = activity.length ? activity.map(item => {
    const stamp = dateParts(item.markedAt);
    const isPresent = item.status === 'attended';
    return `<div class="activity-row"><span class="activity-symbol ${isPresent ? '' : 'missed'}">${isPresent ? '✓' : '–'}</span><div class="activity-copy"><strong>${escapeHTML(item.session.title)}</strong><small>${escapeHTML(item.session.course)} · ${stamp.date}</small></div><span class="status-pill ${isPresent ? '' : 'missed'}">${isPresent ? 'Attended' : 'Missed'}</span></div>`;
  }).join('') : '<p class="empty-inline">No activity yet. Your check-ins will appear here.</p>';
  $('#upcoming-list').innerHTML = openSessions.length ? openSessions.slice(0, 4).map(session => {
    const stamp = dateParts(session.startsAt);
    const starts = new Date(session.startsAt);
    const isToday = starts.toDateString() === new Date().toDateString();
    return `<div class="upcoming-row"><div class="upcoming-copy"><strong>${escapeHTML(session.title)}</strong><small>${escapeHTML(session.course)} · ${isToday ? 'Today' : stamp.date}</small></div><span class="upcoming-time">${stamp.time}</span></div>`;
  }).join('') : '<p class="empty-inline">No open sessions right now.</p>';
}
function renderHistory() {
  const sessions = applicableSessions().slice().sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const records = sessions.map(session => ({ session, record: store.attendance.find(item => item.sessionId === session.id && item.userId === currentUser.id) })).filter(item => item.record || isExpired(item.session));
  const summary = computedSummary();
  $('#history-total').textContent = summary.total;
  $('#history-attended').textContent = summary.attended;
  $('#history-missed').textContent = summary.missed;
  const filter = $('#history-filter').value;
  const filtered = records.filter(({ session, record }) => filter === 'all' || (filter === 'attended' ? Boolean(record) : !record && isExpired(session)));
  $('#history-rows').innerHTML = filtered.map(({ session, record }) => {
    const stamp = dateParts(session.startsAt);
    const checkIn = record ? dateParts(record.markedAt).time : '—';
    const status = record ? '<span class="status-pill">Attended</span>' : '<span class="status-pill missed">Missed</span>';
    return `<tr><td><span class="record-name">${escapeHTML(session.title)}</span><span class="record-course">${escapeHTML(session.course)}</span></td><td>${stamp.date}</td><td>${checkIn}</td><td>${status}</td></tr>`;
  }).join('');
  $('#history-empty').hidden = filtered.length !== 0;
  $('.records-table').hidden = filtered.length === 0;
}
function renderSessions() {
  if (currentUser.role !== 'admin') return;
  const sessions = store.sessions.slice().sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const checkins = store.attendance.length;
  $('#admin-session-count').textContent = sessions.length;
  $('#admin-open-count').textContent = sessions.filter(session => !isExpired(session)).length;
  $('#admin-checkin-count').textContent = checkins;
  $('#admin-sessions-list').innerHTML = sessions.length ? sessions.map(session => {
    const stamp = dateParts(session.startsAt);
    const count = store.attendance.filter(record => record.sessionId === session.id).length;
    const status = isExpired(session) ? '<span class="status-pill closed">Closed</span>' : '<span class="status-pill open">Open</span>';
    const qrButton = !isExpired(session) ? `<button class="text-button" data-show-qr="${escapeHTML(session.id)}" type="button">View QR</button>` : '';
    const deleteButton = session.id.startsWith('demo_') ? '' : `<button class="text-button danger-button" data-delete-session="${escapeHTML(session.id)}" type="button">Delete</button>`;
    return `<article class="session-item"><div class="session-item-main"><strong>${escapeHTML(session.title)}</strong><small>${escapeHTML(session.course)} · ${count} check-in${count === 1 ? '' : 's'}</small></div><span class="session-item-date">${stamp.date} · ${stamp.time}</span>${status}<div class="session-item-actions">${qrButton}${deleteButton}</div></article>`;
  }).join('') : '<p class="empty-inline">No sessions created yet. Start with a new session.</p>';
}
function navigate(viewName) {
  const target = $(`#view-${viewName}`);
  if (!target || (viewName === 'sessions' && currentUser.role !== 'admin')) return;
  $$('.view').forEach(view => view.classList.toggle('active', view === target));
  $$('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === viewName));
  $('#sidebar').classList.remove('open');
  if (viewName === 'history') renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showModal(id) {
  const modal = $(`#${id}`);
  modal.hidden = false;
  const focusable = $('input:not([type="hidden"])', modal);
  if (focusable) setTimeout(() => focusable.focus(), 50);
}
function closeModal(modal) {
  modal.hidden = true;
}
function markAttendance(sessionId, token) {
  const session = store.sessions.find(item => item.id === sessionId);
  if (!session) return 'That session code was not found in this device.';
  if (isExpired(session)) return 'This session is closed. Its QR code has expired.';
  if (session.token !== token) return 'This code does not match the session. Ask your administrator for the current QR.';
  if (attended(sessionId)) return 'You have already checked in to this session.';
  store.attendance.push({ id: uid('att'), sessionId, userId: currentUser.id, markedAt: new Date().toISOString() });
  saveStore();
  renderAll();
  $('#scan-feedback').textContent = `Attendance marked for ${session.title}. You are checked in.`;
  $('#scan-feedback').className = 'scan-feedback success';
  return `Checked in: ${session.title}`;
}
function decodePayload(value) {
  const clean = value.trim();
  try {
    const parsed = JSON.parse(clean);
    if (parsed && parsed.app === 'rollcall' && parsed.sessionId && parsed.token) return markAttendance(parsed.sessionId, parsed.token);
  } catch (_) {
    // Session QR codes may also contain the compact token format.
  }
  const session = store.sessions.find(item => item.token === clean);
  return session ? markAttendance(session.id, clean) : 'That code is not a valid Rollcall session QR.';
}
function setScanFeedback(message, isError = false) {
  const feedback = $('#scan-feedback');
  feedback.textContent = message;
  feedback.className = `scan-feedback ${isError ? 'error' : 'success'}`;
}
async function startScanner() {
  if (!window.Html5Qrcode) {
    setScanFeedback('The scanner library could not load. Paste the QR code value below instead.', true);
    return;
  }
  try {
    scanner = new Html5Qrcode('reader');
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, decodedText => {
      const message = decodePayload(decodedText);
      setScanFeedback(message, !message.startsWith('Checked in:'));
      if (message.startsWith('Checked in:') && scanner) scanner.stop().catch(() => {});
    }, () => {});
    $('#scanner-placeholder').hidden = true;
    $('#start-scan').disabled = true;
    $('#stop-scan').disabled = false;
    setScanFeedback('Camera is active. Hold the session QR inside the frame.', false);
  } catch (error) {
    setScanFeedback(error.message || 'Camera access failed. Check browser permissions or paste the code below.', true);
  }
}
async function stopScanner() {
  if (scanner) {
    try { await scanner.stop(); scanner.clear(); } catch (_) { /* Scanner may already have stopped after a check-in. */ }
    scanner = null;
  }
  $('#scanner-placeholder').hidden = false;
  $('#start-scan').disabled = false;
  $('#stop-scan').disabled = true;
}
function showQr(sessionId) {
  const session = store.sessions.find(item => item.id === sessionId);
  if (!session || isExpired(session)) {
    showToast('This session QR has expired.', true);
    return;
  }
  const payload = JSON.stringify({ app: 'rollcall', sessionId: session.id, token: session.token, expiresAt: session.expiresAt });
  $('#qr-session-name').textContent = `${session.title} · ${session.course}`;
  $('#qr-token').textContent = session.token;
  $('#qr-expiry').textContent = `Valid until ${new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.expiresAt))}`;
  $('#qrcode').innerHTML = '';
  if (window.QRCode) new QRCode($('#qrcode'), { text: payload, width: 190, height: 190, colorDark: '#183c32', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  else $('#qrcode').textContent = 'QR library unavailable. Copy the session code below.';
  showModal('qr-modal');
}
function openSessionModal() {
  if (currentUser.role !== 'admin') return;
  $('#session-form').reset();
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $('#session-start').value = now.toISOString().slice(0, 16);
  $('#session-error').hidden = true;
  showModal('session-modal');
}
function createSession(event) {
  event.preventDefault();
  const title = $('#session-title').value.trim();
  const course = $('#session-course').value.trim();
  const startInput = $('#session-start').value;
  const startsAt = new Date(startInput);
  const error = $('#session-error');
  if (!title || !course || Number.isNaN(startsAt.getTime())) {
    error.textContent = 'Enter a session name, course or group, and valid start time.';
    error.hidden = false;
    return;
  }
  const createdAt = new Date();
  const session = { id: uid('ses'), title, course, startsAt: startsAt.toISOString(), expiresAt: new Date(createdAt.getTime() + QR_LIFETIME_HOURS * 3600000).toISOString(), token: makeToken(), active: true, createdAt: createdAt.toISOString() };
  store.sessions.push(session);
  saveStore();
  closeModal($('#session-modal'));
  renderAll();
  showQr(session.id);
  showToast('Session created. Its QR expires in 12 hours.');
}
async function signIn(email, password) {
  const user = store.users.find(item => item.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('No account found for this email. Create an account to continue.');
  if (await passwordHash(password, user.salt) !== user.passwordHash) throw new Error('That password does not match this account.');
  return user;
}
async function signUp(name, email, password) {
  if (store.users.some(item => item.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with this email already exists.');
  const salt = makeToken();
  const user = { id: uid('usr'), name, email, role: 'student', salt, passwordHash: await passwordHash(password, salt), createdAt: new Date().toISOString() };
  store.users.push(user);
  saveStore();
  return user;
}
async function loginHandler(event) {
  event.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  if (password.length < 8) { showError('Use a password with at least 8 characters.'); return; }
  $('#auth-submit').disabled = true;
  try {
    if (authMode === 'signup') {
      const name = $('#auth-name').value.trim();
      if (name.length < 2) throw new Error('Enter your full name to create an account.');
      currentUser = await signUp(name, email, password);
    } else {
      currentUser = await signIn(email, password);
    }
    sessionStorage.setItem(SESSION_KEY, currentUser.id);
    $('#auth-form').reset();
    renderApp();
  } catch (error) {
    showError(error.message || 'Could not sign in. Please try again.');
  } finally {
    $('#auth-submit').disabled = false;
  }
}
function demoLogin() {
  let admin = store.users.find(user => user.role === 'admin' && user.email === 'admin@rollcall.demo');
  if (!admin) {
    admin = { id: 'demo_admin', name: 'Ada Okafor', email: 'admin@rollcall.demo', role: 'admin', salt: 'demo-only', passwordHash: 'demo-only', createdAt: new Date().toISOString() };
    store.users.push(admin);
    saveStore();
  }
  currentUser = admin;
  sessionStorage.setItem(SESSION_KEY, currentUser.id);
  renderApp();
}
function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  currentUser = null;
  if (scanner) stopScanner();
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  setAuthMode('signin');
}
function restoreSession() {
  const id = sessionStorage.getItem(SESSION_KEY);
  currentUser = store.users.find(user => user.id === id) || null;
  if (currentUser) renderApp();
}
function bindEvents() {
  $('#signin-tab').addEventListener('click', () => setAuthMode('signin'));
  $('#signup-tab').addEventListener('click', () => setAuthMode('signup'));
  $('#auth-form').addEventListener('submit', loginHandler);
  $('#demo-login').addEventListener('click', demoLogin);
  $('#signout-button').addEventListener('click', signOut);
  $$('.nav-link').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#start-scan').addEventListener('click', startScanner);
  $('#stop-scan').addEventListener('click', stopScanner);
  $('#code-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = $('#session-code').value;
    const message = decodePayload(value);
    setScanFeedback(message, !message.startsWith('Checked in:'));
    if (message.startsWith('Checked in:')) { $('#session-code').value = ''; showToast(message); }
  });
  $('#history-filter').addEventListener('change', renderHistory);
  $('#new-session-button').addEventListener('click', openSessionModal);
  $('#new-session-button-alt').addEventListener('click', openSessionModal);
  $('#session-form').addEventListener('submit', createSession);
  $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop'))));
  $$('.modal-backdrop').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal); }));
  $('#admin-sessions-list').addEventListener('click', event => {
    const qrButton = event.target.closest('[data-show-qr]');
    const deleteButton = event.target.closest('[data-delete-session]');
    if (qrButton) showQr(qrButton.dataset.showQr);
    if (deleteButton) {
      const id = deleteButton.dataset.deleteSession;
      const session = store.sessions.find(item => item.id === id);
      if (!session || !window.confirm(`Delete “${session.title}” and its attendance records?`)) return;
      store.sessions = store.sessions.filter(item => item.id !== id);
      store.attendance = store.attendance.filter(item => item.sessionId !== id);
      saveStore();
      renderAll();
      showToast('Session and its attendance records deleted.');
    }
  });
  $('#copy-token').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#qr-token').textContent); showToast('Session code copied.'); }
    catch (_) { showToast('Clipboard access is unavailable in this browser.', true); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      $$('.modal-backdrop:not([hidden])').forEach(closeModal);
      $('#sidebar').classList.remove('open');
    }
  });
}

store = loadStore();
bindEvents();
restoreSession();
updateTopbarMeta();
setInterval(updateTopbarMeta, 1000);
