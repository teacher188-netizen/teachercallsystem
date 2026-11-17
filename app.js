(() => {
  'use strict';

  const STORAGE_KEY = 'teacher-call-app-v1';

  const DEFAULTS = {
    title: '선생님 호출',
    teachers: [
      { name: '양장관', role: '물리' },
      { name: '김희연', role: '정보' },
      { name: '송창석', role: '수학' },
      { name: '임하은', role: '음악' },
      { name: '김은서', role: '생명과학' },
      { name: '정우철', role: '체육' },
      { name: '고은화', role: '미술' },
      { name: '이윤정', role: '국어' },
      { name: '이은지', role: '역사' },
      { name: '윤영은', role: '영어' },
      { name: '진소라', role: '윤리' }
    ],
    settings: {
      template: '{name} 선생님',
      voiceURI: '',
      rate: 0.9,
      volume: 1,
      repeat: 1,
      chime: true,
      pin: '1234'
    }
  };

  // ---------- 저장/불러오기 ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return {
          title: d.title || DEFAULTS.title,
          teachers: Array.isArray(d.teachers) ? d.teachers : clone(DEFAULTS.teachers),
          settings: Object.assign({}, DEFAULTS.settings, d.settings || {})
        };
      }
    } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
    return clone(DEFAULTS);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  let state = load();

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const grid = $('grid');
  const statusEl = $('status');
  const titleEl = $('title');

  // ---------- TTS ----------
  const synth = window.speechSynthesis;
  let voices = [];
  let busy = false;
  let busyTimer = null;
  let audioCtx = null;

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices();
    fillVoiceSelect();
  }

  function getKoreanVoices() {
    return voices.filter(v => /^ko/i.test(v.lang) || /korean|한국/i.test(v.name));
  }

  function pickVoice() {
    if (!voices.length) return null;
    if (state.settings.voiceURI) {
      const v = voices.find(v => v.voiceURI === state.settings.voiceURI);
      if (v) return v;
    }
    const ko = getKoreanVoices();
    return ko[0] || null;
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls || '';
  }

  function playChime() {
    return new Promise(resolve => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return resolve();
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const t0 = audioCtx.currentTime;
        const vol = Math.min(1, state.settings.volume) * 0.35;
        [[880, 0], [659.25, 0.4]].forEach(([freq, offset]) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t0 + offset);
          gain.gain.exponentialRampToValueAtTime(vol, t0 + offset + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.7);
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(t0 + offset);
          osc.stop(t0 + offset + 0.75);
        });
        setTimeout(resolve, 900);
      } catch (e) { resolve(); }
    });
  }

  function buildText(name) {
    const tpl = state.settings.template || '{name} 선생님';
    return tpl.replace(/\{name\}/g, name);
  }

  function speakOnce(text) {
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'ko-KR'; }
      u.rate = Number(state.settings.rate) || 1;
      u.volume = Number(state.settings.volume) || 1;
      u.pitch = 1;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
      // 일부 브라우저에서 onend가 오지 않는 경우 대비
      setTimeout(finish, 10000);
    });
  }

  function releaseBusy() {
    busy = false;
    clearTimeout(busyTimer);
    document.querySelectorAll('.teacher').forEach(b => b.classList.remove('calling', 'locked'));
    setStatus('대기 중');
  }

  async function callTeacher(teacher, btn) {
    if (!synth) {
      setStatus('이 브라우저는 음성 출력(TTS)을 지원하지 않습니다.', 'warn');
      return;
    }
    if (busy) return;
    busy = true;
    busyTimer = setTimeout(releaseBusy, 30000); // 안전장치

    synth.cancel();
    document.querySelectorAll('.teacher').forEach(b => { if (b !== btn) b.classList.add('locked'); });
    btn.classList.add('calling');
    setStatus(`${teacher.name} 선생님을 호출하고 있습니다…`, 'active');

    try {
      if (state.settings.chime) await playChime();
      const text = buildText(teacher.name);
      const times = Math.max(1, Number(state.settings.repeat) || 1);
      for (let i = 0; i < times; i++) {
        await speakOnce(text);
        if (i < times - 1) await new Promise(r => setTimeout(r, 400));
      }
    } finally {
      releaseBusy();
    }
  }

  // ---------- 화면 렌더링 ----------
  function render() {
    titleEl.textContent = state.title;
    document.title = state.title;
    grid.innerHTML = '';
    if (!state.teachers.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = '등록된 선생님이 없습니다. 오른쪽 위 ⚙ 에서 추가해 주세요.';
      grid.appendChild(d);
      return;
    }
    state.teachers.forEach(t => {
      const b = document.createElement('button');
      b.className = 'teacher';
      b.type = 'button';
      const n = document.createElement('span');
      n.className = 'name';
      n.textContent = t.name;
      b.appendChild(n);
      if (t.role) {
        const r = document.createElement('span');
        r.className = 'role';
        r.textContent = t.role;
        b.appendChild(r);
      }
      b.addEventListener('click', () => callTeacher(t, b));
      grid.appendChild(b);
    });
  }

  // ---------- 관리자 ----------
  const pinOverlay = $('pinOverlay');
  const settingsOverlay = $('settingsOverlay');

  $('gear').addEventListener('click', () => {
    $('pinInput').value = '';
    $('pinError').textContent = '';
    pinOverlay.classList.add('show');
    setTimeout(() => $('pinInput').focus(), 50);
  });
  $('pinCancel').addEventListener('click', () => pinOverlay.classList.remove('show'));

  function submitPin() {
    if ($('pinInput').value === String(state.settings.pin)) {
      pinOverlay.classList.remove('show');
      openSettings();
    } else {
      $('pinError').textContent = 'PIN 번호가 맞지 않습니다.';
      $('pinInput').value = '';
    }
  }
  $('pinOk').addEventListener('click', submitPin);
  $('pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

  function fillVoiceSelect() {
    const sel = $('setVoice');
    if (!sel) return;
    const current = state.settings.voiceURI;
    sel.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = '자동 (한국어 음성 우선)';
    sel.appendChild(auto);

    const ko = getKoreanVoices();
    const others = voices.filter(v => !ko.includes(v));
    [...ko, ...others].forEach(v => {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(o);
    });
    sel.value = current;
    if (sel.value !== current) sel.value = '';

    $('voiceHint').textContent = ko.length
      ? ''
      : '한국어 음성이 설치되어 있지 않습니다. 기기의 음성 설정에서 한국어 TTS를 설치해 주세요.';
  }

  function openSettings() {
    $('setTitle').value = state.title;
    $('setTeachers').value = state.teachers
      .map(t => t.role ? `${t.name}, ${t.role}` : t.name).join('\n');
    $('setTemplate').value = state.settings.template;
    $('setRate').value = state.settings.rate;
    $('setVolume').value = state.settings.volume;
    $('setRepeat').value = String(state.settings.repeat);
    $('setChime').checked = !!state.settings.chime;
    $('setPin').value = state.settings.pin;
    $('rateVal').textContent = state.settings.rate;
    $('volVal').textContent = state.settings.volume;
    $('setError').textContent = '';
    fillVoiceSelect();
    settingsOverlay.classList.add('show');
  }

  $('setRate').addEventListener('input', e => { $('rateVal').textContent = e.target.value; });
  $('setVolume').addEventListener('input', e => { $('volVal').textContent = e.target.value; });
  $('btnClose').addEventListener('click', () => settingsOverlay.classList.remove('show'));

  $('btnTest').addEventListener('click', async () => {
    if (!synth) { $('setError').textContent = '이 브라우저는 TTS를 지원하지 않습니다.'; return; }
    // 현재 입력값으로 임시 테스트
    const backup = clone(state.settings);
    state.settings.template = $('setTemplate').value || '{name} 선생님';
    state.settings.voiceURI = $('setVoice').value;
    state.settings.rate = Number($('setRate').value);
    state.settings.volume = Number($('setVolume').value);
    synth.cancel();
    const sample = (state.teachers[0] && state.teachers[0].name) || '김민수';
    if ($('setChime').checked) { state.settings.chime = true; await playChime(); }
    await speakOnce(buildText(sample));
    state.settings = backup;
  });

  $('btnSave').addEventListener('click', () => {
    const teachers = $('setTeachers').value
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const idx = l.search(/[,，]/);
        if (idx === -1) return { name: l, role: '' };
        return { name: l.slice(0, idx).trim(), role: l.slice(idx + 1).trim() };
      })
      .filter(t => t.name);

    const pin = $('setPin').value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      $('setError').textContent = 'PIN은 숫자 4~8자리로 입력해 주세요.';
      return;
    }

    state.title = $('setTitle').value.trim() || DEFAULTS.title;
    state.teachers = teachers;
    state.settings.template = $('setTemplate').value.trim() || '{name} 선생님';
    state.settings.voiceURI = $('setVoice').value;
    state.settings.rate = Number($('setRate').value);
    state.settings.volume = Number($('setVolume').value);
    state.settings.repeat = Number($('setRepeat').value);
    state.settings.chime = $('setChime').checked;
    state.settings.pin = pin;

    if (!save()) {
      $('setError').textContent = '저장소를 사용할 수 없어 이번 실행 동안만 적용됩니다.';
    } else {
      settingsOverlay.classList.remove('show');
    }
    render();
  });

  $('btnReset').addEventListener('click', () => {
    if (!confirm('모든 설정과 선생님 목록을 초기화할까요?')) return;
    state = clone(DEFAULTS);
    save();
    render();
    openSettings();
  });

  // ---------- 키오스크 편의 ----------
  document.addEventListener('contextmenu', e => {
    if (!e.target.closest('.modal')) e.preventDefault();
  });
  // 더블탭 확대 방지
  let lastTouch = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouch < 300 && !e.target.closest('.modal')) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  // ---------- 시작 ----------
  if (!synth) {
    setStatus('이 브라우저는 음성 출력(TTS)을 지원하지 않습니다. 최신 Chrome/Edge를 사용해 주세요.', 'warn');
  } else {
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = loadVoices;
  }
  render();
})();
