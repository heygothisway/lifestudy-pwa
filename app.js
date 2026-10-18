// 生命讀經追求進度排程器 Core Logic

const STORAGE_KEY = 'lifestudy_pwa_settings_v1';
const CACHE_KEY_PREFIX = 'ls_cache_';

// 預設設定
const DEFAULT_SETTINGS = {
  bookId: 51,           // 歌羅西書
  msg1: 26,
  msg2: 27,
  startDayOfWeek: 3,    // 週三開始
  restDayOfWeek: 2,     // 週二休息 (不推送)
  startDate: '',        // 自動推算或手動選擇
  headerText: '【 天天21:00生命讀經 🌱 】'
};

const DAY_NAMES = ['主日', '一', '二', '三', '四', '五', '六'];

// CORS 代理列表 (依序嘗試)
const CORS_PROXIES = [
  url => `/api/proxy?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

let appState = {
  settings: { ...DEFAULT_SETTINGS },
  currentSchedule: null,
  isLoading: false
};

// 初始化載入
document.addEventListener('DOMContentLoaded', () => {
  loadSavedSettings();
  initBookSelector();
  initScheduleControls();
  initDateDefault();
  renderFormValues();

  // 註冊 Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  }
});

// 載入 LocalStorage 記憶設定
function loadSavedSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appState.settings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('載入設定失敗:', e);
  }
}

// 儲存設定至 LocalStorage
function saveCurrentSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.settings));
  } catch (e) {
    console.error('儲存設定失敗:', e);
  }
}

// 初始化書卷選單
function initBookSelector() {
  const select = document.getElementById('bookSelect');
  if (!select) return;

  select.innerHTML = '';
  
  // 分組：新約與舊約
  const otGroup = document.createElement('optgroup');
  otGroup.label = '── 舊約生命讀經 ──';
  const ntGroup = document.createElement('optgroup');
  ntGroup.label = '── 新約生命讀經 ──';

  BIBLE_BOOKS.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `${b.name} (${b.abbr}) - 全 ${b.chapters} 篇`;
    if (b.testament === 'OT') {
      otGroup.appendChild(opt);
    } else {
      ntGroup.appendChild(opt);
    }
  });

  select.appendChild(ntGroup);
  select.appendChild(otGroup);

  select.value = appState.settings.bookId;

  select.addEventListener('change', e => {
    appState.settings.bookId = parseInt(e.target.value, 10);
    saveCurrentSettings();
  });
}

// 初始化排程週期下拉選單
function initScheduleControls() {
  const startDaySel = document.getElementById('startDaySelect');
  const restDaySel = document.getElementById('restDaySelect');

  // 起始日 (0=主日, 1=週一 ... 6=週六)
  startDaySel.innerHTML = DAY_NAMES.map((name, i) => 
    `<option value="${i}">每週 (${name}) 開始</option>`
  ).join('');

  // 休息日
  restDaySel.innerHTML = `
    <option value="-1">無休息日 (連續推送)</option>
    ${DAY_NAMES.map((name, i) => `<option value="${i}">每週 (${name}) 休息不推</option>`).join('')}
  `;

  startDaySel.addEventListener('change', e => {
    appState.settings.startDayOfWeek = parseInt(e.target.value, 10);
    updateCalculatedStartDate();
    saveCurrentSettings();
  });

  restDaySel.addEventListener('change', e => {
    appState.settings.restDayOfWeek = parseInt(e.target.value, 10);
    saveCurrentSettings();
  });
}

// 初始化起始日期（預設為最近的「起始星期」）
function initDateDefault() {
  if (!appState.settings.startDate) {
    updateCalculatedStartDate();
  }
}

// 計算最接近的起始星期日期
function updateCalculatedStartDate() {
  const targetDay = appState.settings.startDayOfWeek;
  const now = new Date();
  const currentDay = now.getDay();
  
  // 計算差距天數（若今天剛好是起始日則為今天，否則找下一個目標星期幾）
  let diff = targetDay - currentDay;
  if (diff < 0) diff += 7;
  
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + diff);
  
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  appState.settings.startDate = `${yyyy}-${mm}-${dd}`;
  
  const dateInput = document.getElementById('startDateInput');
  if (dateInput) dateInput.value = appState.settings.startDate;
}

// 更新表單顯示值
function renderFormValues() {
  document.getElementById('bookSelect').value = appState.settings.bookId;
  document.getElementById('msg1Input').value = appState.settings.msg1;
  document.getElementById('msg2Input').value = appState.settings.msg2;
  document.getElementById('startDaySelect').value = appState.settings.startDayOfWeek;
  document.getElementById('restDaySelect').value = appState.settings.restDayOfWeek;
  document.getElementById('headerTextInput').value = appState.settings.headerText;
  
  const dateInput = document.getElementById('startDateInput');
  if (dateInput) {
    dateInput.value = appState.settings.startDate;
    dateInput.addEventListener('change', e => {
      appState.settings.startDate = e.target.value;
      saveCurrentSettings();
    });
  }

  // 篇數聯動（變動 msg1 時，msg2 自動為 msg1 + 1）
  const msg1Input = document.getElementById('msg1Input');
  const msg2Input = document.getElementById('msg2Input');
  
  msg1Input.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      appState.settings.msg1 = val;
      appState.settings.msg2 = val + 1;
      msg2Input.value = val + 1;
      saveCurrentSettings();
    }
  });

  msg2Input.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      appState.settings.msg2 = val;
      saveCurrentSettings();
    }
  });

  document.getElementById('headerTextInput').addEventListener('input', e => {
    appState.settings.headerText = e.target.value;
    saveCurrentSettings();
  });
}

// 快速按鈕：前進到下週（篇數+2，日期+7天）
function advanceToNextWeek() {
  appState.settings.msg1 += 2;
  appState.settings.msg2 += 2;

  if (appState.settings.startDate) {
    const [y, m, d] = appState.settings.startDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 7);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    appState.settings.startDate = `${yyyy}-${mm}-${dd}`;
  }

  renderFormValues();
  saveCurrentSettings();
  showToast('已更新至下週進度與日期！點擊「產生排程」即可更新');
}

// 快速按鈕：後退一週（篇數-2，日期-7天）
function rewindToPreviousWeek() {
  if (appState.settings.msg1 > 2) {
    appState.settings.msg1 -= 2;
    appState.settings.msg2 -= 2;
  }

  if (appState.settings.startDate) {
    const [y, m, d] = appState.settings.startDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 7);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    appState.settings.startDate = `${yyyy}-${mm}-${dd}`;
  }

  renderFormValues();
  saveCurrentSettings();
  showToast('已退回上一週進度');
}

// 核心函式：網路抓取網頁內容
async function fetchLifeStudyHtml(bookId, msgNum) {
  const cacheKey = `${CACHE_KEY_PREFIX}${bookId}_${msgNum}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    return cached;
  }

  const targetUrl = getLifeStudyUrl(bookId, msgNum);
  let lastError = null;

  for (const proxyBuilder of CORS_PROXIES) {
    const proxyUrl = proxyBuilder(targetUrl);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'text/html,application/xhtml+xml' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        let html = await res.text();
        if (html && (html.includes('verses') || html.includes('calibre') || html.includes('生命讀經') || html.includes('<h3'))) {
          sessionStorage.setItem(cacheKey, html);
          return html;
        }
      }
    } catch (e) {
      lastError = e;
      // 嘗試下一個代理
    }
  }

  throw new Error(`無法連線至福音書房網站 (${lastError ? lastError.message : '連線逾時'})`);
}

// 核心函式：解析 HTML 並計算最佳三等分綱要切點
function parseAndSplitMessage(html, bookId, msgNum) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. 取得標題
  const h3 = doc.querySelector('h3');
  let title = `第${msgNum}篇`;
  if (h3) {
    const clone = h3.cloneNode(true);
    clone.querySelectorAll('button, img, audio, script').forEach(el => el.remove());
    title = clone.textContent.replace(/\s+/g, ' ').trim();
  }

  // 簡化標題：若包含 "第二十六篇　對基督之死..."，提取後半段文字
  let cleanTitleOnly = title;
  const titleMatch = title.match(/第[一二三四五六七八九十百\d]+篇[\s　]+(.*)/);
  if (titleMatch && titleMatch[1]) {
    cleanTitleOnly = titleMatch[1].trim();
  }

  // 2. 取得所有小綱目 (<div id="O..." class="O0/O1/O2">)
  const versesDiv = doc.getElementById('verses') || doc.body;
  const sections = [];
  
  // 尋找所有錨點 div
  const headings = Array.from(versesDiv.querySelectorAll('div[id^="O"]')).filter(el => {
    const cls = el.className || '';
    return /O\d+/.test(cls);
  });

  const baseUrl = getLifeStudyUrl(bookId, msgNum);

  // 如果有小綱目標題
  if (headings.length >= 2) {
    // 收集開頭引言 (在第一個 O 之前的所有段落)
    let introLen = 0;
    let curr = headings[0].previousElementSibling;
    while (curr) {
      if (curr.tagName === 'P') introLen += curr.textContent.trim().length;
      curr = curr.previousElementSibling;
    }
    sections.push({ id: '', title: '開始', charLen: introLen });

    headings.forEach((h, idx) => {
      const hId = h.getAttribute('id');
      const cloneH = h.cloneNode(true);
      cloneH.querySelectorAll('button, img, input').forEach(el => el.remove());
      const hTitle = cloneH.textContent.replace(/\s+/g, ' ').trim();

      // 計算此標題到下一個標題間的段落字數
      let secLen = 0;
      let nextElem = h.nextElementSibling;
      while (nextElem && !(nextElem.tagName === 'DIV' && nextElem.id && nextElem.id.startsWith('O'))) {
        if (nextElem.tagName === 'P') {
          secLen += nextElem.textContent.trim().length;
        }
        nextElem = nextElem.nextElementSibling;
      }
      sections.push({ id: hId, title: hTitle, charLen: secLen });
    });

    // 計算最佳三分點 (cut1, cut2)
    const totalChars = sections.reduce((sum, s) => sum + s.charLen, 0);
    const target = totalChars / 3.0;

    let bestDiff = Infinity;
    let bestSplit = [1, 2];

    for (let i = 1; i < sections.length; i++) {
      let p1 = 0;
      for (let k = 0; k < i; k++) p1 += sections[k].charLen;

      for (let j = i + 1; j < sections.length; j++) {
        let p2 = 0;
        for (let k = i; k < j; k++) p2 += sections[k].charLen;
        let p3 = 0;
        for (let k = j; k < sections.length; k++) p3 += sections[k].charLen;

        const diff = Math.max(Math.abs(p1 - target), Math.abs(p2 - target), Math.abs(p3 - target));
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplit = [i, j];
        }
      }
    }

    const [c1, c2] = bestSplit;
    return {
      title,
      cleanTitleOnly,
      baseUrl,
      parts: [
        {
          startUrl: baseUrl,
          rangeText: `到「${sections[c1].title}」 前`
        },
        {
          startUrl: `${baseUrl}#${sections[c1].id}`,
          rangeText: `到「${sections[c2].title}」 前`
        },
        {
          startUrl: `${baseUrl}#${sections[c2].id}`,
          rangeText: `到結束`
        }
      ]
    };
  }

  // 備援模式：若網頁無 O1/O2 標題，按段落切分
  const paragraphs = Array.from(versesDiv.querySelectorAll('p.calibre2, p'));
  const totalP = paragraphs.length;
  const p1Idx = Math.max(1, Math.floor(totalP / 3));
  const p2Idx = Math.max(p1Idx + 1, Math.floor((totalP * 2) / 3));

  const p1Preview = paragraphs[p1Idx] ? paragraphs[p1Idx].textContent.slice(0, 15) : '第二段';
  const p2Preview = paragraphs[p2Idx] ? paragraphs[p2Idx].textContent.slice(0, 15) : '第三段';

  return {
    title,
    cleanTitleOnly,
    baseUrl,
    parts: [
      { startUrl: baseUrl, rangeText: `到「${p1Preview}...」前` },
      { startUrl: baseUrl, rangeText: `到「${p2Preview}...」前` },
      { startUrl: baseUrl, rangeText: `到結束` }
    ]
  };
}

// 產出 6 天追求排程完整資料
async function generateSchedule() {
  const btn = document.getElementById('btnGenerate');
  const statusEl = document.getElementById('statusMessage');
  const resultContainer = document.getElementById('resultContainer');

  try {
    btn.disabled = true;
    appState.isLoading = true;
    statusEl.innerHTML = `<span class="loading-spinner"></span> 正在抓取生命讀經資訊，計算最佳綱要切段...`;
    statusEl.className = 'status-msg loading';
    statusEl.style.display = 'block';

    const book = BIBLE_BOOKS.find(b => b.id === appState.settings.bookId) || BIBLE_BOOKS[50];
    const { msg1, msg2, startDate, restDayOfWeek, headerText } = appState.settings;

    // 平行抓取兩篇信息
    const [html1, html2] = await Promise.all([
      fetchLifeStudyHtml(book.id, msg1),
      fetchLifeStudyHtml(book.id, msg2)
    ]);

    statusEl.innerHTML = `<span class="loading-spinner"></span> 正在排定日程與錨點格式...`;

    const parsedMsg1 = parseAndSplitMessage(html1, book.id, msg1);
    const parsedMsg2 = parseAndSplitMessage(html2, book.id, msg2);

    // 計算 7 天內的 6 個追求日 + 1 休息日
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const currDate = new Date(startYear, startMonth - 1, startDay);

    const scheduleDays = [];
    let readingDayCount = 0;

    // 最多搜尋 14 天，直到湊滿 6 個閱讀日
    for (let i = 0; i < 14; i++) {
      const dateObj = new Date(currDate);
      dateObj.setDate(currDate.getDate() + i);

      const dow = dateObj.getDay();
      const month = dateObj.getMonth() + 1;
      const day = dateObj.getDate();
      const dayName = DAY_NAMES[dow];

      // 判斷是否為休息日
      if (restDayOfWeek !== -1 && dow === restDayOfWeek) {
        scheduleDays.push({
          isRestDay: true,
          dateStr: `${month}/${day} (${dayName})`,
          text: `${month}/${day} (${dayName}) 【今日無共同追求 / 休息日 🌱】`
        });
        continue;
      }

      // 閱讀日
      let currentMsg, partData, msgNum;
      if (readingDayCount < 3) {
        currentMsg = parsedMsg1;
        partData = parsedMsg1.parts[readingDayCount];
        msgNum = msg1;
      } else if (readingDayCount < 6) {
        currentMsg = parsedMsg2;
        partData = parsedMsg2.parts[readingDayCount - 3];
        msgNum = msg2;
      }

      const fullTitle = `${book.abbr} ch${msgNum}：${currentMsg.cleanTitleOnly}`;
      const dayLabel = `${month}/${day} (${dayName})`;

      const formattedCardText = [
        headerText,
        fullTitle,
        `${dayLabel} ${partData.rangeText}`,
        partData.startUrl
      ].join('\n');

      scheduleDays.push({
        isRestDay: false,
        readingIndex: readingDayCount,
        msgNum,
        bookAbbr: book.abbr,
        fullTitle,
        dateLabel: dayLabel,
        rangeText: partData.rangeText,
        url: partData.startUrl,
        formattedText: formattedCardText
      });

      readingDayCount++;
      if (readingDayCount >= 6) {
        break;
      }
    }

    appState.currentSchedule = {
      book,
      msg1,
      msg2,
      days: scheduleDays
    };

    renderScheduleUI();

    statusEl.innerHTML = `✅ 已成功產生 6 天讀經進度！可直接一鍵複製。`;
    statusEl.className = 'status-msg success';
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `❌ 產生失敗：${err.message}<br><small>提示：請確認網路連線，或使用本機 Python 伺服器啟動。</small>`;
    statusEl.className = 'status-msg error';
  } finally {
    btn.disabled = false;
    appState.isLoading = false;
  }
}

// 組合 6 天完整文字 (包含分隔線)
function buildFullScheduleText() {
  if (!appState.currentSchedule) return '';

  const { days } = appState.currentSchedule;
  const readingDays = days.filter(d => !d.isRestDay);

  const part1Days = readingDays.slice(0, 3);
  const part2Days = readingDays.slice(3, 6);

  const block1 = part1Days.map(d => d.formattedText).join('\n\n');
  const block2 = part2Days.map(d => d.formattedText).join('\n\n');

  return `${block1}\n\n/*----------------------------*/\n${block2}`;
}

// 渲染排程 UI 卡片
function renderScheduleUI() {
  const container = document.getElementById('resultContainer');
  if (!container || !appState.currentSchedule) return;

  const { book, msg1, msg2, days } = appState.currentSchedule;
  let html = `
    <div class="result-header">
      <div class="result-summary">
        <h3>📖 ${book.name} 第 ${msg1} 篇、第 ${msg2} 篇追求進度</h3>
        <p class="subtitle">共 6 天追求，各段均分文字量與綱要節點</p>
      </div>
      <button class="btn-primary btn-copy-all" onclick="copyFullSchedule()">
        📋 一鍵複製 6 天完整內容
      </button>
    </div>
    <div class="cards-list">
  `;

  let readingCount = 0;
  days.forEach((day, index) => {
    if (day.isRestDay) {
      html += `
        <div class="day-card rest-day">
          <div class="rest-badge">☕ 休息日</div>
          <div class="day-date">${day.dateStr}</div>
          <div class="rest-text">本日無推送，專心家庭或禱告聚會</div>
        </div>
      `;
      return;
    }

    readingCount++;
    // 在第 3 天閱讀完後插入明顯分隔標記
    const isDividerNext = readingCount === 3;

    html += `
      <div class="day-card">
        <div class="card-top">
          <span class="day-badge">第 ${readingCount} 天</span>
          <button class="btn-copy-day" onclick="copySingleDay(${index})">📋 複製今日</button>
        </div>
        <div class="card-content">
          <div class="card-title">${escapeHtml(day.fullTitle)}</div>
          <div class="card-range">
            <span class="date-tag">${day.dateLabel}</span>
            <span class="range-tag">${escapeHtml(day.rangeText)}</span>
          </div>
          <a class="card-url" href="${day.url}" target="_blank" rel="noopener">${day.url}</a>
        </div>
      </div>
    `;

    if (isDividerNext) {
      html += `
        <div class="schedule-divider">
          <span>/*----------------------------*/ 接續第 ${msg2} 篇</span>
        </div>
      `;
    }
  });

  html += `
    </div>
    <div class="result-footer">
      <button class="btn-secondary" onclick="advanceToNextWeek(); generateSchedule();">
        ⏭️ 直接切換並產生下週進度 (+2篇)
      </button>
    </div>
  `;

  container.innerHTML = html;
  container.style.display = 'block';

  // 平滑滾動到結果區
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 複製全部內容
async function copyFullSchedule() {
  const text = buildFullScheduleText();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    showToast('🎉 已成功複製 6 天完整內容！可直接至 LINE 貼上');
  } catch (err) {
    // 降級方式
    fallbackCopyText(text);
  }
}

// 複製單天內容
async function copySingleDay(dayIndex) {
  if (!appState.currentSchedule) return;
  const day = appState.currentSchedule.days[dayIndex];
  if (!day || !day.formattedText) return;

  try {
    await navigator.clipboard.writeText(day.formattedText);
    showToast(`✅ 已複製 ${day.dateLabel} 讀經進度！`);
  } catch (err) {
    fallbackCopyText(day.formattedText);
  }
}

// 降級剪貼簿複製
function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('🎉 已成功複製！');
}

// Toast 提示氣泡
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast show';
  setTimeout(() => {
    toast.className = 'toast';
  }, 2800);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}
