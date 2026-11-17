(() => {
  'use strict';

  // =====================================================
  //  선생님 명단 (순서대로 audio 폴더의 call_00 ~ call_10 과 연결)
  //  - audio: 확장자를 뺀 파일 이름
  //  - 선생님을 추가/변경할 때는 이 목록만 고치면 됩니다.
  // =====================================================
  const TITLE = '선생님 호출';
  const TEMPLATE = '{name} 선생님 호출입니다';   // mp3가 없을 때 브라우저 TTS가 읽을 문구
  const AUDIO_DIR = 'audio';
  const AUDIO_EXT = 'mp3';                       // wav 등이면 여기만 바꾸세요

  const TEACHERS = [
    { name: '양장관', role: '물리',     audio: 'call_00' },
    { name: '김희연', role: '정보',     audio: 'call_01' },
    { name: '송창석', role: '수학',     audio: 'call_02' },
    { name: '임하은', role: '음악',     audio: 'call_03' },
    { name: '김은서', role: '생명과학', audio: 'call_04' },
    { name: '정우철', role: '체육',     audio: 'call_05' },
    { name: '고은화', role: '미술',     audio: 'call_06' },
    { name: '이윤정', role: '국어',     audio: 'call_07' },
    { name: '이은지', role: '역사',     audio: 'call_08' },
    { name: '윤영은', role: '영어',     audio: 'call_09' },
    { name: '진소라', role: '윤리',     audio: 'call_10' }
  ];

  // ---------- 기기별 설정 (이 브라우저에만 저장) ----------
  const STORAGE_KEY = 'teacher-call-settings-v3';
  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 0.9,
    volume: 1,
    repeat: 1,
    chime: true,
    pin: '1234'
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); return true; }
    catch (e) { return false; }
  }

  let settings = loadSettings();

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const grid = $('grid');
  const statusEl = $('status');

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls || '';
  }

  function audioUrl(t) {
    return `${AUDIO_DIR}/${encodeURIComponent(t.audio)}.${AUDIO_EXT}`;
  }

  function buildText(t) {
    return TEMPLATE.replace(/\{name\}/g, t.name);
  }

  // ---------- 소리 ----------
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
    if (settings.voiceURI) {
      const v = voices.find(v => v.voiceURI === settings.voiceURI);
      if (v) return v;
    }
    return getKoreanVoices()[0] || null;
  }

  function playChime() {
    return new Promise(resolve => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return resolve();
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const t0 = audioCtx.currentTime;
        const vol = Math.min(1, settings.volume) * 0.35;
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

  // mp3 재생: 성공하면 true, 파일이 없거나 오류면 false
  function playMp3(url) {
    return new Promise(resolve => {
      let settled = false;
      const done = ok => { if (!settled) { settled = true; resolve(ok); } };
      try {
        const a = new Audio(url);
        a.volume = Math.min(1, Math.max(0, Number(settings.volume) || 1));
        a.onended = () => done(true);
        a.onerror = () => done(false);
        const p = a.play();
        if (p && p.catch) p.catch(() => done(false));
        setTimeout(() => done(true), 20000); // 안전장치
      } catch (e) { done(false); }
    });
  }

  // 대체 수단: 브라우저 TTS
  function speakTts(text) {
    return new Promise(resolve => {
      if (!synth) return resolve(false);
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'ko-KR'; }
      u.rate = Number(settings.rate) || 1;
      u.volume = Math.min(1, Number(settings.volume) || 1);
      let done = false;
      const finish = ok => { if (!done) { done = true; resolve(ok); } };
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      synth.speak(u);
      setTimeout(() => finish(true), 10000);
    });
  }

  async function announce(t) {
    const times = Math.max(1, Number(settings.repeat) || 1);
    let useTts = false;
    for (let i = 0; i < times; i++) {
      let ok = false;
      if (!useTts) ok = await playMp3(audioUrl(t));
      if (!ok) {
        useTts = true;                       // mp3가 없으면 이후 반복도 TTS로
        if (synth) synth.cancel();
        await speakTts(buildText(t));
      }
      if (i < times - 1) await new Promise(r => setTimeout(r, 400));
    }
  }

  function releaseBusy() {
    busy = false;
    clearTimeout(busyTimer);
    document.querySelectorAll('.teacher').forEach(b => b.classList.remove('calling', 'locked'));
    setStatus('대기 중');
  }

  async function callTeacher(t, btn) {
    if (busy) return;
    busy = true;
    busyTimer = setTimeout(releaseBusy, 40000); // 안전장치

    document.querySelectorAll('.teacher').forEach(b => { if (b !== btn) b.classList.add('locked'); });
    btn.classList.add('calling');
    setStatus(`${t.name} 선생님을 호출하고 있습니다…`, 'active');

    try {
      if (settings.chime) await playChime();
      await announce(t);
    } finally {
      releaseBusy();
    }
  }

  // 첫 호출이 느리지 않도록 mp3를 미리 받아 둔다
  function warmAudioCache() {
    TEACHERS.forEach((t, i) => {
      setTimeout(() => { fetch(audioUrl(t)).catch(() => {}); }, 200 * i);
    });
  }

  // ---------- 화면 렌더링 ----------
  function render() {
    $('title').textContent = TITLE;
    document.title = TITLE;
    grid.innerHTML = '';
    TEACHERS.forEach(t => {
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
    if ($('pinInput').value === String(settings.pin)) {
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
    const current = settings.voiceURI;
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
      : '이 기기에는 한국어 TTS 음성이 없습니다. mp3 파일이 모두 있으면 문제없습니다.';
  }

  // audio 폴더에 call_00 ~ call_10 이 모두 있는지 확인
  async function checkAudioFiles() {
    const box = $('audioCheck');
    box.className = 'audiocheck';
    if (location.protocol === 'file:') {
      box.textContent = '파일로 직접 연 상태에서는 mp3 확인이 되지 않습니다. GitHub Pages 주소로 접속해 확인해 주세요.';
      return;
    }
    box.textContent = 'mp3 파일 확인 중…';
    const results = await Promise.all(TEACHERS.map(async t => {
      try {
        const res = await fetch(audioUrl(t), { method: 'HEAD', cache: 'no-cache' });
        return { t, ok: res.ok };
      } catch (e) { return { t, ok: false }; }
    }));
    const missing = results.filter(r => !r.ok).map(r => `${r.t.name}(${r.t.audio}.${AUDIO_EXT})`);
    if (!missing.length) {
      box.className = 'audiocheck ok';
      box.textContent = `✔ mp3 파일 ${results.length}개 모두 확인되었습니다.`;
    } else {
      box.className = 'audiocheck warn';
      box.textContent = `mp3 없음 ${missing.length}개: ${missing.join(', ')} — ` +
        '해당 선생님은 브라우저 TTS로 대신 읽습니다. audio 폴더와 파일 이름을 확인해 주세요.';
    }
  }

  function openSettings() {
    $('setVolume').value = settings.volume;
    $('setRate').value = settings.rate;
    $('setRepeat').value = String(settings.repeat);
    $('setChime').checked = !!settings.chime;
    $('setPin').value = settings.pin;
    $('volVal').textContent = settings.volume;
    $('rateVal').textContent = settings.rate;
    $('setError').textContent = '';
    fillVoiceSelect();
    settingsOverlay.classList.add('show');
    checkAudioFiles();
  }

  $('setVolume').addEventListener('input', e => { $('volVal').textContent = e.target.value; });
  $('setRate').addEventListener('input', e => { $('rateVal').textContent = e.target.value; });
  $('btnClose').addEventListener('click', () => settingsOverlay.classList.remove('show'));

  $('btnTest').addEventListener('click', async () => {
    const t = TEACHERS[0];
    // 입력 중인 값으로 임시 테스트
    const backup = Object.assign({}, settings);
    settings.volume = Number($('setVolume').value);
    settings.rate = Number($('setRate').value);
    settings.voiceURI = $('setVoice').value;
    settings.chime = $('setChime').checked;
    try {
      if (settings.chime) await playChime();
      await announce(t);
    } finally {
      settings = backup;
    }
  });

  $('btnSave').addEventListener('click', () => {
    const pin = $('setPin').value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      $('setError').textContent = 'PIN은 숫자 4~8자리로 입력해 주세요.';
      return;
    }
    settings.volume = Number($('setVolume').value);
    settings.rate = Number($('setRate').value);
    settings.repeat = Number($('setRepeat').value);
    settings.chime = $('setChime').checked;
    settings.voiceURI = $('setVoice').value;
    settings.pin = pin;

    if (!saveSettings()) {
      $('setError').textContent = '저장소를 사용할 수 없어 이번 실행 동안만 적용됩니다.';
    } else {
      settingsOverlay.classList.remove('show');
    }
  });

  $('btnReset').addEventListener('click', () => {
    if (!confirm('이 기기의 설정을 모두 초기화할까요?')) return;
    settings = Object.assign({}, DEFAULT_SETTINGS);
    saveSettings();
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
  if (synth) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = loadVoices;
  }
  render();
  setStatus('대기 중');
  warmAudioCache();
})();
