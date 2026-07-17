/**
 * Ekalavya Performing Arts — script.js
 */
// Uses nginx proxy on Docker (:80), direct on local dev (:3000/:8000)
const API_BASE = window.location.port === '80' || window.location.port === '' ? '/api' : 'http://localhost:8000';

// Turns a FastAPI error body into readable text — `detail` can be a plain
// string or (on 422 validation errors) an array of {loc, msg} objects.
function formatApiError(data, fallback) {
  const detail = data && data.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map(d => {
        if (typeof d === 'string') return d;
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : '';
        const hideField = !field || field === '__root__' || field === 'body';
        return hideField ? d.msg : `${field}: ${d.msg}`;
      })
      .filter(Boolean)
      .join(' | ') || fallback;
  }
  return fallback;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ══════════════════════════════════════════
// HERO CAROUSEL — admin-managed slides (Content tab in the admin panel).
// Falls back to the static slides already in the HTML below if the API
// returns none, so the homepage is never left with an empty carousel.
// ══════════════════════════════════════════
(async function loadHeroCarousel() {
  const CATEGORY_LABELS = { EPA: 'Ekalavya Performing Arts', PWP: 'Picture Wicture Productions' };
  try {
    const res = await fetch(`${API_BASE}/carousel/active`);
    if (!res.ok) return;
    const slides = await res.json();
    if (!Array.isArray(slides) || slides.length === 0) return;

    const indicators = document.getElementById('carouselIndicators');
    const inner = document.getElementById('carouselInner');
    const carouselEl = document.getElementById('eventCarousel');
    if (!indicators || !inner || !carouselEl) return;

    indicators.innerHTML = slides.map((_, i) =>
      `<button type="button" data-bs-target="#eventCarousel" data-bs-slide-to="${i}" class="${i === 0 ? 'active' : ''}"></button>`
    ).join('');

    inner.innerHTML = slides.map((s, i) => {
      const metaParts = [];
      if (s.event_date) {
        const d = new Date(s.event_date);
        if (!isNaN(d.getTime())) metaParts.push(`<i class="bi bi-calendar3"></i> ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`);
      }
      if (s.venue) metaParts.push(`<i class="bi bi-geo-alt-fill"></i> ${escapeHtml(s.venue)}`);
      const meta = metaParts.length ? `<p class="hero-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</p>` : '';
      const desc = s.description ? `<p>${escapeHtml(s.description)}</p>` : '';
      const cta = s.booking_url
        ? `<a class="btn btn-hero" href="${escapeHtml(s.booking_url)}" target="_blank" rel="noopener">Book Your Ticket</a>`
        : `<button class="btn btn-hero" disabled>Book Your Ticket - Opening Soon</button>`;
      return `
        <div class="carousel-item ${i === 0 ? 'active' : ''}">
          <div class="hero-slide kotha-slide" style="background-color:#110010;background-image:linear-gradient(135deg,#0f0f1a 0%,#2a0020 100%);">
            <div class="kotha-text hero-content">
              <span class="hero-tag">${escapeHtml(CATEGORY_LABELS[s.category] || s.category)}</span>
              <h2>${escapeHtml(s.show_name)}</h2>
              ${desc}
              ${meta}
              ${cta}
            </div>
            <div class="kotha-image">
              <img src="${s.poster_image}" alt="${escapeHtml(s.show_name)}">
            </div>
          </div>
        </div>`;
    }).join('');

    // Re-init the Bootstrap Carousel now that its slides changed under it
    if (window.bootstrap?.Carousel) {
      bootstrap.Carousel.getInstance(carouselEl)?.dispose();
      new bootstrap.Carousel(carouselEl, { interval: 4500, ride: 'carousel' });
    }
  } catch { /* network/parse error — keep the static fallback slides */ }
})();

// ══════════════════════════════════════════
// RECENT PERFORMANCES — admin-managed (Content tab in the admin panel).
// Falls back to the static cards already in the HTML below if the API
// returns none. Paginates 6 per page once there are more than that.
// ══════════════════════════════════════════
(async function loadPerformances() {
  const CATEGORY_LABELS = { EPA: 'Ekalavya Performing Arts', PWP: 'Picture Wicture Productions' };
  const PER_PAGE = 6;
  let items = [];
  let page = 0;

  function renderPage() {
    const grid = document.getElementById('performancesGrid');
    const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
    page = Math.min(page, totalPages - 1);
    const pageItems = items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

    grid.innerHTML = pageItems.map(p => {
      const desc = p.description ? `<p>${escapeHtml(p.description)}</p>` : '';
      const location = p.location ? `<span class="perf-venue"><i class="bi bi-geo-alt"></i> ${escapeHtml(p.location)}</span>` : '';
      const catClass = p.category === 'PWP' ? 'cat-pwp' : 'cat-epa';
      return `
        <div class="col-md-6 col-lg-4"><div class="perf-card">
          <div class="ratio ratio-16x9"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(p.youtube_video_id)}" title="${escapeHtml(p.title)}" allowfullscreen></iframe></div>
          <div class="perf-info">
            <h5>${escapeHtml(p.title)}</h5>
            ${desc}
            ${location}
            <span class="perf-category ${catClass}">${escapeHtml(CATEGORY_LABELS[p.category] || p.category)}</span>
          </div>
        </div></div>`;
    }).join('');

    const pagination = document.getElementById('performancesPagination');
    pagination.classList.toggle('d-none', items.length <= PER_PAGE);
    document.getElementById('perfPageIndicator').textContent = `${page + 1} / ${totalPages}`;
    document.getElementById('perfPrev').disabled = page === 0;
    document.getElementById('perfNext').disabled = page >= totalPages - 1;
  }

  document.getElementById('perfPrev')?.addEventListener('click', () => { if (page > 0) { page--; renderPage(); } });
  document.getElementById('perfNext')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
    if (page < totalPages - 1) { page++; renderPage(); }
  });

  try {
    const res = await fetch(`${API_BASE}/performances`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return;
    items = data;
    renderPage();
  } catch { /* network/parse error — keep the static fallback cards */ }
})();

// ══════════════════════════════════════════
// ANNOUNCEMENT BANNER — admin-managed (Content tab in the admin panel).
// Fetches GET /announcement; if active with a message, renders the chosen
// particle effect and shows the badge. Dismissal is remembered per visitor
// keyed by the message text itself, so editing the message re-shows the
// banner even to people who already dismissed the old one.
// ══════════════════════════════════════════
(async function loadAnnouncementBanner() {
  const DISMISS_KEY = 'eka_announcement_dismissed';
  const overlay = document.getElementById('bdayOverlay');
  if (!overlay) return;

  const EFFECT_EMOJI = { balloons: '🎈', sparkle: '✨', rain: '🌧️', confetti: '🎉', snow: '❄️', crackers: '🎆', hearts: '💕', none: '📢' };
  const EFFECT_PARTICLE_COUNT = { balloons: 8, sparkle: 24, rain: 40, confetti: 30, snow: 26, hearts: 20 };
  const PARTICLE_COLORS = ['#8B0000', '#d4a017', '#2f7d6b', '#c9628a', '#3a6ea5'];

  function renderParticles(effect) {
    const layer = document.getElementById('bdayEffectLayer');
    if (!layer) return;
    if (effect === 'crackers') { renderCrackerBursts(layer); return; }
    const count = EFFECT_PARTICLE_COUNT[effect] || 0;
    if (count === 0) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = `eka-particle eka-particle--${effect}`;
      el.style.left = `${Math.random() * 100}%`;
      el.style.animationDelay = `${(Math.random() * 6).toFixed(2)}s`;
      el.style.animationDuration = `${(6 + Math.random() * 8).toFixed(2)}s`;
      if (effect === 'balloons' || effect === 'confetti' || effect === 'hearts') {
        const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
        el.style.setProperty('--eka-color', color);
        el.style.setProperty('--eka-color-light', color);
      }
      frag.appendChild(el);
    }
    layer.appendChild(frag);
  }

  // Fireworks: several bursts, each a ring of sparks sharing one origin point
  // and one animation delay — --eka-dx/--eka-dy (per-spark endpoint offsets)
  // are what makes them radiate outward instead of just drifting like the
  // other effects.
  function renderCrackerBursts(layer) {
    const BURSTS = 6;
    const SPARKS_PER_BURST = 12;
    const frag = document.createDocumentFragment();
    for (let b = 0; b < BURSTS; b++) {
      const originLeft = 10 + Math.random() * 80;
      const originTop = 10 + Math.random() * 40;
      const delay = (b * 1.4 + Math.random() * 0.6).toFixed(2);
      const duration = (1.1 + Math.random() * 0.4).toFixed(2);
      const color = PARTICLE_COLORS[b % PARTICLE_COLORS.length];
      for (let s = 0; s < SPARKS_PER_BURST; s++) {
        const angle = (360 / SPARKS_PER_BURST) * s + (Math.random() * 12 - 6);
        const dist = 45 + Math.random() * 35;
        const rad = angle * Math.PI / 180;
        const el = document.createElement('span');
        el.className = 'eka-particle eka-particle--crackers';
        el.style.left = `${originLeft}%`;
        el.style.top = `${originTop}%`;
        el.style.animationDelay = `${delay}s`;
        el.style.animationDuration = `${duration}s`;
        el.style.setProperty('--eka-color', color);
        el.style.setProperty('--eka-dx', `${(Math.cos(rad) * dist).toFixed(1)}px`);
        el.style.setProperty('--eka-dy', `${(Math.sin(rad) * dist).toFixed(1)}px`);
        frag.appendChild(el);
      }
    }
    layer.appendChild(frag);
  }

  try {
    const res = await fetch(`${API_BASE}/announcement`);
    if (!res.ok) { overlay.remove(); return; }
    const cfg = await res.json();
    if (!cfg || !cfg.active || !cfg.message) { overlay.remove(); return; }
    // Fingerprint includes updated_at, not just the message text, so any
    // admin Save — even re-activating with the exact same wording — clears
    // prior dismissals instead of staying hidden for people who saw it before.
    const fingerprint = `${cfg.updated_at || ''}|${cfg.message}`;
    if (localStorage.getItem(DISMISS_KEY) === fingerprint) { overlay.remove(); return; }

    document.getElementById('bdayBadgeText').textContent = cfg.message;
    document.getElementById('bdayBadgeEmoji').textContent = EFFECT_EMOJI[cfg.effect] || '📢';
    renderParticles(cfg.effect);

    window.dismissBdayOverlay = function () {
      localStorage.setItem(DISMISS_KEY, fingerprint);
      overlay.classList.add('bday-overlay-hide');
      setTimeout(() => overlay.remove(), 400);
    };
  } catch {
    overlay.remove();
  }
})();

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
// DATE OF BIRTH → auto-calculated Age + conditional Parent's Name
// ══════════════════════════════════════════
const dobInput          = document.getElementById('dobInput');
const ageField           = document.getElementById('ageField');
const parentNameWrapper  = document.getElementById('parentNameWrapper');
const parentNameInput    = document.getElementById('parentNameInput');

function calculateAge(dobStr) {
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// Note: parent_name is intentionally never marked `required` in the DOM —
// it's conditionally hidden, and a hidden required field breaks native
// checkValidity()/reportValidity(). The <18 requirement is instead enforced
// explicitly in the submit handler below.
function updateAgeAndParentField() {
  const age = calculateAge(dobInput?.value);
  if (age === null || age < 0) {
    ageField.value = '';
    parentNameWrapper.classList.add('d-none');
    return;
  }
  ageField.value = age;
  if (age < 18) {
    parentNameWrapper.classList.remove('d-none');
  } else {
    parentNameWrapper.classList.add('d-none');
    parentNameInput.value = '';
  }
}

dobInput?.addEventListener('change', updateAgeAndParentField);
dobInput?.addEventListener('input', updateAgeAndParentField);

// ══════════════════════════════════════════
// JOIN US — opens registration directly, no login
// ══════════════════════════════════════════
window.openRegistrationDirect = function () {
  const alertEl = document.getElementById('formAlert');
  if (alertEl) { alertEl.className = 'alert d-none'; alertEl.textContent = ''; }
  document.getElementById('registrationForm')?.reset();
  document.querySelectorAll('.rating-badge').forEach(b => b.textContent = '5');
  updateAgeAndParentField();
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

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        ok = true;
      } else {
        errBox.textContent = formatApiError(data, 'Invalid credentials.');
        errBox.classList.remove('d-none');
      }
    } catch {
      errBox.textContent = 'Could not reach the server. Please try again.';
      errBox.classList.remove('d-none');
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

    const age = calculateAge(form.dob.value);
    if (age === null || age < 0) {
      alertEl.className = 'alert alert-warning';
      alertEl.textContent = 'Please enter a valid Date of Birth.';
      alertEl.classList.remove('d-none');
      return;
    }
    if (age < 5 || age > 100) {
      alertEl.className = 'alert alert-warning';
      alertEl.textContent = 'Age calculated from Date of Birth must be between 5 and 100.';
      alertEl.classList.remove('d-none');
      return;
    }
    if (age < 18 && !form.parent_name.value.trim()) {
      alertEl.className = 'alert alert-warning';
      alertEl.textContent = "Please enter the Parent's / Guardian's Name (required for registrants under 18).";
      alertEl.classList.remove('d-none');
      return;
    }

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
      parent_name:       form.parent_name.value || undefined,
      phone:             form.phone.value,
      email:             form.email.value,
      age:               age,
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

    let ok = false;
    let errMsg = 'Something went wrong submitting your registration. Please try again in a moment.';
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        ok = true;
      } else {
        const data = await res.json().catch(() => ({}));
        errMsg = formatApiError(data, errMsg);
      }
    } catch { /* network error — errMsg stays as generic fallback */ }

    if (ok) {
      alertEl.className = 'alert alert-success';
      alertEl.innerHTML = `🎉 Your request for joining is successfully submitted. EPA PWP team will get back to you in the next business day.`;
      alertEl.classList.remove('d-none');
      form.reset();
      document.querySelectorAll('.rating-badge').forEach(b => b.textContent = '5');

      setTimeout(() => {
        closeModal('registerModal');
        showToast('Request submitted! EPA PWP team will get back to you in the next business day 🎭', 'success');
      }, 2800);
    } else {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = errMsg;
      alertEl.classList.remove('d-none');
    }

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
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const btn  = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';
    let ok = false;
    let errMsg = 'Something went wrong submitting your feedback. Please try again in a moment.';
    try {
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.fbname.value, email: form.fbemail.value, event: form.fbevent.value, message: form.fbmessage.value }),
      });
      if (res.ok) {
        ok = true;
      } else {
        const data = await res.json().catch(() => ({}));
        errMsg = formatApiError(data, errMsg);
      }
    } catch { /* network error — errMsg stays as generic fallback */ }

    if (ok) {
      showToast('Thank you for your feedback! 🙏', 'success');
      form.reset();
    } else {
      showToast(errMsg, 'error');
    }
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
window.updateRating = (slider, id) => {
  const el = document.getElementById(id);
  if (el) el.textContent = slider.value;
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty('--val', `${pct}%`);
};
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
let countdownTimer = null;
const MAX_SECONDS = 120; // 2-minute limit
const COUNTDOWN_SECONDS = 5;

window.startRecording = async function () {
  const status = document.getElementById('videoStatus');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    status.innerHTML = '<span class="text-danger">\u26a0\ufe0f Camera/microphone access denied. Please allow access in your browser settings.</span>';
    return;
  }

  const preview = document.getElementById('videoPreview');
  document.getElementById('videoPlaceholder').classList.add('d-none');
  document.getElementById('videoPlayback').classList.add('d-none');
  preview.classList.remove('d-none');
  preview.srcObject = stream;

  // Hide the record button immediately so it can't be double-clicked while
  // the pre-roll countdown is running (mediaRecorder doesn't exist yet).
  document.getElementById('btnRecord').classList.add('d-none');
  status.textContent = 'Get ready...';

  runCountdown(COUNTDOWN_SECONDS, beginActualRecording);
};

function runCountdown(seconds, onDone) {
  const overlay = document.getElementById('recCountdown');
  const numEl = document.getElementById('recCountdownNum');
  let remaining = seconds;

  overlay.classList.remove('d-none');
  numEl.textContent = remaining;
  restartCountdownPop(numEl);

  countdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      overlay.classList.add('d-none');
      onDone();
      return;
    }
    numEl.textContent = remaining;
    restartCountdownPop(numEl);
  }, 1000);
}

function restartCountdownPop(el) {
  el.style.animation = 'none';
  void el.offsetWidth; // force reflow so the animation replays each tick
  el.style.animation = '';
}

function beginActualRecording() {
  const status = document.getElementById('videoStatus');
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = handleRecordingStop;
  mediaRecorder.start();

  document.getElementById('btnStop').classList.remove('d-none');
  document.getElementById('btnRetake').classList.add('d-none');
  document.getElementById('btnSend').classList.add('d-none');

  document.getElementById('recIndicator').classList.remove('d-none');
  recordSeconds = 0;
  updateTimer();
  recordTimer = setInterval(() => {
    recordSeconds++;
    updateTimer();
    if (recordSeconds >= MAX_SECONDS) stopRecording();
  }, 1000);

  status.textContent = '\ud83d\udd34 Recording...';
}

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

  document.getElementById('btnRecord').classList.add('d-none');
  document.getElementById('btnStop').classList.add('d-none');
  document.getElementById('btnRetake').classList.remove('d-none');
  document.getElementById('btnSend').classList.remove('d-none');

  document.getElementById('videoStatus').innerHTML = `\u2705 Recorded ${formatTime(recordSeconds)}. Preview above, then click <strong>send</strong> to post.`;
}

window.retakeVideo = function () {
  resetVideoUI();
  document.getElementById('videoStatus').textContent = '';
};

window.sendVideo = async function () {
  const name = document.getElementById('vbName').value.trim();
  const status = document.getElementById('videoStatus');

  if (!name) {
    status.innerHTML = '<span class="text-danger">Please enter your name above.</span>';
    return;
  }
  if (!recordedBlob) {
    status.innerHTML = '<span class="text-danger">Please record a video first.</span>';
    return;
  }

  const btn = document.getElementById('btnSend');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  const formData = new FormData();
  formData.append('name', name);
  formData.append('video', recordedBlob, `feedback_${Date.now()}.webm`);
  formData.append('duration', recordSeconds);

  try {
    const res = await fetch(`${API_BASE}/feedback/video`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      showToast('\ud83c\udfac Video feedback sent! Thank you \ud83d\ude4f', 'success');
      resetVideoUI();
      document.getElementById('vbName').value = '';
      status.innerHTML = '<span class="text-success">\u2705 Sent successfully! It will appear on the site once approved.</span>';
    } else {
      const data = await res.json().catch(() => ({}));
      status.innerHTML = `<span class="text-danger">${data.detail || 'Something went wrong sending your video. Please try again.'}</span>`;
    }
  } catch {
    status.innerHTML = '<span class="text-danger">Could not reach the server. Please try again.</span>';
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-send-fill"></i>';
};

function resetVideoUI() {
  if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  cleanupStream();
  recordedBlob = null;
  recordedChunks = [];
  recordSeconds = 0;

  document.getElementById('videoPlaceholder').classList.remove('d-none');
  document.getElementById('videoPreview').classList.add('d-none');
  document.getElementById('videoPlayback').classList.add('d-none');
  document.getElementById('recIndicator').classList.add('d-none');
  document.getElementById('recCountdown').classList.add('d-none');
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
  const el = document.getElementById('recTimer');
  if (el) el.textContent = formatTime(recordSeconds);
}
function formatTime(s) {
  return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
}


/* ── Carousel auto-play ── */
document.addEventListener('DOMContentLoaded', function () {

  var carouselEl = document.getElementById('eventCarousel');
  if (carouselEl) {
    var carousel = new bootstrap.Carousel(carouselEl, { interval: 4500, ride: 'carousel', wrap: true });
    carousel.cycle();
  }

  /* ── Feedback Wall ── */
  const API = window.location.port === '80' || window.location.port === '' ? '/api' : 'http://localhost:8000';
  const POSTIT_COLORS = ['#fff176','#f8bbd0','#b3e5fc','#c8e6c9','#ffe0b2','#d1c4e9'];
  const ROTATIONS = [-3, 2, -1.5, 3, -2, 1.5];
  const POSTITS_PER_PAGE = 6;
  const VIDEOS_PER_PAGE = 6;
  let allPostits = [];
  let postitsPage = 0;
  let allVideos = [];
  let videosPage = 0;

  async function loadFeedbackWall() {
    try {
      const wRes = await fetch(`${API}/feedback/approved?limit=50`);
      const wData = await wRes.json();
      allPostits = Array.isArray(wData) ? wData : (wData.feedbacks || wData.data || []);
      postitsPage = 0;
      renderPostitsPage();
    } catch(e) {
      allPostits = [];
      renderPostitsPage();
    }

    try {
      const vRes = await fetch(`${API}/feedback/video/approved?limit=50`);
      const vData = await vRes.json();
      allVideos = Array.isArray(vData) ? vData : (vData.feedbacks || vData.data || []);
      videosPage = 0;
      renderVideosPage();
    } catch(e) {
      allVideos = [];
      renderVideosPage();
    }
  }

  function renderVideosPage() {
    const totalPages = Math.max(1, Math.ceil(allVideos.length / VIDEOS_PER_PAGE));
    videosPage = Math.min(videosPage, totalPages - 1);
    const pageItems = allVideos.slice(videosPage * VIDEOS_PER_PAGE, videosPage * VIDEOS_PER_PAGE + VIDEOS_PER_PAGE);
    renderVideos(pageItems.slice(0, 3), 'fbVideosLeft');
    renderVideos(pageItems.slice(3, 6), 'fbVideosRight');

    const pagination = document.getElementById('fbVideosPagination');
    pagination.classList.toggle('d-none', allVideos.length <= VIDEOS_PER_PAGE);
    document.getElementById('fbVideosPageIndicator').textContent = `${videosPage + 1} / ${totalPages}`;
    document.getElementById('fbVideosPrev').disabled = videosPage === 0;
    document.getElementById('fbVideosNext').disabled = videosPage >= totalPages - 1;
    updatePaginationDivider();
  }

  function updatePaginationDivider() {
    const videosVisible = !document.getElementById('fbVideosPagination').classList.contains('d-none');
    const postitsVisible = !document.getElementById('fbPostitsPagination').classList.contains('d-none');
    document.getElementById('fbwallPaginationDivider').classList.toggle('d-none', !(videosVisible && postitsVisible));
  }

  document.getElementById('fbVideosPrev')?.addEventListener('click', () => {
    if (videosPage > 0) { videosPage--; renderVideosPage(); }
  });
  document.getElementById('fbVideosNext')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(allVideos.length / VIDEOS_PER_PAGE));
    if (videosPage < totalPages - 1) { videosPage++; renderVideosPage(); }
  });

  function renderPostitsPage() {
    const totalPages = Math.max(1, Math.ceil(allPostits.length / POSTITS_PER_PAGE));
    postitsPage = Math.min(postitsPage, totalPages - 1);
    const pageItems = allPostits.slice(postitsPage * POSTITS_PER_PAGE, postitsPage * POSTITS_PER_PAGE + POSTITS_PER_PAGE);
    renderPostits(pageItems);

    const pagination = document.getElementById('fbPostitsPagination');
    pagination.classList.toggle('d-none', allPostits.length <= POSTITS_PER_PAGE);
    document.getElementById('fbPostitsPageIndicator').textContent = `${postitsPage + 1} / ${totalPages}`;
    document.getElementById('fbPostitsPrev').disabled = postitsPage === 0;
    document.getElementById('fbPostitsNext').disabled = postitsPage >= totalPages - 1;
    updatePaginationDivider();
  }

  document.getElementById('fbPostitsPrev')?.addEventListener('click', () => {
    if (postitsPage > 0) { postitsPage--; renderPostitsPage(); }
  });
  document.getElementById('fbPostitsNext')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(allPostits.length / POSTITS_PER_PAGE));
    if (postitsPage < totalPages - 1) { postitsPage++; renderPostitsPage(); }
  });

  function renderPostits(items) {
    const el = document.getElementById('fbPostits');
    if (!items.length) {
      el.innerHTML = '<div class="fbwall-empty"><i class="bi bi-chat-heart"></i><p>Be the first to share your feedback!</p></div>';
      return;
    }
    el.innerHTML = items.map((fb, i) => `
      <div class="postit" style="background:${POSTIT_COLORS[i % POSTIT_COLORS.length]};transform:rotate(${ROTATIONS[i % ROTATIONS.length]}deg);">
        <div class="postit-pin"></div>
        <div class="postit-meta">
          <span class="postit-name">${fb.name || fb.fbname || 'Anonymous'}</span>
          ${fb.event || fb.fbevent ? `<span class="postit-event">${fb.event || fb.fbevent}</span>` : ''}
        </div>
        <p class="postit-text">"${fb.message || fb.fbmessage || fb.feedback || ''}"</p>
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
      const videoId = fb.youtube_video_id || '';
      return `
      <div class="fbwall-video-card">
        <div class="ratio ratio-16x9">
          <iframe src="https://www.youtube.com/embed/${videoId}" title="${fb.name || 'Video feedback'}" class="fbwall-video" allowfullscreen></iframe>
        </div>
        <div class="fbwall-video-meta">
          <span class="fbwall-video-name">${fb.name || 'Anonymous'}</span>
        </div>
      </div>`;
    }).join('');
  }

  loadFeedbackWall();
});