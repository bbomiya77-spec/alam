/**
 * 16:9 쉬는 시간 알람 & 수업 안내 애플리케이션
 * 
 * - 정밀 타이머 및 실시간 시계
 * - Web Audio API 기반 소프트 차임벨 사운드 (외부 파일 의존 없음)
 * - 미디어 탭 허브 (문구/공지, 이미지, 비디오)
 * - 설정 모달 & localStorage 영구 저장
 * - F11 전체화면 토글
 */

(function () {
  'use strict';

  // ==========================================
  // 기본 설정 및 상태 (Default State)
  // ==========================================
  const DEFAULT_CONFIG = {
    classTitle: '3교시 : 과학 (Science) 🔬',
    defaultMinutes: 10,
    warningSoundEnabled: true,
    volume: 80,
    isMuted: false,
    theme: 'walnut',
    noticeMain: '"교과서 45쪽 핵심 개념 및 준비물을 확인해 주세요."',
    noticeSub: '질문 사항이나 메모는 수업 시작 시 바로 공유할 수 있도록 준비합니다.',
    noticeFooter: '💡 공지: "화장실은 미리 다녀오고, 종료 1분 전 자리에 착석해 주시기 바랍니다."',
    imageUrl: 'https://images.unsplash.com/photo-1507842229458-57763062331c?auto=format&fit=crop&w=1200&q=80',
    imageCaption: '학습 탐구 공간: 지혜와 집중을 위한 모던 라이브러리 📖',
    videoUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4', // 과학/자연 다큐멘터리 샘플
    videoCaption: '사전 시청 영상: 신기한 자연의 법칙 🌿',
    activeTab: 'message'
  };

  // 런타임 상태
  let config = Object.assign({}, DEFAULT_CONFIG);
  let totalSeconds = 10 * 60;
  let remainingSeconds = 10 * 60;
  let isRunning = false;
  let timerIntervalId = null;
  let targetTimestamp = null;
  let hasPlayedWarning = false;
  let customImageBlobUrl = null;
  let customVideoBlobUrl = null;

  // DOM Elements
  const els = {
    // Top Bar
    classTitleDisplay: document.getElementById('classTitleDisplay'),
    breakStatusPill: document.getElementById('breakStatusPill'),
    breakStatusText: document.getElementById('breakStatusText'),
    currentDateDisplay: document.getElementById('currentDateDisplay'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundIcon: document.getElementById('soundIcon'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),

    // Clock
    clockAmPm: document.getElementById('clockAmPm'),
    clockTime: document.getElementById('clockTime'),

    // Timer
    timerTargetTime: document.getElementById('timerTargetTime'),
    ringProgress: document.getElementById('ringProgress'),
    circularProgressWrap: document.querySelector('.circular-progress-wrap'),
    remainingDisplay: document.getElementById('remainingDisplay'),
    timerSubStatus: document.getElementById('timerSubStatus'),
    mascotBubble: document.getElementById('mascotBubble'),

    // Controls
    presetBtns: document.querySelectorAll('.preset-btn'),
    startPauseBtn: document.getElementById('startPauseBtn'),
    startPauseIcon: document.getElementById('startPauseIcon'),
    startPauseText: document.getElementById('startPauseText'),
    resetTimerBtn: document.getElementById('resetTimerBtn'),
    addOneMinBtn: document.getElementById('addOneMinBtn'),

    // Hub Tabs
    hubTabBtns: document.querySelectorAll('.hub-tab-btn'),
    currentTabBadge: document.getElementById('currentTabBadge'),
    tabContentMessage: document.getElementById('tabContentMessage'),
    tabContentImage: document.getElementById('tabContentImage'),
    tabContentVideo: document.getElementById('tabContentVideo'),

    // Notice Tab Elements
    noticeMainText: document.getElementById('noticeMainText'),
    noticeSubText: document.getElementById('noticeSubText'),
    noticeFooterNote: document.getElementById('noticeFooterNote'),

    // Image Tab Elements
    lessonImage: document.getElementById('lessonImage'),
    imageEmptyPlaceholder: document.getElementById('imageEmptyPlaceholder'),
    imageCaptionText: document.getElementById('imageCaptionText'),

    // Video Tab Elements
    videoContainer: document.getElementById('videoContainer'),
    videoEmptyPlaceholder: document.getElementById('videoEmptyPlaceholder'),
    videoCaptionText: document.getElementById('videoCaptionText'),

    // Footer
    footerTickerText: document.getElementById('footerTickerText'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    resetDefaultsBtn: document.getElementById('resetDefaultsBtn'),
    testChimeBtn: document.getElementById('testChimeBtn'),

    // Settings Form Inputs
    inputClassTitle: document.getElementById('inputClassTitle'),
    inputDefaultMinutes: document.getElementById('inputDefaultMinutes'),
    checkWarningSound: document.getElementById('checkWarningSound'),
    volumeSlider: document.getElementById('volumeSlider'),
    inputNoticeMain: document.getElementById('inputNoticeMain'),
    inputNoticeSub: document.getElementById('inputNoticeSub'),
    inputNoticeFooter: document.getElementById('inputNoticeFooter'),
    inputImageUrl: document.getElementById('inputImageUrl'),
    inputImageFile: document.getElementById('inputImageFile'),
    inputImageCaption: document.getElementById('inputImageCaption'),
    inputVideoUrl: document.getElementById('inputVideoUrl'),
    inputVideoFile: document.getElementById('inputVideoFile'),
    inputVideoCaption: document.getElementById('inputVideoCaption'),
    themeChips: document.querySelectorAll('.theme-chip')
  };

  // SVG Ring Circumference: 2 * Math.PI * 120 ≈ 753.982
  const RING_CIRCUMFERENCE = 2 * Math.PI * 120;

  // ==========================================
  // Web Audio API Sound Synthesizer (차임벨)
  // ==========================================
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * 부드러운 차임벨 사운드 단일 음 생성
   */
  function playTone(freq, startTime, duration = 1.2, baseGain = 0.3) {
    const ctx = getAudioContext();
    if (!ctx || config.isMuted) return;

    const masterGain = (config.volume / 100);

    // Oscillator 1: Sine (Pure tone)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    // Oscillator 2: Triangle (Harmonic richness)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    // Individual tone envelope
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, startTime);
    toneGain.gain.exponentialRampToValueAtTime(baseGain * masterGain, startTime + 0.04);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(toneGain);
    osc2.connect(toneGain);
    toneGain.connect(ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration + 0.1);
    osc2.stop(startTime + duration + 0.1);
  }

  /**
   * 1분 전 예비령 (2음 "딩-동")
   */
  function playWarningChime() {
    const ctx = getAudioContext();
    if (!ctx || config.isMuted || !config.warningSoundEnabled) return;
    const now = ctx.currentTime;
    playTone(523.25, now, 1.0, 0.25);        // C5
    playTone(392.00, now + 0.45, 1.5, 0.25); // G4
  }

  /**
   * 쉬는 시간 종료 본령 (한국 학교 전통 "딩-동-댕-동" 4음 x 2회)
   */
  function playEndChime() {
    const ctx = getAudioContext();
    if (!ctx || config.isMuted) return;
    const now = ctx.currentTime;
    
    // 멜로디: 미 - 도 - 레 - 솔 / 솔 - 레 - 미 - 도 (F-A-C-F 계열)
    const notesPart1 = [
      { f: 349.23, delay: 0.0 },  // F4
      { f: 440.00, delay: 0.5 },  // A4
      { f: 523.25, delay: 1.0 },  // C5
      { f: 698.46, delay: 1.5 }   // F5
    ];

    const notesPart2 = [
      { f: 698.46, delay: 2.3 },  // F5
      { f: 523.25, delay: 2.8 },  // C5
      { f: 440.00, delay: 3.3 },  // A4
      { f: 349.23, delay: 3.8, dur: 2.4 } // F4
    ];

    [...notesPart1, ...notesPart2].forEach(note => {
      playTone(note.f, now + note.delay, note.dur || 1.3, 0.35);
    });
  }

  // ==========================================
  // 실시간 시계 & 날짜 렌더링
  // ==========================================
  function updateRealtimeClock() {
    const now = new Date();

    // 날짜: YYYY년 M월 D일 요일
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dayName = days[now.getDay()];
    els.currentDateDisplay.textContent = `${year}년 ${month}월 ${date}일 ${dayName}`;

    // 시간: 12시간제 AM/PM
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12; // 0시는 12시로 표시
    const hoursStr = String(hours).padStart(2, '0');

    els.clockAmPm.textContent = ampm;
    els.clockTime.textContent = `${hoursStr}:${minutes}:${seconds}`;

    // 만약 타이머가 실행 중이면 목표 종료 시각 표시 업데이트
    if (isRunning && targetTimestamp) {
      const targetDate = new Date(targetTimestamp);
      let tHours = targetDate.getHours() % 12;
      tHours = tHours ? tHours : 12;
      const tMins = String(targetDate.getMinutes()).padStart(2, '0');
      els.timerTargetTime.textContent = `종료 예정: ${targetDate.getHours() >= 12 ? '오후' : '오전'} ${tHours}:${tMins}`;
    }
  }

  // ==========================================
  // 쉬는 시간 타이머 로직
  // ==========================================
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    els.remainingDisplay.textContent = formatTime(remainingSeconds);

    // SVG Circular Ring Offset 계산
    const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    els.ringProgress.style.strokeDashoffset = offset;

    // 상태 메시지 & 시각적 경고 전환
    const modeEl = document.getElementById('widgetModeVal');
    const nextEl = document.getElementById('widgetNextVal');

    if (remainingSeconds <= 0) {
      els.circularProgressWrap.classList.remove('urgent');
      els.breakStatusPill.classList.remove('urgent');
      els.breakStatusText.textContent = '수업 시작 (Class Session) 🔔';
      els.timerSubStatus.textContent = '수업이 시작되었습니다';
      els.mascotBubble.textContent = '수업 시작 • 학습 모드 전환';
      els.timerTargetTime.textContent = '종료되었습니다';
      if (modeEl) modeEl.textContent = '수업 진행';
      if (nextEl) nextEl.textContent = '집중 모드';
    } else if (remainingSeconds <= 60) {
      // 1분 미만: 긴급 모드 (테라코타 톤으로 전환 및 안내)
      els.circularProgressWrap.classList.add('urgent');
      els.breakStatusPill.classList.add('urgent');
      els.breakStatusText.textContent = '수업 준비 (Preparation) ⏳';
      els.timerSubStatus.textContent = '수업 시작 1분 전 • 착석 안내';
      els.mascotBubble.textContent = '교재 확인 및 제자리 착석 📖';
      if (modeEl) modeEl.textContent = '착석 안내';
      if (nextEl) nextEl.textContent = '수업 시작';
    } else if (remainingSeconds <= 180) {
      // 3분 미만
      els.circularProgressWrap.classList.remove('urgent');
      els.breakStatusPill.classList.remove('urgent');
      els.breakStatusText.textContent = '쉬는 시간 마무리 (Finalize) 📚';
      els.timerSubStatus.textContent = '다음 교시 준비 진행';
      els.mascotBubble.textContent = '수업 도구 및 필기도구 정돈 ✏️';
      if (modeEl) modeEl.textContent = '준비 모드';
      if (nextEl) nextEl.textContent = '착석 대기';
    } else {
      // 일반 편안한 쉬는 시간
      els.circularProgressWrap.classList.remove('urgent');
      els.breakStatusPill.classList.remove('urgent');
      els.breakStatusText.textContent = '리프레시 & 휴식 (Recess) ☕';
      els.timerSubStatus.textContent = '충전 및 스트레칭 시간';
      els.mascotBubble.textContent = '가벼운 스트레칭 & 수분 섭취 💧';
      if (modeEl) modeEl.textContent = '마인드 리셋';
      if (nextEl) nextEl.textContent = '집중 준비';
    }
  }

  function startTimer() {
    if (isRunning) return;
    getAudioContext(); // 사용자 제스처 시 오디오 컨텍스트 활성화

    isRunning = true;
    targetTimestamp = Date.now() + (remainingSeconds * 1000);

    els.startPauseIcon.textContent = '⏸';
    els.startPauseText.textContent = '일시정지';
    els.startPauseBtn.style.background = 'linear-gradient(135deg, #e76f51, #c4553b)';

    timerIntervalId = setInterval(() => {
      const now = Date.now();
      const diffMs = targetTimestamp - now;
      remainingSeconds = Math.max(0, Math.round(diffMs / 1000));

      // 1분 전 알림음 체크
      if (remainingSeconds === 60 && !hasPlayedWarning) {
        hasPlayedWarning = true;
        playWarningChime();
      }

      // 종료 체크
      if (remainingSeconds <= 0) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        isRunning = false;
        els.startPauseIcon.textContent = '▶';
        els.startPauseText.textContent = '시작';
        els.startPauseBtn.style.background = '';
        playEndChime();
      }

      updateTimerDisplay();
    }, 250);
  }

  function pauseTimer() {
    if (!isRunning) return;
    clearInterval(timerIntervalId);
    timerIntervalId = null;
    isRunning = false;

    els.startPauseIcon.textContent = '▶';
    els.startPauseText.textContent = '계속';
    els.startPauseBtn.style.background = '';
  }

  function resetTimer(seconds) {
    pauseTimer();
    if (seconds !== undefined) {
      totalSeconds = seconds;
      remainingSeconds = seconds;
    } else {
      remainingSeconds = totalSeconds;
    }
    hasPlayedWarning = false;
    targetTimestamp = null;
    els.startPauseText.textContent = '시작';
    els.timerTargetTime.textContent = `설정: ${Math.round(totalSeconds / 60)}분`;
    updateTimerDisplay();
  }

  function addOneMinute() {
    remainingSeconds += 60;
    if (remainingSeconds > totalSeconds) {
      totalSeconds = remainingSeconds;
    }
    if (isRunning) {
      targetTimestamp = Date.now() + (remainingSeconds * 1000);
    }
    if (remainingSeconds > 60) {
      hasPlayedWarning = false; // 다시 1분 넘어가면 경고음 재장전
    }
    updateTimerDisplay();
  }

  // ==========================================
  // 미디어 허브 탭 전환 및 렌더링
  // ==========================================
  function switchTab(tabName) {
    config.activeTab = tabName;
    els.hubTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    els.tabContentMessage.classList.toggle('active', tabName === 'message');
    els.tabContentImage.classList.toggle('active', tabName === 'image');
    els.tabContentVideo.classList.toggle('active', tabName === 'video');

    const badgeMap = {
      message: '안내 모드',
      image: '이미지 모드',
      video: '동영상 모드'
    };
    els.currentTabBadge.textContent = badgeMap[tabName] || '안내 모드';
  }

  function applyMediaSettings() {
    // 공지 텍스트
    els.classTitleDisplay.textContent = config.classTitle;
    els.noticeMainText.textContent = config.noticeMain;
    els.noticeSubText.textContent = config.noticeSub;
    els.noticeFooterNote.textContent = config.noticeFooter;

    // 이미지 렌더링
    const imgSrc = customImageBlobUrl || config.imageUrl;
    if (imgSrc && imgSrc.trim() !== '') {
      els.lessonImage.src = imgSrc;
      els.lessonImage.style.display = 'block';
      els.imageEmptyPlaceholder.style.display = 'none';
      els.imageCaptionText.textContent = config.imageCaption || '수업 참고 이미지';
    } else {
      els.lessonImage.style.display = 'none';
      els.imageEmptyPlaceholder.style.display = 'flex';
      els.imageCaptionText.textContent = '등록된 이미지 없음';
    }

    // 비디오 렌더링
    renderVideo();
  }

  function parseYoutubeUrl(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  function renderVideo() {
    els.videoContainer.innerHTML = '';
    const videoUrl = customVideoBlobUrl || config.videoUrl;

    if (customVideoBlobUrl) {
      // 로컬 파일 업로드 비디오
      const videoEl = document.createElement('video');
      videoEl.src = customVideoBlobUrl;
      videoEl.controls = true;
      videoEl.autoplay = false;
      videoEl.style.width = '100%';
      videoEl.style.height = '100%';
      els.videoContainer.appendChild(videoEl);
      els.videoEmptyPlaceholder.style.display = 'none';
      els.videoCaptionText.textContent = config.videoCaption || '수업 비디오 파일';
    } else if (videoUrl && videoUrl.trim() !== '') {
      const ytId = parseYoutubeUrl(videoUrl);
      if (ytId) {
        // 유튜브 임베드
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1`;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        els.videoContainer.appendChild(iframe);
        els.videoEmptyPlaceholder.style.display = 'none';
        els.videoCaptionText.textContent = config.videoCaption || '수업 유튜브 영상';
      } else {
        // 일반 웹 비디오 URL (MP4 등)
        const videoEl = document.createElement('video');
        videoEl.src = videoUrl;
        videoEl.controls = true;
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        els.videoContainer.appendChild(videoEl);
        els.videoEmptyPlaceholder.style.display = 'none';
        els.videoCaptionText.textContent = config.videoCaption || '수업 비디오 링크';
      }
    } else {
      els.videoEmptyPlaceholder.style.display = 'flex';
      els.videoCaptionText.textContent = '등록된 영상 없음';
    }
  }

  // ==========================================
  // 테마 관리 (Modern Wood Tones)
  // ==========================================
  function applyTheme(themeName) {
    document.body.classList.remove('theme-oak', 'theme-teak');
    if (themeName === 'oak') {
      document.body.classList.add('theme-oak');
    } else if (themeName === 'teak') {
      document.body.classList.add('theme-teak');
    }
    config.theme = themeName || 'walnut';
    els.themeChips.forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-theme') === config.theme);
    });
  }

  // ==========================================
  // 설정 동기화 및 LocalStorage
  // ==========================================
  function loadSavedConfig() {
    try {
      const saved = localStorage.getItem('break_alarm_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        config = Object.assign({}, DEFAULT_CONFIG, parsed);
      }
    } catch (e) {
      console.warn('LocalStorage load error:', e);
    }

    // UI 동기화
    applyTheme(config.theme);
    applyMediaSettings();
    switchTab(config.activeTab || 'message');

    // 타이머 기본값 설정
    const defMins = config.defaultMinutes || 10;
    resetTimer(defMins * 60);

    // 프리셋 버튼 활성화 맞추기
    els.presetBtns.forEach(btn => {
      const m = parseInt(btn.getAttribute('data-minutes'), 10);
      btn.classList.toggle('active', m === defMins);
    });

    // 사운드 아이콘 업데이트
    updateSoundIcon();
  }

  function saveConfigToStorage() {
    try {
      localStorage.setItem('break_alarm_config', JSON.stringify(config));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  function updateSoundIcon() {
    if (config.isMuted) {
      els.soundIcon.textContent = '🔇';
      els.soundToggleBtn.style.opacity = '0.6';
    } else {
      els.soundIcon.textContent = '🔔';
      els.soundToggleBtn.style.opacity = '1';
    }
  }

  function populateSettingsForm() {
    els.inputClassTitle.value = config.classTitle;
    els.inputDefaultMinutes.value = config.defaultMinutes;
    els.checkWarningSound.checked = config.warningSoundEnabled;
    els.volumeSlider.value = config.volume;
    els.inputNoticeMain.value = config.noticeMain;
    els.inputNoticeSub.value = config.noticeSub;
    els.inputNoticeFooter.value = config.noticeFooter;
    els.inputImageUrl.value = config.imageUrl;
    els.inputImageCaption.value = config.imageCaption;
    els.inputVideoUrl.value = config.videoUrl;
    els.inputVideoCaption.value = config.videoCaption;
  }

  function saveSettingsFromForm() {
    config.classTitle = els.inputClassTitle.value.trim() || DEFAULT_CONFIG.classTitle;
    config.defaultMinutes = Math.max(1, Math.min(60, parseInt(els.inputDefaultMinutes.value, 10) || 10));
    config.warningSoundEnabled = els.checkWarningSound.checked;
    config.volume = parseInt(els.volumeSlider.value, 10);
    config.noticeMain = els.inputNoticeMain.value.trim() || DEFAULT_CONFIG.noticeMain;
    config.noticeSub = els.inputNoticeSub.value.trim() || DEFAULT_CONFIG.noticeSub;
    config.noticeFooter = els.inputNoticeFooter.value.trim() || DEFAULT_CONFIG.noticeFooter;
    config.imageUrl = els.inputImageUrl.value.trim();
    config.imageCaption = els.inputImageCaption.value.trim();
    config.videoUrl = els.inputVideoUrl.value.trim();
    config.videoCaption = els.inputVideoCaption.value.trim();

    // 로컬 파일 업로드 확인
    if (els.inputImageFile.files && els.inputImageFile.files[0]) {
      if (customImageBlobUrl) URL.revokeObjectURL(customImageBlobUrl);
      customImageBlobUrl = URL.createObjectURL(els.inputImageFile.files[0]);
    }
    if (els.inputVideoFile.files && els.inputVideoFile.files[0]) {
      if (customVideoBlobUrl) URL.revokeObjectURL(customVideoBlobUrl);
      customVideoBlobUrl = URL.createObjectURL(els.inputVideoFile.files[0]);
    }

    saveConfigToStorage();
    applyMediaSettings();

    // 모달 닫기
    els.settingsModal.classList.remove('open');
  }

  // ==========================================
  // 이벤트 바인딩 (Event Listeners)
  // ==========================================
  function bindEvents() {
    // 1. 타이머 컨트롤
    els.startPauseBtn.addEventListener('click', () => {
      if (isRunning) {
        pauseTimer();
      } else {
        startTimer();
      }
    });

    els.resetTimerBtn.addEventListener('click', () => {
      resetTimer();
    });

    els.addOneMinBtn.addEventListener('click', () => {
      addOneMinute();
    });

    // 2. 프리셋 버튼
    els.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        els.presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const minutes = parseInt(btn.getAttribute('data-minutes'), 10);
        config.defaultMinutes = minutes;
        resetTimer(minutes * 60);
      });
    });

    // 3. 미디어 허브 탭 전환
    els.hubTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
        saveConfigToStorage();
      });
    });

    // 4. 소리 켜기/끄기 토글
    els.soundToggleBtn.addEventListener('click', () => {
      config.isMuted = !config.isMuted;
      updateSoundIcon();
      saveConfigToStorage();
      if (!config.isMuted) {
        playTone(523.25, getAudioContext().currentTime, 0.4, 0.2); // 피드백 사운드
      }
    });

    // 5. 전체화면 토글
    els.fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('전체화면 요청 실패:', err);
        });
      } else {
        document.exitFullscreen();
      }
    });

    // 6. 설정 모달 열기/닫기
    els.openSettingsBtn.addEventListener('click', () => {
      populateSettingsForm();
      els.settingsModal.classList.add('open');
    });

    els.closeSettingsBtn.addEventListener('click', () => {
      els.settingsModal.classList.remove('open');
    });

    els.settingsModal.addEventListener('click', (e) => {
      if (e.target === els.settingsModal) {
        els.settingsModal.classList.remove('open');
      }
    });

    els.saveSettingsBtn.addEventListener('click', () => {
      saveSettingsFromForm();
    });

    els.resetDefaultsBtn.addEventListener('click', () => {
      if (confirm('모든 설정을 기본값으로 초기화할까요?')) {
        config = Object.assign({}, DEFAULT_CONFIG);
        if (customImageBlobUrl) { URL.revokeObjectURL(customImageBlobUrl); customImageBlobUrl = null; }
        if (customVideoBlobUrl) { URL.revokeObjectURL(customVideoBlobUrl); customVideoBlobUrl = null; }
        saveConfigToStorage();
        loadSavedConfig();
        populateSettingsForm();
        els.settingsModal.classList.remove('open');
      }
    });

    // 7. 벨소리 시험 버튼
    els.testChimeBtn.addEventListener('click', () => {
      config.volume = parseInt(els.volumeSlider.value, 10);
      playEndChime();
    });

    // 8. 테마 칩 클릭
    els.themeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const theme = chip.getAttribute('data-theme');
        applyTheme(theme);
        saveConfigToStorage();
      });
    });

    // 9. 키보드 단축키 지원 (스페이스바: 시작/정지, R: 리셋, F: 전체화면, M: 음소거)
    window.addEventListener('keydown', (e) => {
      // 텍스트 인풋 포커스 중에는 단축키 비활성화
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        els.startPauseBtn.click();
      } else if (e.key.toLowerCase() === 'r') {
        els.resetTimerBtn.click();
      } else if (e.key.toLowerCase() === 'f') {
        els.fullscreenBtn.click();
      } else if (e.key.toLowerCase() === 'm') {
        els.soundToggleBtn.click();
      }
    });
  }

  // ==========================================
  // 초기화 실행
  // ==========================================
  function init() {
    // 실시간 시계 시작 (250ms 주기)
    updateRealtimeClock();
    setInterval(updateRealtimeClock, 250);

    // 저장된 설정 불러오기
    loadSavedConfig();

    // 초기 타이머 디스플레이 갱신
    updateTimerDisplay();

    // 이벤트 리스너 연결
    bindEvents();
  }

  // DOM 로드 완료 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
