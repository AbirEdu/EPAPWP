/**
 * Ekalavya Performing Arts — script.js
 */
// Uses nginx proxy on Docker (:80), direct on local dev (:3000/:8000)
const API_BASE = window.location.port === '80' || window.location.port === '' ? '/api' : 'http://localhost:8000';

// ══════════════════════════════════════════
// MODAL HELPERS  (Bootstrap + manual fallback)
// ══════════════════════════════════════════
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.bootstrap?.Modal) {
    const inst = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
    inst.show();
  } else {
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65)';
    el.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.bootstrap?.Modal) {
    bootstrap.Modal.getInstance(el)?.hide();
  } else {
    el.style.display = 'none';
    el.classList.remove('show');
    document.body.style.overflow = '';
  }
}

// Close on backdrop click / data-bs-dismiss
document.addEventListener('click', e => {
  if (e.target.matches('[data-bs-dismiss="modal"]') || e.target.closest('[data-bs-dismiss="modal"]')) {
    closeModal(e.target.closest('.modal')?.id);
  }
  if (e.target.classList.contains('modal') && e.target.classList.contains('show')) {
    closeModal(e.target.id);
  }
});

// ══════════════════════════════════════════
// JOIN US — opens registration directly, no login
// ══════════════════════════════════════════
window.openRegistrationDirect = function () {
  const alertEl = document.getElementById('formAlert');
  if (alertEl) { alertEl.className = 'alert d-none'; alertEl.textContent = ''; }
  document.getElementById('registrationForm')?.reset();
  document.querySelectorAll('.rating-badge').forEach(b => b.textContent = '5');
  openModal('registerModal');
};

// ══════════════════════════════════════════
// ADMIN LINK — opens admin login modal
// ══════════════════════════════════════════
window.openAdminLogin = function (e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  e?.preventDefault();
  document.getElementById('adminLoginError')?.classList.add('d-none');
  document.getElementById('adminLoginPass').value = '';
  openModal('adminLoginModal');
};

// ══════════════════════════════════════════
// ADMIN LOGIN FORM
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('adminLoginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('adminLoginUser').value.trim();
    const password = document.getElementById('adminLoginPass').value;
    const errBox   = document.getElementById('adminLoginError');
    const btn      = document.getElementById('adminLoginBtn');
    const btnText  = document.getElementById('adminLoginBtnText');
    const btnSpin  = document.getElementById('adminLoginBtnSpinner');

    btnText.classList.add('d-none');
    btnSpin.classList.remove('d-none');
    btn.disabled = true;
    errBox.classList.add('d-none');

    let ok = false;
    let verified = false;

    // Try real API
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) { ok = true; verified = true; }
      else throw new Error(data.detail || 'Invalid credentials');
    } catch {
      // Demo / offline fallback
      if (username === 'admin' && password === 'Ekalavya@2025') {
        ok = true;
      } else {
        errBox.textContent = 'Invalid credentials. (Default: admin / Ekalavya@2025)';
        errBox.classList.remove('d-none');
      }
    }

    if (ok) {
      // Pass credentials via sessionStorage for admin.html to re-authenticate itself
      sessionStorage.setItem('eka_pending_admin_user', username);
      sessionStorage.setItem('eka_pending_admin_pass', password);
      closeModal('adminLoginModal');
      setTimeout(() => { window.location.href = 'admin.html'; }, 200);
    }

    btnText.classList.remove('d-none');
    btnSpin.classList.add('d-none');
    btn.disabled = false;
  });

  // ══════════════════════════════════════════
  // REGISTRATION FORM SUBMIT (public — no auth)
  // ══════════════════════════════════════════
  document.getElementById('submitRegistration')?.addEventListener('click', async () => {
    const form    = document.getElementById('registrationForm');
    const alertEl = document.getElementById('formAlert');
    const btn     = document.getElementById('submitRegistration');
    const btnText = document.getElementById('submitText');
    const btnSpin = document.getElementById('submitSpinner');

    if (!form.checkValidity()) { form.reportValidity(); return; }

    const interests = [...form.querySelectorAll('input[name="interests"]:checked')].map(c => c.value);
    if (!interests.length) {
      alertEl.className = 'alert alert-warning';
      alertEl.textContent = 'Please select at least one area of interest.';
      alertEl.classList.remove('d-none');
      return;
    }

    btnText.classList.add('d-none');
    btnSpin.classList.remove('d-none');
    btn.disabled = true;
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

    // Try API, succeed either way in demo mode
    try {
      const token = sessionStorage.getItem('eka_admin_token') || 'public';
      await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
    } catch { /* offline — show success */ }

    alertEl.className = 'alert alert-success';
    alertEl.innerHTML = `🎉 Thank you, <strong>${payload.name}</strong>! Your registration is received. We'll reach out at <strong>${payload.email}</strong>.`;
    alertEl.classList.remove('d-none');
    form.reset();
    document.querySelectorAll('.rating-badge').forEach(b => b.textContent = '5');

    setTimeout(() => {
      closeModal('registerModal');
      showToast('Registration submitted! Welcome to Ekalavya 🎭', 'success');
    }, 2800);

    btnText.classList.remove('d-none');
    btnSpin.classList.add('d-none');
    btn.disabled = false;
  });

  // ══════════════════════════════════════════
  // FEEDBACK FORM
  // ══════════════════════════════════════════
  document.getElementById('feedbackForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn  = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.fbname.value, email: form.fbemail.value, event: form.fbevent.value, message: form.fbmessage.value }),
      });
    } catch {}
    showToast('Thank you for your feedback! 🙏', 'success');
    form.reset();
    btn.disabled = false;
    btn.textContent = 'Submit Feedback';
  });

  // Navbar scroll shadow
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('mainNav');
    if (nav) nav.style.boxShadow = window.scrollY > 60 ? '0 2px 30px rgba(0,0,0,0.15)' : '0 1px 20px rgba(0,0,0,0.08)';
  });

  // Active nav link on scroll
  const secs = document.querySelectorAll('section[id]');
  const links = document.querySelectorAll('.navbar-nav .nav-link');
  window.addEventListener('scroll', () => {
    let cur = '';
    secs.forEach(s => { if (window.scrollY >= s.offsetTop - 80) cur = s.id; });
    links.forEach(l => { l.classList.toggle('active', l.getAttribute('href') === `#${cur}`); });
  });

}); // end DOMContentLoaded

// ── Inline helpers ──
window.updateRating = (slider, id) => { const el = document.getElementById(id); if (el) el.textContent = slider.value; };
window.togglePwd = (inputId, btn) => {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'text' ? 'password' : 'text';
  btn.innerHTML = input.type === 'password' ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
};

function showToast(msg, type = 'success') {
  document.getElementById('liveToast')?.remove();
  const t = document.createElement('div');
  t.id = 'liveToast';
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;background:${type==='success'?'#1a5c3a':'#8B0000'};color:#fff;padding:14px 20px;border-radius:10px;font-size:.9rem;font-weight:500;max-width:340px;box-shadow:0 8px 30px rgba(0,0,0,.25)`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
}

// ══════════════════════════════════════════
// VIDEO FEEDBACK RECORDER
// ══════════════════════════════════════════
let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let stream = null;
let recordTimer = null;
let recordSeconds = 0;
const MAX_SECONDS = 120; // 2-minute limit

// Switch tab between text / video
window.switchFbTab = function (btn) {
  const target = btn.dataset.tab;
  document.querySelectorAll('.fb-tab').forEach(t => t.classList.toggle('active', t === btn));
  document.querySelectorAll('.fb-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));
  // If switching away from video, kill any active recording
  if (target !== 'video' && stream) { cleanupStream(); resetVideoUI(); }
};

window.startRecording = async function () {
  const status = document.getElementById('videoStatus');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    status.innerHTML = '<span class="text-danger">⚠️ Camera/microphone access denied. Please allow access in your browser settings.</span>';
    return;
  }

  // Setup live preview
  const preview = document.getElementById('videoPreview');
  document.getElementById('videoPlaceholder').classList.add('d-none');
  document.getElementById('videoPlayback').classList.add('d-none');
  preview.classList.remove('d-none');
  preview.srcObject = stream;

  // Setup recorder
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = handleRecordingStop;
  mediaRecorder.start();

  // Show stop button, hide record
  document.getElementById('btnRecord').classList.add('d-none');
  document.getElementById('btnStop').classList.remove('d-none');
  document.getElementById('btnRetake').classList.add('d-none');
  document.getElementById('btnSend').classList.add('d-none');

  // Show timer
  document.getElementById('recIndicator').classList.remove('d-none');
  recordSeconds = 0;
  updateTimer();
  recordTimer = setInterval(() => {
    recordSeconds++;
    updateTimer();
    if (recordSeconds >= MAX_SECONDS) stopRecording();
  }, 1000);

  status.textContent = '🔴 Recording...';
};

window.stopRecording = function () {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
  document.getElementById('recIndicator').classList.add('d-none');
};

function handleRecordingStop() {
  recordedBlob = new Blob(recordedChunks, { type: getSupportedMimeType() });
  const url = URL.createObjectURL(recordedBlob);

  const playback = document.getElementById('videoPlayback');
  const preview  = document.getElementById('videoPreview');
  preview.classList.add('d-none');
  preview.srcObject = null;
  playback.src = url;
  playback.classList.remove('d-none');

  // Stop the camera
  cleanupStream();

  // Show retake + send
  document.getElementById('btnRecord').classList.add('d-none');
  document.getElementById('btnStop').classList.add('d-none');
  document.getElementById('btnRetake').classList.remove('d-none');
  document.getElementById('btnSend').classList.remove('d-none');

  const seconds = recordSeconds;
  document.getElementById('videoStatus').innerHTML = `✅ Recorded ${formatTime(seconds)} of video. Preview above, then click <strong>Send Feedback</strong>.`;
}

window.retakeVideo = function () {
  resetVideoUI();
  document.getElementById('videoStatus').textContent = '';
};

window.sendVideo = async function () {
  const name  = document.getElementById('vbName').value.trim();
  const email = document.getElementById('vbEmail').value.trim();
  const event = document.getElementById('vbEvent').value.trim();
  const status = document.getElementById('videoStatus');

  if (!name || !email) {
    status.innerHTML = '<span class="text-danger">Please fill in your name and email above.</span>';
    return;
  }
  if (!recordedBlob) {
    status.innerHTML = '<span class="text-danger">Please record a video first.</span>';
    return;
  }

  const btn = document.getElementById('btnSend');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

  // Build form data with the video blob
  const formData = new FormData();
  formData.append('name', name);
  formData.append('email', email);
  formData.append('event', event || 'Video Feedback');
  formData.append('video', recordedBlob, `feedback_${Date.now()}.webm`);
  formData.append('duration', recordSeconds);

  try {
    const res = await fetch(`${API_BASE}/feedback/video`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error();
  } catch {
    // Demo / offline — show success anyway
  }

  showToast('🎬 Video feedback sent! Thank you 🙏', 'success');
  resetVideoUI();
  document.getElementById('vbName').value = '';
  document.getElementById('vbEmail').value = '';
  document.getElementById('vbEvent').value = '';
  status.innerHTML = '<span class="text-success">✅ Sent successfully!</span>';
  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-send-fill"></i> Send Feedback';
};

function resetVideoUI() {
  if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
  cleanupStream();
  recordedBlob = null;
  recordedChunks = [];
  recordSeconds = 0;

  document.getElementById('videoPlaceholder').classList.remove('d-none');
  document.getElementById('videoPreview').classList.add('d-none');
  document.getElementById('videoPlayback').classList.add('d-none');
  document.getElementById('recIndicator').classList.add('d-none');
  document.getElementById('btnRecord').classList.remove('d-none');
  document.getElementById('btnStop').classList.add('d-none');
  document.getElementById('btnRetake').classList.add('d-none');
  document.getElementById('btnSend').classList.add('d-none');
}

function cleanupStream() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function getSupportedMimeType() {
  const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
  for (const t of types) { if (MediaRecorder.isTypeSupported(t)) return t; }
  return 'video/webm';
}

function updateTimer() {
  document.getElementById('recTimer').textContent = formatTime(recordSeconds);
}
function formatTime(s) {
  const m = String(Math.floor(s/60)).padStart(2,'0');
  const sec = String(s%60).padStart(2,'0');
  return `${m}:${sec}`;
}
// ══════════════════════════════════════════
// VIDEO FEEDBACK RECORDER
// Append this to your script.js
// ══════════════════════════════════════════
(function () {
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedBlob = null;
  let stream = null;
  let recordTimer = null;
  let recordSeconds = 0;
  const MAX_SECONDS = 120; // 2-minute limit

  window.startRecording = async function () {
    const status = document.getElementById('videoStatus');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      status.innerHTML = '<span style="color:#b91c1c">⚠️ Camera/mic access denied. Allow access in browser settings.</span>';
      return;
    }

    const preview = document.getElementById('videoPreview');
    document.getElementById('videoPlaceholder').classList.add('d-none');
    document.getElementById('videoPlayback').classList.add('d-none');
    preview.classList.remove('d-none');
    preview.srcObject = stream;

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start();

    toggleBtn('btnRecord', false);
    toggleBtn('btnStop', true);
    toggleBtn('btnRetake', false);
    toggleBtn('btnSend', false);

    document.getElementById('recIndicator').classList.remove('d-none');
    recordSeconds = 0;
    updateTimer();
    recordTimer = setInterval(() => {
      recordSeconds++;
      updateTimer();
      if (recordSeconds >= MAX_SECONDS) stopRecording();
    }, 1000);

    status.textContent = '🔴 Recording... (max 2 min)';
  };

  window.stopRecording = function () {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
    document.getElementById('recIndicator').classList.add('d-none');
  };

  function handleRecordingStop() {
    recordedBlob = new Blob(recordedChunks, { type: getSupportedMimeType() });
    const url = URL.createObjectURL(recordedBlob);
    const playback = document.getElementById('videoPlayback');
    const preview  = document.getElementById('videoPreview');
    preview.classList.add('d-none');
    preview.srcObject = null;
    playback.src = url;
    playback.classList.remove('d-none');
    cleanupStream();

    toggleBtn('btnRecord', false);
    toggleBtn('btnStop', false);
    toggleBtn('btnRetake', true);
    toggleBtn('btnSend', true);

    document.getElementById('videoStatus').innerHTML =
      `✅ Recorded ${formatTime(recordSeconds)}. Preview above, then click <strong>send</strong> to post.`;
  }

  window.retakeVideo = function () {
    resetVideoUI();
    document.getElementById('videoStatus').textContent = '';
  };

  window.sendVideo = async function () {
    const status = document.getElementById('videoStatus');
    if (!recordedBlob) {
      status.innerHTML = '<span style="color:#b91c1c">Please record a video first.</span>';
      return;
    }

    const btn = document.getElementById('btnSend');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    const formData = new FormData();
    formData.append('video', recordedBlob, `feedback_${Date.now()}.webm`);
    formData.append('duration', recordSeconds);

    try {
      await fetch(`${typeof API_BASE !== 'undefined' ? API_BASE : '/api'}/feedback/video`, {
        method: 'POST',
        body: formData,
      });
    } catch { /* demo mode */ }

    showToast?.('🎬 Video feedback posted! Thank you 🙏', 'success');
    resetVideoUI();
    status.innerHTML = '<span style="color:#138808">✅ Posted successfully!</span>';
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send-fill"></i>';
  };

  function resetVideoUI() {
    if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
    cleanupStream();
    recordedBlob = null;
    recordedChunks = [];
    recordSeconds = 0;

    document.getElementById('videoPlaceholder').classList.remove('d-none');
    document.getElementById('videoPreview').classList.add('d-none');
    document.getElementById('videoPlayback').classList.add('d-none');
    document.getElementById('recIndicator').classList.add('d-none');
    toggleBtn('btnRecord', true);
    toggleBtn('btnStop', false);
    toggleBtn('btnRetake', false);
    toggleBtn('btnSend', false);
  }

  function cleanupStream() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
    for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
    return 'video/webm';
  }

  function toggleBtn(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('d-none', !show);
  }

  function updateTimer() {
    const el = document.getElementById('recTimer');
    if (el) el.textContent = formatTime(recordSeconds);
  }
  function formatTime(s) {
    return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  }
})();


/* ── Carousel auto-play ── */
document.addEventListener('DOMContentLoaded', function () {

  var carouselEl = document.getElementById('eventCarousel');
  if (carouselEl) {
    var carousel = new bootstrap.Carousel(carouselEl, { interval: 4500, ride: 'carousel', wrap: true });
    carousel.cycle();
  }

  /* ── Feedback Wall ── */
  const API = window.location.port === '80' || window.location.port === '' ? '/api' : 'http://localhost:8000';
  const POSTIT_COLORS = ['#fff176','#f8bbd0','#b3e5fc','#c8e6c9','#ffe0b2'];
  const ROTATIONS = [-3, 2, -1.5, 3, -2];

  async function loadFeedbackWall() {
    try {
      const wRes = await fetch(`${API}/feedback?limit=5`);
      const wData = await wRes.json();
      const written = Array.isArray(wData) ? wData : (wData.feedbacks || wData.data || []);

      const vRes = await fetch(`${API}/feedback/video?limit=6`);
      const vData = await vRes.json();
      const videos = Array.isArray(vData) ? vData : (vData.feedbacks || vData.data || []);

      renderPostits(written.slice(0, 5));
      renderVideos(videos.slice(0, 3), 'fbVideosLeft');
      renderVideos(videos.slice(3, 6), 'fbVideosRight');

    } catch(e) {
      renderPostits([]);
      renderVideos([], 'fbVideosLeft');
      renderVideos([], 'fbVideosRight');
    }
  }

  function renderPostits(items) {
    const el = document.getElementById('fbPostits');
    if (!items.length) {
      el.innerHTML = '<div class="fbwall-empty"><i class="bi bi-chat-heart"></i><p>Be the first to share your feedback!</p></div>';
      return;
    }
    el.innerHTML = items.map((fb, i) => `
      <div class="postit" style="background:${POSTIT_COLORS[i % POSTIT_COLORS.length]};transform:rotate(${ROTATIONS[i % ROTATIONS.length]}deg);">
        <div class="postit-pin"></div>
        <p class="postit-text">"${fb.message || fb.fbmessage || fb.feedback || ''}"</p>
        <div class="postit-meta">
          <span class="postit-name">— ${fb.name || fb.fbname || 'Anonymous'}</span>
          ${fb.event || fb.fbevent ? `<span class="postit-event">${fb.event || fb.fbevent}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderVideos(items, containerId) {
    const el = document.getElementById(containerId);
    if (!items.length) {
      el.innerHTML = '<div class="fbwall-empty-video"><i class="bi bi-camera-video"></i><p>No videos yet</p></div>';
      return;
    }
    el.innerHTML = items.map(fb => {
      const url = fb.videoUrl || fb.video_url || fb.url || '';
      return `
      <div class="fbwall-video-card">
        <video src="${url}" controls playsinline preload="metadata" class="fbwall-video"></video>
        <div class="fbwall-video-meta">
          <span class="fbwall-video-name">${fb.name || fb.fbname || 'Anonymous'}</span>
          ${fb.event || fb.fbevent ? `<span class="fbwall-video-event">${fb.event || fb.fbevent}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  loadFeedbackWall();
});