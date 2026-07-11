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
    // Demo fallback for testing without backend
    if (username === 'admin' && password === 'Ekalavya@2025') {
      const fakeUser = { username: 'admin', full_name: 'Ekalavya Admin', role: 'super_admin', access_token: 'demo' };
      sessionStorage.setItem('eka_admin_token', 'demo');
      currentUser = fakeUser;
      enterDashboard(fakeUser);
    }
  }

  text.classList.remove('d-none'); spinner.classList.add('d-none');
  btn.disabled = false;
}

async function verifyAndEnter(token) {
  if (token === 'demo') {
    currentUser = { username: 'admin', full_name: 'Ekalavya Admin', role: 'super_admin' };
    enterDashboard(currentUser);
    return;
  }
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
  const titles = { dashboard:'Dashboard', members:'Members', feedback:'Feedback', users:'Admin Users' };
  document.getElementById('topbarTitle').textContent = titles[tab] || tab;

  if (tab === 'members')  loadMembers();
  if (tab === 'feedback') loadFeedback();
  if (tab === 'users')    loadUsers();
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
          <div class="detail-row"><span class="detail-label">Parent's Name</span><span class="detail-value">${m.parent_name}</span></div>
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
          <div class="feedback-item-date">${f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN') : ''}</div>
        </div>
        <div class="feedback-item-message">"${f.message}"</div>
        <div style="font-size:0.78rem;color:#aaa;margin-top:6px">${f.email}</div>
      </div>`).join('') : '<p class="text-muted text-center py-4">No feedback yet.</p>';
  } catch (err) {
    el.innerHTML = `<p class="text-danger">${err.message}</p>`;
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
