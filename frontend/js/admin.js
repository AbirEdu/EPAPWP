// Uses nginx proxy on Docker (:80), direct on local dev (:3000/:8000)
const API = window.location.port === '80' || window.location.port === '' ? '/api' : 'http://localhost:8000';
let currentUser = null;

// ─── INIT ───
window.addEventListener('DOMContentLoaded', () => {
  // Always show login screen by default
  document.getElementById('adminLoginScreen').style.display = 'flex';
  document.getElementById('adminDashboard').classList.add('d-none');
  document.getElementById('adminDashboard').style.display = '';

  // If user came from index.html admin login, auto-fill and submit
  const pendingUser = sessionStorage.getItem('eka_pending_admin_user');
  const pendingPass = sessionStorage.getItem('eka_pending_admin_pass');
  sessionStorage.removeItem('eka_pending_admin_user');
  sessionStorage.removeItem('eka_pending_admin_pass');

  if (pendingUser && pendingPass) {
    document.getElementById('adminUser').value = pendingUser;
    document.getElementById('adminPass').value = pendingPass;
    // Auto-login with the verified credentials
    doLogin(pendingUser, pendingPass);
  }

  document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('adminUser').value.trim();
    const password = document.getElementById('adminPass').value;
    await doLogin(username, password);
  });

  document.getElementById('createUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await createUser(e.target);
  });
});

// ─── AUTH ───
async function doLogin(username, password) {
  const btn = document.getElementById('adminLoginBtn');
  const text = document.getElementById('adminLoginText');
  const spinner = document.getElementById('adminLoginSpinner');
  const errBox = document.getElementById('adminLoginError');

  text.classList.add('d-none'); spinner.classList.remove('d-none');
  btn.disabled = true; errBox.classList.add('d-none');

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || 'Login failed');

    sessionStorage.setItem('eka_admin_token', data.access_token);
    currentUser = data;
    enterDashboard(data);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  }

  text.classList.remove('d-none'); spinner.classList.add('d-none');
  btn.disabled = false;
}

async function verifyAndEnter(token) {
  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { sessionStorage.removeItem('eka_admin_token'); return; }
    const data = await res.json();
    currentUser = data;
    enterDashboard(data);
  } catch {
    sessionStorage.removeItem('eka_admin_token');
  }
}

function enterDashboard(user) {
  document.getElementById('adminLoginScreen').style.display = 'none';
  const dash = document.getElementById('adminDashboard');
  dash.classList.remove('d-none');
  dash.style.display = 'flex';

  document.getElementById('sidebarUserPill').innerHTML =
    `<i class="bi bi-person-circle me-2"></i><strong>${user.full_name || user.username}</strong><br><small style="color:#888">${user.role}</small>`;
  document.getElementById('topbarUser').innerHTML =
    `<i class="bi bi-person-circle me-1"></i>${user.full_name || user.username}`;

  loadDashboard();
}

function adminLogout() {
  sessionStorage.removeItem('eka_admin_token');
  location.reload();
}

function getToken() { return sessionStorage.getItem('eka_admin_token'); }

async function apiGet(path) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPatch(path, body = null) {
  const token = getToken();
  const url = body ? `${API}${path}` : `${API}${path}`;
  const opts = {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ─── TABS ───
function showTab(tab, el) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('d-none'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.remove('d-none');
  if (el) el.classList.add('active');
  else document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  const titles = { dashboard:'Dashboard', members:'Members', feedback:'Feedback', carousel:'Content', users:'Admin Users' };
  document.getElementById('topbarTitle').textContent = titles[tab] || tab;

  if (tab === 'members')  loadMembers();
  if (tab === 'feedback') { loadFeedback(); loadVideoFeedback(); }
  if (tab === 'carousel') loadCarouselSlides();
  if (tab === 'users')    loadUsers();
}

// Jump to a tab from a dashboard stat card, optionally pre-filtering the
// members list (e.g. the "Pending" card should land on pending members).
function goToTab(tab, statusFilter) {
  showTab(tab, null);
  if (tab === 'members' && statusFilter !== undefined) {
    const filterEl = document.getElementById('statusFilter');
    filterEl.value = statusFilter;
    loadMembers();
  }
}

function toggleSidebar() {
  document.getElementById('adminSidebar').classList.toggle('open');
}

// ─── DASHBOARD ───
async function loadDashboard() {
  try {
    const stats = await apiGet('/stats');
    document.getElementById('stat-total').textContent    = stats.members.total;
    document.getElementById('stat-pending').textContent  = stats.members.pending;
    document.getElementById('stat-approved').textContent = stats.members.approved;
    document.getElementById('stat-feedback').textContent = stats.feedback.total;

    // Interest chart
    const chartEl = document.getElementById('interestChart');
    const maxVal = Math.max(...Object.values(stats.interests), 1);
    chartEl.innerHTML = Object.entries(stats.interests)
      .slice(0, 8)
      .map(([label, count]) => `
        <div class="interest-bar-item">
          <div class="interest-bar-label"><span>${label}</span><span>${count}</span></div>
          <div class="interest-bar-track"><div class="interest-bar-fill" style="width:${(count/maxVal*100).toFixed(0)}%"></div></div>
        </div>`).join('') || '<p class="text-muted small">No data yet</p>';
  } catch { /* demo mode — skip */ }

  // Recent members
  try {
    const members = await apiGet('/members?limit=5');
    const el = document.getElementById('recentMembersList');
    el.innerHTML = members.length ? members.map(m => `
      <div class="member-mini-item">
        <div class="member-avatar">${m.name.charAt(0)}</div>
        <div class="flex-grow-1">
          <div class="member-mini-name">${m.name}</div>
          <div class="member-mini-meta">${m.email} · ${m.interests.slice(0,2).join(', ')}</div>
        </div>
        <span class="badge-status badge-${m.status}">${m.status}</span>
      </div>`).join('') : '<p class="text-muted small">No registrations yet.</p>';
  } catch {
    document.getElementById('recentMembersList').innerHTML = '<p class="text-muted small">API not connected (demo mode).</p>';
  }
}

// ─── MEMBERS ───
async function loadMembers() {
  const status = document.getElementById('statusFilter').value;
  const tbody = document.getElementById('membersTableBody');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>`;
  try {
    const url = `/members?limit=50${status ? '&status='+status : ''}`;
    const members = await apiGet(url);
    if (!members.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No members found.</td></tr>`;
      return;
    }
    tbody.innerHTML = members.map(m => `
      <tr>
        <td><div class="fw-600">${m.name}</div><div class="text-muted" style="font-size:0.75rem">${m.phone}</div></td>
        <td>${m.email}</td>
        <td>${m.phone}</td>
        <td>${m.interests.map(i => `<span class="interest-tag">${i}</span>`).join('')}</td>
        <td>${m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN') : '—'}</td>
        <td><span class="badge-status badge-${m.status}">${m.status}</span></td>
        <td>
          <div class="d-flex gap-1 flex-wrap">
            <button class="btn-sm-action btn-view" onclick="viewMember('${m.id}')"><i class="bi bi-eye"></i></button>
            ${m.status === 'pending' ? `<button class="btn-sm-action btn-approve" onclick="setStatus('${m.id}','approved',this)">Approve</button>` : ''}
            ${m.status !== 'inactive' ? `<button class="btn-sm-action btn-inactive" onclick="setStatus('${m.id}','inactive',this)">Deactivate</button>` : `<button class="btn-sm-action btn-approve" onclick="setStatus('${m.id}','active',this)">Activate</button>`}
          </div>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
  }
}

async function setStatus(id, status, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    await apiPatch(`/members/${id}/status?status=${status}`);
    showToast(`Status updated to "${status}"`, 'success');
    loadMembers();
  } catch (err) {
    showToast(err.message, 'danger');
    btn.disabled = false;
  }
}

async function viewMember(id) {
  const modal = new bootstrap.Modal(document.getElementById('memberDetailModal'));
  const body = document.getElementById('memberDetailBody');
  body.innerHTML = '<div class="text-center py-4"><span class="spinner-border"></span></div>';
  modal.show();
  try {
    const m = await apiGet(`/members/${id}`);
    body.innerHTML = `
      <div class="row g-3 p-2">
        <div class="col-md-6">
          <div class="detail-row"><span class="detail-label">Full Name</span><span class="detail-value">${m.name}</span></div>
          <div class="detail-row"><span class="detail-label">Parent's Name</span><span class="detail-value">${m.parent_name || '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${m.phone}</span></div>
          <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${m.email}</span></div>
          <div class="detail-row"><span class="detail-label">Age / DOB</span><span class="detail-value">${m.age} · ${m.dob}</span></div>
          <div class="detail-row"><span class="detail-label">Occupation</span><span class="detail-value">${m.occupation}</span></div>
          <div class="detail-row"><span class="detail-label">Organization</span><span class="detail-value">${m.organization || '—'}</span></div>
        </div>
        <div class="col-md-6">
          <div class="detail-row"><span class="detail-label">Current Address</span><span class="detail-value">${m.current_address}</span></div>
          <div class="detail-row"><span class="detail-label">Permanent Address</span><span class="detail-value">${m.permanent_address || '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Aadhar</span><span class="detail-value">${m.aadhar || '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="badge-status badge-${m.status}">${m.status}</span></span></div>
          <div class="detail-row"><span class="detail-label">Registered</span><span class="detail-value">${m.created_at ? new Date(m.created_at).toLocaleString('en-IN') : '—'}</span></div>
        </div>
        <div class="col-12">
          <div class="detail-label mb-2">Interests</div>
          <div>${m.interests.map(i => `<span class="interest-tag">${i}</span>`).join('')}</div>
        </div>
        <div class="col-12">
          <div class="detail-label mb-2">Skill Ratings</div>
          <div class="row g-2">
            ${Object.entries(m.ratings||{}).map(([k,v])=>`
              <div class="col-6 col-md-4">
                <div style="font-size:0.8rem;font-weight:600;color:#888;text-transform:capitalize">${k}</div>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="flex:1;height:6px;background:#f0ebe4;border-radius:4px"><div style="width:${v*10}%;height:100%;background:var(--crimson,#8B0000);border-radius:4px"></div></div>
                  <span style="font-weight:700;font-size:0.85rem">${v}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>
        ${m.motivation ? `<div class="col-12"><div class="detail-label mb-1">Motivation</div><p style="font-size:0.88rem;color:#555;background:#fafaf8;padding:12px;border-radius:8px;border-left:3px solid #8B0000">${m.motivation}</p></div>` : ''}
      </div>`;
  } catch (err) {
    body.innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

// ─── FEEDBACK ───
async function loadFeedback() {
  const el = document.getElementById('feedbackList');
  el.innerHTML = '<div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div>';
  try {
    const items = await apiGet('/feedback?limit=50');
    el.innerHTML = items.length ? items.map(f => `
      <div class="feedback-item">
        <div class="feedback-item-header">
          <div>
            <div class="feedback-item-name">${f.name}</div>
            <div class="feedback-item-event">${f.event || 'General Feedback'}</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge-status badge-${f.status || 'pending'}">${f.status || 'pending'}</span>
            <div class="feedback-item-date">${f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN') : ''}</div>
          </div>
        </div>
        <div class="feedback-item-message">"${f.message}"</div>
        <div style="font-size:0.78rem;color:#aaa;margin-top:6px">${f.email}</div>
        <div class="d-flex gap-1 mt-2">
          ${f.status !== 'approved' ? `<button class="btn-sm-action btn-approve" onclick="setFeedbackStatus('${f.id}','approved',this)">Approve</button>` : ''}
          ${f.status !== 'rejected' ? `<button class="btn-sm-action btn-inactive" onclick="setFeedbackStatus('${f.id}','rejected',this)">Reject</button>` : ''}
        </div>
      </div>`).join('') : '<p class="text-muted text-center py-4">No feedback yet.</p>';
  } catch (err) {
    el.innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

async function setFeedbackStatus(id, status, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    await apiPatch(`/feedback/${id}/status?status=${status}`);
    showToast(`Feedback ${status}`, 'success');
    loadFeedback();
  } catch (err) {
    showToast(err.message, 'danger');
    btn.disabled = false;
  }
}

// ─── VIDEO FEEDBACK ───
async function loadVideoFeedback() {
  const el = document.getElementById('videoFeedbackList');
  el.innerHTML = '<div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></div>';
  try {
    const items = await apiGet('/feedback/video?limit=50');
    el.innerHTML = items.length ? items.map(f => `
      <div class="feedback-item">
        <div class="feedback-item-header">
          <div class="feedback-item-name">${f.name}</div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge-status badge-${f.status || 'pending'}">${f.status || 'pending'}</span>
            <div class="feedback-item-date">${f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN') : ''}</div>
          </div>
        </div>
        <div class="ratio ratio-16x9 mt-2" style="max-width:360px;">
          <iframe src="https://www.youtube.com/embed/${f.youtube_video_id}" title="${f.name}" allowfullscreen></iframe>
        </div>
        <div class="d-flex gap-1 mt-2">
          ${f.status !== 'approved' ? `<button class="btn-sm-action btn-approve" onclick="setVideoFeedbackStatus('${f.id}','approved',this)">Approve</button>` : ''}
          ${f.status !== 'rejected' ? `<button class="btn-sm-action btn-inactive" onclick="setVideoFeedbackStatus('${f.id}','rejected',this)">Reject</button>` : ''}
        </div>
      </div>`).join('') : '<p class="text-muted text-center py-4">No video feedback yet.</p>';
  } catch (err) {
    el.innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

async function setVideoFeedbackStatus(id, status, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    await apiPatch(`/feedback/video/${id}/status?status=${status}`);
    showToast(`Video feedback ${status}`, 'success');
    loadVideoFeedback();
  } catch (err) {
    showToast(err.message, 'danger');
    btn.disabled = false;
  }
}

// ─── CAROUSEL / CONTENT ───
const CATEGORY_LABELS = { EPA: 'Ekalavya Performing Arts', PWP: 'Picture Wicture Productions' };
let editingSlideId = null;
let _carouselSlidesCache = [];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadCarouselSlides() {
  const el = document.getElementById('carouselSlidesGrid');
  el.innerHTML = '<div class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</div>';
  try {
    const slides = await apiGet('/carousel');
    _carouselSlidesCache = slides;
    if (!slides.length) {
      el.innerHTML = '<p class="text-muted text-center py-4">No carousel slides yet. Click "Add Slide" to create your first one.</p>';
      return;
    }
    const activeCount = slides.filter(s => s.active).length;
    const warning = activeCount < 2
      ? `<div class="alert alert-warning py-2 small mb-3">Only ${activeCount} slide${activeCount === 1 ? '' : 's'} live — add at least 2 so the homepage carousel has something to cycle through.</div>`
      : (activeCount > 8 ? `<div class="alert alert-warning py-2 small mb-3">${activeCount} slides live — only the first 8 (by display order) will show on the homepage.</div>` : '');
    el.innerHTML = warning + '<div class="carousel-admin-cards">' + slides.map(s => `
      <div class="carousel-admin-card">
        <div class="carousel-admin-thumb" style="background-image:url('${s.poster_image}')"></div>
        <div class="carousel-admin-info">
          <div class="carousel-admin-name">${escapeHtml(s.show_name)}</div>
          <div class="carousel-admin-meta">
            <span class="interest-tag">${CATEGORY_LABELS[s.category] || s.category}</span>
            ${s.event_date ? `<span>${new Date(s.event_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>` : ''}
            ${s.venue ? `<span>${escapeHtml(s.venue)}</span>` : ''}
          </div>
          <span class="badge-status ${s.active ? 'badge-active' : 'badge-inactive'}">${s.active ? 'Live' : 'Hidden'}</span>
        </div>
        <div class="carousel-admin-actions">
          <button class="btn-sm-action btn-view" onclick="openSlideForm('${s.id}')">Edit</button>
          <button class="btn-sm-action ${s.active ? 'btn-inactive' : 'btn-approve'}" onclick="toggleSlideActive('${s.id}', ${!s.active})">${s.active ? 'Hide' : 'Show'}</button>
          <button class="btn-sm-action btn-inactive" onclick="deleteSlide('${s.id}')">Delete</button>
        </div>
      </div>`).join('') + '</div>';
  } catch (err) {
    el.innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

function openSlideForm(id) {
  const slide = id ? _carouselSlidesCache.find(s => s.id === id) : null;
  editingSlideId = slide ? slide.id : null;
  const form = document.getElementById('slideForm');
  form.reset();
  document.getElementById('slideFormAlert').classList.add('d-none');
  document.getElementById('slidePosterPreview').classList.add('d-none');
  document.getElementById('slideFormTitle').innerHTML = slide
    ? '<i class="bi bi-images me-2"></i>Edit Carousel Slide'
    : '<i class="bi bi-images me-2"></i>Add Carousel Slide';
  document.getElementById('posterRequiredMark').style.display = slide ? 'none' : 'inline';
  document.getElementById('slidePosterInput').required = !slide;

  if (slide) {
    form.show_name.value = slide.show_name || '';
    form.category.value = slide.category || 'EPA';
    form.event_date.value = slide.event_date || '';
    form.venue.value = slide.venue || '';
    form.description.value = slide.description || '';
    form.booking_url.value = slide.booking_url || '';
    form.order.value = slide.order ?? 0;
    document.getElementById('slideActiveCheck').checked = !!slide.active;
    if (slide.poster_image) {
      const preview = document.getElementById('slidePosterPreview');
      preview.src = slide.poster_image;
      preview.classList.remove('d-none');
    }
  } else {
    document.getElementById('slideActiveCheck').checked = true;
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('slideFormModal')).show();
}

document.getElementById('slidePosterInput')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('slidePosterPreview');
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { preview.src = reader.result; preview.classList.remove('d-none'); };
  reader.readAsDataURL(file);
});

document.getElementById('slideForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('slideFormSubmitBtn');
  const alertEl = document.getElementById('slideFormAlert');
  alertEl.classList.add('d-none');
  btn.disabled = true; btn.textContent = 'Saving...';

  const fd = new FormData();
  fd.append('show_name', form.show_name.value);
  fd.append('category', form.category.value);
  fd.append('event_date', form.event_date.value || '');
  fd.append('venue', form.venue.value || '');
  fd.append('description', form.description.value || '');
  fd.append('booking_url', form.booking_url.value || '');
  fd.append('order', form.order.value || '0');
  fd.append('active', document.getElementById('slideActiveCheck').checked ? 'true' : 'false');
  const posterFile = document.getElementById('slidePosterInput').files[0];
  if (posterFile) fd.append('poster', posterFile);

  try {
    const token = getToken();
    const url = editingSlideId ? `${API}/carousel/${editingSlideId}` : `${API}/carousel`;
    const res = await fetch(url, {
      method: editingSlideId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

    bootstrap.Modal.getInstance(document.getElementById('slideFormModal'))?.hide();
    showToast(editingSlideId ? 'Slide updated' : 'Slide added', 'success');
    loadCarouselSlides();
  } catch (err) {
    alertEl.className = 'alert alert-danger py-2 small mt-3 mb-0';
    alertEl.textContent = err.message;
    alertEl.classList.remove('d-none');
  }
  btn.disabled = false; btn.textContent = 'Save Slide';
});

async function toggleSlideActive(id, active) {
  try {
    const fd = new FormData();
    fd.append('active', active ? 'true' : 'false');
    const token = getToken();
    const res = await fetch(`${API}/carousel/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    showToast(active ? 'Slide is now live' : 'Slide hidden', 'success');
    loadCarouselSlides();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function deleteSlide(id) {
  const slide = _carouselSlidesCache.find(s => s.id === id);
  if (!confirm(`Delete the "${slide ? slide.show_name : 'this'}" slide? This can't be undone.`)) return;
  try {
    const token = getToken();
    const res = await fetch(`${API}/carousel/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.detail || `HTTP ${res.status}`); }
    showToast('Slide deleted', 'success');
    loadCarouselSlides();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ─── USERS ───
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></td></tr>`;
  try {
    const users = await apiGet('/users');
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td>${u.full_name}</td>
        <td><span class="badge-status badge-${u.role === 'super_admin' ? 'approved' : 'active'}">${u.role}</span></td>
        <td><span class="badge-status ${u.active ? 'badge-active' : 'badge-inactive'}">${u.active ? 'Active' : 'Disabled'}</span></td>
        <td>
          ${u.username !== currentUser?.username ? `
            <button class="btn-sm-action ${u.active ? 'btn-inactive' : 'btn-approve'}"
              onclick="toggleUser('${u.username}', ${!u.active}, this)">
              ${u.active ? 'Disable' : 'Enable'}
            </button>` : '<span style="font-size:0.75rem;color:#aaa">You</span>'}
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

async function createUser(form) {
  const alertEl = document.getElementById('createUserAlert');
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creating...';
  alertEl.classList.add('d-none');
  try {
    const payload = {
      full_name: form.full_name.value,
      username:  form.username.value,
      password:  form.password.value,
      role:      form.role.value,
    };
    await apiPost('/users', payload);
    alertEl.className = 'alert alert-success py-2 small mb-3';
    alertEl.textContent = `✅ User "${payload.username}" created successfully.`;
    alertEl.classList.remove('d-none');
    form.reset();
    loadUsers();
  } catch (err) {
    alertEl.className = 'alert alert-danger py-2 small mb-3';
    alertEl.textContent = err.message;
    alertEl.classList.remove('d-none');
  }
  btn.disabled = false; btn.textContent = 'Create User';
}

async function toggleUser(username, active, btn) {
  btn.disabled = true;
  try {
    await apiPatch(`/users/${username}/active?active=${active}`);
    showToast(`User "${username}" ${active ? 'enabled' : 'disabled'}`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'danger');
    btn.disabled = false;
  }
}

// ─── HELPERS ───
function togglePwd(selector, btn) {
  const input = document.querySelector(typeof selector === 'string' && selector.startsWith('#')
    ? selector : `#${selector}`) || document.querySelector(selector);
  if (!input) return;
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.innerHTML = isText ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
}

function showToast(message, type = 'success') {
  const existing = document.getElementById('adminToast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'adminToast';
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:${type==='success'?'#065f46':'#991b1b'};color:#fff;padding:12px 20px;border-radius:10px;font-size:0.88rem;font-weight:500;box-shadow:0 8px 30px rgba(0,0,0,0.25);animation:slideUp 0.3s ease`;
  toast.textContent = message;
  const style = document.createElement('style');
  style.textContent = '@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; setTimeout(()=>toast.remove(),300); }, 3500);
}

// ── Admin-side rating helper ──
function adminUpdateRating(slider, id) {
  const el = document.getElementById(id);
  if (el) el.textContent = slider.value;
}

// ── Admin New Member Form ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('adminRegForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form    = e.target;
    const alertEl = document.getElementById('adminRegAlert');
    const btn     = form.querySelector('button[type="submit"]');

    const interests = [...form.querySelectorAll('input[name="interests"]:checked')].map(c => c.value);
    if (!interests.length) {
      alertEl.className = 'alert alert-warning';
      alertEl.textContent = 'Please select at least one area of interest.';
      alertEl.classList.remove('d-none');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    alertEl.classList.add('d-none');

    const payload = {
      name:              form.name.value,
      parent_name:       form.parent_name.value,
      phone:             form.phone.value,
      email:             form.email.value,
      age:               parseInt(form.age.value),
      dob:               form.dob.value,
      aadhar:            form.aadhar.value || undefined,
      occupation:        form.occupation.value,
      organization:      form.organization.value || undefined,
      current_address:   form.current_address.value,
      permanent_address: form.permanent_address.value || undefined,
      interests,
      ratings: {
        acting:     parseInt(form.rating_acting.value),
        dance:      parseInt(form.rating_dance.value),
        music:      parseInt(form.rating_music.value),
        song:       parseInt(form.rating_song.value),
        recitation: parseInt(form.rating_recitation.value),
        anchoring:  parseInt(form.rating_anchoring.value),
      },
      motivation: form.motivation.value || undefined,
    };

    try {
      const res = await apiPost('/register', payload);
      alertEl.className = 'alert alert-success';
      alertEl.innerHTML = `✅ <strong>${payload.name}</strong> registered successfully with status <em>pending</em>.`;
      alertEl.classList.remove('d-none');
      form.reset();
      document.querySelectorAll('#tab-newmember .rating-badge').forEach(b => b.textContent = '5');
      // Refresh members list in background
      setTimeout(() => loadMembers(), 500);
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message || 'Registration failed.';
      alertEl.classList.remove('d-none');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send me-1"></i>Submit Registration';
  });
});
