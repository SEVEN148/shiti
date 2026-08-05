const STORAGE_KEY = "shiti-study-assistant-v1";
const HIGH_SCHOOL_SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];
const MATERIAL_CATEGORIES = ["人物", "社会", "科技", "文化", "自然", "成长", "哲思"];

const defaultState = {
  profile: {
    name: "同学",
    grade: "高一",
    track: "理科",
    mainSubject: "数学",
    avatar: ""
  },
  progress: {
    totalFocusMinutes: 0,
    totalReviews: 0
  },
  focus: {
    preset: 25,
    sessions: 0,
    minutes: 0,
    date: ""
  },
  reward: {
    coins: 0,
    month: "",
    tickets: 0,
    drawsUsed: 0,
    redemptionsThisMonth: 0,
    items: [
      { id: "r-101", title: "看一集喜欢的节目", description: "完成当天计划后，安心放松一会儿", cost: 40 },
      { id: "r-102", title: "周末自由安排一小时", description: "留给游戏、散步或任何想做的事情", cost: 60 },
      { id: "r-103", title: "买一本想看的书", description: "为连续学习积累一个更长期的奖励", cost: 100 }
    ],
    history: []
  },
  vocabulary: {
    examLevel: "gaokao",
    selectedCount: 20,
    customWords: [],
    active: [],
    index: 0,
    sessionDate: "",
    roundId: "",
    unfamiliar: {},
    mastered: {}
  },
  materials: [],
  mistakes: [],
  tasks: [],
  schedule: []
};

let state = loadState();
let currentSubject = "全部";
let toastTimer;
let pendingImage = "";
let simpleMode = "";
let timerDuration = (state.focus.preset || 25) * 60;
let timerRemaining = timerDuration;
let timerInterval = null;
let timerEndAt = 0;
let timerRunning = false;
let currentVocabTab = "today";
let vocabMeaningVisible = false;
let currentMaterialCategory = "全部";
let materialSourceMode = "photo";
let pendingMaterialImage = "";
let activeMaterialId = "";
let pendingAvatar = "";
let selectedMistakeIds = new Set();
let currentPaperMistakes = [];
let currentVisibleMistakeIds = [];
let pendingVocabImage = "";
let editingRewardId = "";

const pages = [...document.querySelectorAll(".page")];
const navItems = [...document.querySelectorAll(".nav-item")];
const uploadModal = document.querySelector("#uploadModal");
const simpleModal = document.querySelector("#simpleModal");
const materialModal = document.querySelector("#materialModal");
const materialDetailModal = document.querySelector("#materialDetailModal");
const profileModal = document.querySelector("#profileModal");
const paperModal = document.querySelector("#paperModal");
const vocabImportModal = document.querySelector("#vocabImportModal");

function migrateVocabularyKey(key) {
  return key.includes(":") ? key : `gaokao:${key}`;
}

function migrateVocabularyMap(records = {}) {
  return Object.fromEntries(Object.entries(records).map(([key, value]) => [migrateVocabularyKey(key), value]));
}

function isLegacyDemoState(saved) {
  return saved?.profile?.name === "林知夏"
    && Number(saved?.progress?.totalFocusMinutes) === 360
    && Array.isArray(saved?.mistakes) && saved.mistakes.length === 6
    && Array.isArray(saved?.materials) && saved.materials.length === 3
    && Array.isArray(saved?.tasks) && saved.tasks.length === 5
    && Array.isArray(saved?.schedule) && saved.schedule.length === 7;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isLegacyDemoState(saved)) return structuredClone(defaultState);
    if (!saved || !saved.mistakes || !saved.tasks || !saved.schedule) return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...saved,
      profile: { ...defaultState.profile, ...(saved.profile || {}) },
      progress: { ...defaultState.progress, ...(saved.progress || {}) },
      focus: { ...defaultState.focus, ...(saved.focus || {}) },
      reward: {
        ...defaultState.reward,
        ...(saved.reward || {}),
        items: Array.isArray(saved.reward?.items) ? saved.reward.items : structuredClone(defaultState.reward.items),
        history: Array.isArray(saved.reward?.history) ? saved.reward.history : []
      },
      vocabulary: {
        ...defaultState.vocabulary,
        ...(saved.vocabulary || {}),
        customWords: Array.isArray(saved.vocabulary?.customWords) ? saved.vocabulary.customWords : [],
        active: Array.isArray(saved.vocabulary?.active) ? saved.vocabulary.active.map(migrateVocabularyKey) : [],
        unfamiliar: migrateVocabularyMap(saved.vocabulary?.unfamiliar),
        mastered: migrateVocabularyMap(saved.vocabulary?.mastered)
      }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("图片较大，当前数据只在本次打开期间保留");
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function switchPage(pageName) {
  pages.forEach((page) => page.classList.toggle("active", page.id === `page-${pageName}`));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === pageName));
  document.querySelector("#sidebar").classList.remove("open");
  document.querySelector("#sidebarScrim").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageName === "mistakes") renderMistakes();
  if (pageName === "knowledge") renderKnowledge();
  if (pageName === "vocabulary") renderVocabulary();
  if (pageName === "materials") renderMaterials();
  if (pageName === "rewards") renderRewards();
}

function aggregateKnowledge() {
  const groups = new Map();
  state.mistakes.forEach((item) => {
    const key = `${item.subject}-${item.knowledge}`;
    if (!groups.has(key)) {
      groups.set(key, { subject: item.subject, knowledge: item.knowledge, count: 0, reviewed: 0, types: new Set(), latest: item.date });
    }
    const group = groups.get(key);
    group.count += 1;
    group.reviewed += item.reviewed ? 1 : 0;
    group.types.add(item.type);
  });
  return [...groups.values()]
    .map((group) => ({ ...group, types: [...group.types], mastery: Math.min(92, Math.round((group.reviewed / group.count) * 65 + 18)) }))
    .sort((a, b) => b.count - a.count || a.mastery - b.mastery);
}

function ensureProgressState() {
  if (!state.progress || typeof state.progress !== "object") state.progress = structuredClone(defaultState.progress);
  state.progress.totalFocusMinutes = Math.max(0, Number(state.progress.totalFocusMinutes) || 0);
  state.progress.totalReviews = Math.max(0, Number(state.progress.totalReviews) || 0);
}

function profileLevelData() {
  ensureProgressState();
  const focusLevels = Math.floor(state.progress.totalFocusMinutes / 60);
  const reviewLevels = Math.floor(state.progress.totalReviews / 10);
  const focusProgress = state.progress.totalFocusMinutes % 60;
  const reviewProgress = state.progress.totalReviews % 10;
  return {
    level: focusLevels + reviewLevels,
    focusProgress,
    reviewProgress,
    focusRemaining: 60 - focusProgress,
    reviewRemaining: 10 - reviewProgress
  };
}

function renderProfile() {
  const name = state.profile.name || defaultState.profile.name;
  const avatar = document.querySelector("#studentAvatar");
  const level = profileLevelData();
  document.querySelector("#studentName").textContent = name;
  avatar.innerHTML = state.profile.avatar ? `<img src="${state.profile.avatar}" alt="${escapeHtml(name)}的头像">` : escapeHtml(name.slice(0, 1));
  document.querySelector("#studentMeta").textContent = `${state.profile.grade} · ${state.profile.mainSubject || defaultState.profile.mainSubject}`;
  document.querySelector("#studentLevel").textContent = `Lv. ${level.level}`;
  document.querySelector("#overviewGreeting").textContent = `晚上好，${name}`;
}

function renderProfileLevel() {
  const level = profileLevelData();
  document.querySelector("#profileLevelValue").textContent = `Lv. ${level.level}`;
  document.querySelector("#profileLevelHint").textContent = `再专注 ${level.focusRemaining} 分钟或复习 ${level.reviewRemaining} 次升级`;
  document.querySelector("#profileFocusProgressText").textContent = `${level.focusProgress} / 60 分钟`;
  document.querySelector("#profileReviewProgressText").textContent = `${level.reviewProgress} / 10 次`;
  document.querySelector("#profileFocusProgressBar").style.width = `${Math.round(level.focusProgress / 60 * 100)}%`;
  document.querySelector("#profileReviewProgressBar").style.width = `${level.reviewProgress * 10}%`;
}

function renderProfileAvatarPreview() {
  const name = document.querySelector("#profileNameInput").value.trim() || state.profile.name || defaultState.profile.name;
  document.querySelector("#profileAvatarPreview").innerHTML = pendingAvatar ? `<img src="${pendingAvatar}" alt="头像预览">` : escapeHtml(name.slice(0, 1));
}

function openProfileModal() {
  pendingAvatar = state.profile.avatar || "";
  document.querySelector("#profileNameInput").value = state.profile.name || defaultState.profile.name;
  document.querySelector("#profileGradeInput").value = state.profile.grade || defaultState.profile.grade;
  document.querySelector("#profileSubjectInput").value = state.profile.mainSubject || defaultState.profile.mainSubject;
  document.querySelector("#profileAvatarInput").value = "";
  renderProfileAvatarPreview();
  renderProfileLevel();
  profileModal.showModal();
}

async function handleProfileAvatar(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("请选择 JPG 或 PNG 头像图片");
    return;
  }
  try {
    pendingAvatar = await resizeAvatar(file);
    renderProfileAvatarPreview();
  } catch {
    showToast("头像读取失败，请重新选择");
  }
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const size = Math.min(image.width, image.height);
        const sourceX = Math.round((image.width - size) / 2);
        const sourceY = Math.round((image.height - size) / 2);
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 320;
        canvas.getContext("2d").drawImage(image, sourceX, sourceY, size, size, 0, 0, 320, 320);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function saveProfile(event) {
  event.preventDefault();
  const name = document.querySelector("#profileNameInput").value.trim();
  if (!name) {
    showToast("昵称不能为空");
    return;
  }
  state.profile.name = name;
  state.profile.grade = document.querySelector("#profileGradeInput").value;
  state.profile.mainSubject = document.querySelector("#profileSubjectInput").value;
  state.profile.avatar = pendingAvatar;
  saveState();
  profileModal.close();
  renderProfile();
  showToast("个人资料已更新");
}

function ensureRewardState() {
  if (!state.reward || typeof state.reward !== "object") state.reward = structuredClone(defaultState.reward);
  if (!Array.isArray(state.reward.items)) state.reward.items = structuredClone(defaultState.reward.items);
  if (!Array.isArray(state.reward.history)) state.reward.history = [];
}

function ensureRewardMonth() {
  ensureRewardState();
  const month = localDateKey().slice(0, 7);
  if (state.reward.month === month) return;
  state.reward.month = month;
  state.reward.tickets = Math.max(0, Number(state.reward.tickets) || 0);
  state.reward.drawsUsed = 0;
  state.reward.redemptionsThisMonth = 0;
  saveState();
}

function rewardHistoryEntry(type, title, amount, rewardKey = "") {
  return {
    id: `rh-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    type,
    title,
    amount,
    rewardKey,
    createdAt: new Date().toISOString()
  };
}

function awardCoins(amount, reason, rewardKey) {
  ensureRewardMonth();
  if (rewardKey && state.reward.history.some((item) => item.rewardKey === rewardKey)) return false;
  state.reward.coins += amount;
  state.reward.history.unshift(rewardHistoryEntry("earn", reason, amount, rewardKey));
  return true;
}

function renderRewards() {
  ensureRewardMonth();
  const reward = state.reward;
  document.querySelector("#rewardBalance").textContent = reward.coins;
  document.querySelector("#rewardTicketCount").textContent = reward.tickets;
  document.querySelector("#rewardMonthRedeemed").textContent = reward.redemptionsThisMonth;
  document.querySelector("#rewardTicketHint").textContent = `本月已使用 ${reward.drawsUsed} 张`;
  document.querySelector("#rewardNavCount").textContent = reward.coins;
  document.querySelector("#rewardDrawCaption").textContent = `当前剩余 ${reward.tickets} 张抽奖券`;
  const latestDraw = reward.history.find((item) => item.type === "draw");
  document.querySelector("#rewardDrawResult").textContent = latestDraw
    ? `上次抽中了 ${latestDraw.amount} 金币，继续积累下一份奖励。`
    : "抽取额外金币，为今天的努力加一点惊喜。";
  const drawButton = document.querySelector("#drawReward");
  drawButton.disabled = reward.tickets <= 0;
  drawButton.textContent = reward.tickets > 0 ? "开始抽奖" : "暂无抽奖券";

  document.querySelector("#rewardGrid").innerHTML = reward.items.map((item) => {
    const affordable = reward.coins >= item.cost;
    return `
      <article class="reward-card ${affordable ? "affordable" : ""}">
        <div class="reward-card-head"><div class="reward-card-mark">奖</div><button type="button" data-edit-reward="${item.id}">编辑</button></div>
        <div class="reward-card-copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || "完成目标后给自己一次认真兑现的奖励。")}</p></div>
        <div class="reward-card-action"><span><strong>${item.cost}</strong> 金币</span><button type="button" data-redeem-reward="${item.id}">${affordable ? "立即兑换" : `还差 ${item.cost - reward.coins}`}</button></div>
      </article>`;
  }).join("");
  document.querySelector("#rewardEmpty").hidden = reward.items.length > 0;

  const history = reward.history.slice(0, 16);
  document.querySelector("#rewardHistory").innerHTML = history.length ? history.map((item) => `
    <div class="reward-history-item">
      <span class="history-type ${item.amount >= 0 ? "gain" : "spend"}">${item.amount >= 0 ? "+" : "−"}</span>
      <div><strong>${escapeHtml(item.title)}</strong><span>${rewardHistoryDate(item.createdAt)}</span></div>
      <b class="${item.amount >= 0 ? "gain" : "spend"}">${item.amount >= 0 ? "+" : ""}${item.amount}</b>
    </div>
  `).join("") : `<div class="reward-history-empty"><span>币</span><p>完成一次学习行动后，金币记录会出现在这里。</p></div>`;
}

function rewardHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function drawRewardPrize() {
  ensureRewardMonth();
  if (state.reward.tickets <= 0) {
    showToast("暂无抽奖券");
    return;
  }
  const prizes = [5, 8, 10, 10, 12, 15, 20, 30];
  const prize = prizes[Math.floor(Math.random() * prizes.length)];
  state.reward.tickets -= 1;
  state.reward.drawsUsed += 1;
  state.reward.coins += prize;
  state.reward.history.unshift(rewardHistoryEntry("draw", "幸运抽奖", prize));
  saveState();
  renderRewards();
  showToast(`抽中了 ${prize} 金币`);
}

function redeemReward(id) {
  ensureRewardMonth();
  const item = state.reward.items.find((reward) => reward.id === id);
  if (!item) return;
  if (state.reward.coins < item.cost) {
    showToast(`还差 ${item.cost - state.reward.coins} 金币`);
    return;
  }
  state.reward.coins -= item.cost;
  state.reward.redemptionsThisMonth += 1;
  state.reward.history.unshift(rewardHistoryEntry("redeem", `兑换：${item.title}`, -item.cost));
  saveState();
  renderRewards();
  showToast("奖励兑换成功，记得认真兑现");
}

function renderOverview() {
  const mistakeCount = state.mistakes.length;
  document.querySelector("#mistakeNavCount").textContent = mistakeCount;
  document.querySelector("#weekMistakeCount").textContent = mistakeCount;

  const counts = state.mistakes.reduce((acc, item) => {
    acc[item.subject] = (acc[item.subject] || 0) + 1;
    return acc;
  }, {});
  const topSubjects = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = Math.max(...topSubjects.map(([, count]) => count), 1);
  document.querySelector("#subjectBars").innerHTML = topSubjects.map(([subject, count]) => `
    <div class="subject-bar"><span>${subject}</span><div class="bar-track"><span style="width:${Math.round(count / max * 100)}%"></span></div><strong>${count}</strong></div>
  `).join("");

  const todaySchedule = state.schedule.filter((item) => item.day === 2).slice(0, 3);
  const times = ["18:40", "19:30", "20:30"];
  document.querySelector("#miniSchedule").innerHTML = todaySchedule.length ? todaySchedule.map((item, index) => `
    <div class="schedule-item"><time>${times[index] || "21:00"}</time><span class="schedule-line"></span><div><strong>${item.title}</strong><span>${item.subject} · ${item.duration} 分钟</span></div></div>
  `).join("") : `<p class="muted">今天还没有安排学习任务。</p>`;

  const weakest = aggregateKnowledge()[0];
  document.querySelector("#weakestKnowledge").innerHTML = weakest ? `
    <div class="weak-card"><div><strong>${weakest.knowledge}</strong><p>${weakest.subject} · 累计 ${weakest.count} 道错题</p><div class="tag-row">${weakest.types.slice(0, 3).map((type) => `<span class="tag">${type}</span>`).join("")}</div></div><div class="weak-score">${weakest.mastery}%</div></div>
  ` : `<p class="muted">上传错题后会自动生成分析。</p>`;

  document.querySelector("#recentMistakes").innerHTML = state.mistakes.slice(0, 3).map((item) => `
    <div class="recent-item"><span class="subject-badge">${item.subject.slice(0, 1)}</span><div><strong>${escapeHtml(item.question)}</strong><span>${item.knowledge} · ${item.type}</span></div><time>${item.date}</time></div>
  `).join("");

  const done = state.tasks.filter((task) => task.done).length;
  const progress = state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0;
  document.querySelector("#overviewProgress").textContent = `${progress}%`;
  document.querySelector(".study-ring").style.background = `conic-gradient(#e3b83d 0 ${progress}%, rgba(255,255,255,.12) ${progress}%)`;
}

function currentVocabularyLevel() {
  if (!["gaokao", "zhongkao", "custom"].includes(state.vocabulary.examLevel)) state.vocabulary.examLevel = "gaokao";
  return state.vocabulary.examLevel;
}

function vocabularyBank(level = currentVocabularyLevel()) {
  if (level === "custom") return state.vocabulary.customWords || [];
  return level === "zhongkao" ? ZHONGKAO_VOCABULARY : GAOKAO_VOCABULARY;
}

function vocabularyLevelLabel(level = currentVocabularyLevel()) {
  if (level === "custom") return "我的";
  return level === "zhongkao" ? "中考" : "高考";
}

function vocabularyStorageKey(word, level = currentVocabularyLevel()) {
  return `${level}:${word}`;
}

function vocabWordByKey(key) {
  const separator = key.indexOf(":");
  const level = separator >= 0 ? key.slice(0, separator) : "gaokao";
  const word = separator >= 0 ? key.slice(separator + 1) : key;
  if (level !== currentVocabularyLevel()) return null;
  return vocabularyBank(level).find((item) => item.word === word);
}

function setVocabularyExamLevel(level) {
  const nextLevel = ["gaokao", "zhongkao", "custom"].includes(level) ? level : "gaokao";
  if (nextLevel === currentVocabularyLevel()) return;
  state.vocabulary.examLevel = nextLevel;
  state.vocabulary.active = [];
  state.vocabulary.index = 0;
  state.vocabulary.sessionDate = "";
  state.vocabulary.roundId = "";
  currentVocabTab = "today";
  vocabMeaningVisible = false;
  saveState();
  renderVocabulary();
  showToast(`已切换到${vocabularyLevelLabel()}词库`);
}

function dueVocabularyKeys() {
  const today = localDateKey();
  return Object.entries(state.vocabulary.unfamiliar)
    .filter(([, record]) => record.nextReview <= today)
    .sort((a, b) => a[1].nextReview.localeCompare(b[1].nextReview))
    .map(([key]) => key)
    .filter((key) => vocabWordByKey(key));
}

function shuffleVocabulary(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function addReviewDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function reviewDateLabel(dateKey) {
  const today = localDateKey();
  if (dateKey <= today) return "今天复习";
  if (dateKey === addReviewDays(today, 1)) return "明天复习";
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}月${Number(day)}日复习`;
}

function renderVocabulary() {
  const level = currentVocabularyLevel();
  const levelLabel = vocabularyLevelLabel(level);
  const bank = vocabularyBank(level);
  const dueKeys = dueVocabularyKeys();
  const unfamiliarCount = Object.keys(state.vocabulary.unfamiliar).filter((key) => vocabWordByKey(key)).length;
  const masteredCount = Object.keys(state.vocabulary.mastered).filter((key) => vocabWordByKey(key)).length;
  document.querySelector("#vocabDueCount").textContent = dueKeys.length;
  document.querySelector("#vocabPageTitle").textContent = `${levelLabel}词汇`;
  document.querySelector("#vocabPageDescription").textContent = level === "custom"
    ? "从照片导入自己的英语单词，并按记忆周期随机复习。"
    : `从完整${levelLabel}考试词库随机学习，并按记忆周期安排复习。`;
  document.querySelector("#vocabLevelLabel").textContent = level === "custom" ? "照片导入词汇" : `${levelLabel}考试词汇`;
  document.querySelectorAll("#vocabExamLevel [data-exam-level]").forEach((button) => button.classList.toggle("active", button.dataset.examLevel === level));
  document.querySelector("#vocabSummary").innerHTML = [
    [`${levelLabel}词库`, bank.length],
    ["今日到期", dueKeys.length],
    ["不熟悉", unfamiliarCount],
    ["已熟练", masteredCount]
  ].map(([label, value]) => `<div class="vocab-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");

  document.querySelectorAll("#vocabTabs [data-vocab-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.vocabTab === currentVocabTab);
  });
  document.querySelectorAll(".vocab-view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#vocabView${currentVocabTab[0].toUpperCase()}${currentVocabTab.slice(1)}`).classList.add("active");

  renderVocabularyToday(dueKeys);
  renderUnfamiliarWords();
  renderMasteredWords();
}

function renderVocabularyToday(dueKeys = dueVocabularyKeys()) {
  const today = localDateKey();
  const hasCurrentSession = state.vocabulary.active.length > 0 && state.vocabulary.sessionDate === today;
  const complete = hasCurrentSession && state.vocabulary.index >= state.vocabulary.active.length;
  document.querySelector("#vocabSetup").hidden = hasCurrentSession;
  document.querySelector("#vocabSession").hidden = !hasCurrentSession || complete;
  document.querySelector("#vocabComplete").hidden = !complete;
  document.querySelector("#vocabCount").value = String(state.vocabulary.selectedCount || 20);
  document.querySelector("#vocabDueHint").textContent = dueKeys.length
    ? `今天有 ${dueKeys.length} 个单词到期，将优先加入本轮。`
    : "今天没有到期单词，本轮将随机生成新词。";

  if (!hasCurrentSession || complete) {
    if (complete) {
      document.querySelector("#vocabCompleteText").textContent = `已完成 ${state.vocabulary.active.length} 个单词，本轮结果已保存。`;
    }
    return;
  }

  const key = state.vocabulary.active[state.vocabulary.index];
  const word = vocabWordByKey(key);
  if (!word) {
    state.vocabulary.index += 1;
    saveState();
    renderVocabularyToday(dueKeys);
    return;
  }
  const record = state.vocabulary.unfamiliar[key];
  const progress = Math.round((state.vocabulary.index / state.vocabulary.active.length) * 100);
  document.querySelector("#vocabProgressText").textContent = `${state.vocabulary.index + 1} / ${state.vocabulary.active.length}`;
  document.querySelector("#vocabProgressBar").style.width = `${progress}%`;
  document.querySelector("#vocabCardSource").textContent = record ? (record.nextReview <= today ? "到期复习" : "主动复习") : "随机新词";
  document.querySelector("#wordStage").textContent = record ? `记忆第 ${record.stage + 1} 轮` : `${vocabularyLevelLabel()}考试词`;
  document.querySelector("#currentWord").textContent = word.word;
  document.querySelector("#currentMeaning").textContent = word.meaning;
  document.querySelector("#wordMeaning").hidden = !vocabMeaningVisible;
  document.querySelector("#revealWord").hidden = vocabMeaningVisible;
  document.querySelector("#wordActions").hidden = !vocabMeaningVisible;
}

function renderUnfamiliarWords() {
  const entries = Object.entries(state.vocabulary.unfamiliar)
    .map(([key, record]) => ({ word: vocabWordByKey(key), key, record }))
    .filter((item) => item.word)
    .sort((a, b) => a.record.nextReview.localeCompare(b.record.nextReview));
  document.querySelector("#unfamiliarEmpty").hidden = entries.length > 0;
  document.querySelector("#unfamiliarWordList").innerHTML = entries.map(({ word, key, record }) => `
    <article class="word-list-item">
      <div class="word-list-name"><strong>${word.word}</strong><span>记忆第 ${record.stage + 1} 轮</span></div>
      <div class="word-list-meaning">${word.meaning}</div>
      <div class="review-date"><strong>${reviewDateLabel(record.nextReview)}</strong><span>下次间隔 ${REVIEW_INTERVALS[record.stage] || 30} 天</span></div>
      <div class="word-list-actions"><button type="button" data-vocab-review="${key}">立即复习</button><button class="primary-list-action" type="button" data-vocab-master="${key}">标为熟练</button></div>
    </article>
  `).join("");
}

function renderMasteredWords() {
  const entries = Object.entries(state.vocabulary.mastered)
    .map(([key, record]) => ({ word: vocabWordByKey(key), key, record }))
    .filter((item) => item.word)
    .sort((a, b) => b.record.markedAt.localeCompare(a.record.markedAt));
  document.querySelector("#masteredEmpty").hidden = entries.length > 0;
  document.querySelector("#masteredWordList").innerHTML = entries.map(({ word, key, record }) => `
    <article class="word-list-item">
      <div class="word-list-name"><strong>${word.word}</strong><span>${record.markedAt} 归档</span></div>
      <div class="word-list-meaning">${word.meaning}</div>
      <div class="review-date"><strong>已熟练</strong><span>不再进入复习队列</span></div>
      <div class="word-list-actions"><button type="button" data-vocab-relearn="${key}">重新学习</button></div>
    </article>
  `).join("");
}

function generateVocabularyRound() {
  const countInput = document.querySelector("#vocabCount");
  const count = Math.max(1, Math.min(100, Math.round(Number(countInput.value) || 20)));
  countInput.value = String(count);
  if (!vocabularyBank().length) {
    showToast("请先上传单词照片，建立我的词库");
    return;
  }
  const dueKeys = dueVocabularyKeys();
  const mastered = state.vocabulary.mastered;
  const unfamiliar = state.vocabulary.unfamiliar;
  const newKeys = shuffleVocabulary(vocabularyBank()
    .map((item) => vocabularyStorageKey(item.word))
    .filter((key) => !mastered[key] && !unfamiliar[key]));
  const futureReviewKeys = shuffleVocabulary(Object.keys(unfamiliar).filter((key) => vocabWordByKey(key) && !dueKeys.includes(key)));
  const selected = [...dueKeys, ...newKeys, ...futureReviewKeys].slice(0, count);
  if (!selected.length) {
    showToast("当前词库中的单词都已熟练");
    return;
  }
  state.vocabulary.selectedCount = count;
  state.vocabulary.active = selected;
  state.vocabulary.index = 0;
  state.vocabulary.sessionDate = localDateKey();
  state.vocabulary.roundId = `vr-${Date.now()}`;
  vocabMeaningVisible = false;
  saveState();
  renderVocabulary();
  showToast(`已生成 ${selected.length} 个单词`);
}

function revealVocabularyMeaning() {
  vocabMeaningVisible = true;
  renderVocabularyToday();
}

function classifyCurrentWord(action) {
  const key = state.vocabulary.active[state.vocabulary.index];
  if (!key) return;
  const today = localDateKey();
  const current = state.vocabulary.unfamiliar[key];
  if (action === "mastered") {
    delete state.vocabulary.unfamiliar[key];
    state.vocabulary.mastered[key] = { markedAt: today };
  } else if (action === "unfamiliar") {
    delete state.vocabulary.mastered[key];
    state.vocabulary.unfamiliar[key] = { stage: 0, lastReview: today, nextReview: addReviewDays(today, REVIEW_INTERVALS[0]) };
  } else {
    const stage = Math.min((current?.stage ?? -1) + 1, REVIEW_INTERVALS.length - 1);
    delete state.vocabulary.mastered[key];
    state.vocabulary.unfamiliar[key] = { stage, lastReview: today, nextReview: addReviewDays(today, REVIEW_INTERVALS[stage]) };
  }
  state.vocabulary.index += 1;
  vocabMeaningVisible = false;
  const completed = state.vocabulary.index >= state.vocabulary.active.length;
  const earned = completed && state.vocabulary.active.length >= 5 && awardCoins(10, `完成 ${state.vocabulary.active.length} 个${vocabularyLevelLabel()}词汇`, `vocabulary:${state.vocabulary.roundId || state.vocabulary.sessionDate}`);
  saveState();
  renderVocabulary();
  if (earned) showToast("本轮背诵完成，获得 10 金币");
}

function startVocabularyReview(key) {
  if (!vocabWordByKey(key)) return;
  state.vocabulary.active = [key];
  state.vocabulary.index = 0;
  state.vocabulary.sessionDate = localDateKey();
  state.vocabulary.roundId = `vr-${Date.now()}`;
  currentVocabTab = "today";
  vocabMeaningVisible = false;
  saveState();
  renderVocabulary();
}

function markVocabularyMastered(key) {
  if (!vocabWordByKey(key)) return;
  delete state.vocabulary.unfamiliar[key];
  state.vocabulary.mastered[key] = { markedAt: localDateKey() };
  saveState();
  renderVocabulary();
  showToast("单词已归纳到熟练词汇");
}

function relearnVocabulary(key) {
  if (!vocabWordByKey(key)) return;
  delete state.vocabulary.mastered[key];
  state.vocabulary.unfamiliar[key] = { stage: 0, lastReview: localDateKey(), nextReview: localDateKey() };
  saveState();
  currentVocabTab = "unfamiliar";
  renderVocabulary();
  showToast("单词已移回复习队列");
}

function speakCurrentWord() {
  const key = state.vocabulary.active[state.vocabulary.index];
  const word = key ? vocabWordByKey(key) : null;
  if (!word || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word.word);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function openVocabImportModal() {
  pendingVocabImage = "";
  document.querySelector("#vocabImportImage").value = "";
  document.querySelector("#vocabImportText").value = "";
  document.querySelector("#vocabImportDropZone").hidden = false;
  document.querySelector("#vocabImportPreview").hidden = true;
  document.querySelector("#vocabImportSource").hidden = false;
  document.querySelector("#vocabImportResult").hidden = true;
  document.querySelector("#vocabOcrProgress").textContent = "图片已准备好";
  updateVocabImportCount();
  vocabImportModal.showModal();
}

async function handleVocabImportImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("请选择一张英语单词图片");
    return;
  }
  try {
    pendingVocabImage = await resizeImage(file);
    document.querySelector("#vocabImportPreviewImage").src = pendingVocabImage;
    document.querySelector("#vocabImportDropZone").hidden = true;
    document.querySelector("#vocabImportPreview").hidden = false;
    document.querySelector("#vocabOcrProgress").textContent = "图片已准备好";
  } catch {
    showToast("图片读取失败，请重新选择");
  }
}

function extractEnglishWords(text = "") {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  return [...new Set(words.map((word) => word.toLowerCase()).filter((word) => word.length > 1))];
}

function knownVocabularyMeaning(word) {
  const normalized = word.toLowerCase();
  const known = [...GAOKAO_VOCABULARY, ...ZHONGKAO_VOCABULARY, ...(state.vocabulary.customWords || [])]
    .find((item) => item.word.toLowerCase() === normalized);
  return known?.meaning || "";
}

function parseImportedVocabulary(text = "") {
  const entries = new Map();
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const parts = line.split(/\s*[|｜]\s*/);
    if (parts.length > 1) {
      const word = extractEnglishWords(parts.shift())[0];
      if (!word) return;
      const meaning = parts.join(" | ").trim() || knownVocabularyMeaning(word) || "自定义词汇（待补充释义）";
      entries.set(word, { word, meaning });
      return;
    }
    extractEnglishWords(line).forEach((word) => {
      if (!entries.has(word)) entries.set(word, { word, meaning: knownVocabularyMeaning(word) || "自定义词汇（待补充释义）" });
    });
  });
  return [...entries.values()];
}

function updateVocabImportCount() {
  const count = parseImportedVocabulary(document.querySelector("#vocabImportText").value).length;
  document.querySelector("#vocabImportCount").textContent = `识别到 ${count} 个单词`;
}

function showVocabImportResult(ocrText, ocrAvailable) {
  const words = extractEnglishWords(ocrText);
  document.querySelector("#vocabImportSource").hidden = true;
  document.querySelector("#vocabImportResult").hidden = false;
  document.querySelector("#vocabImportResultTitle").textContent = ocrAvailable ? words.length ? "识别完成" : "没有识别到清晰单词" : "自动识别暂不可用";
  document.querySelector("#vocabImportResultHint").textContent = ocrAvailable
    ? "请核对单词，可在竖线后补充或修改中文释义。"
    : "可以在下方手动输入，每行一个单词；识别服务恢复后可重新尝试。";
  document.querySelector("#vocabImportText").value = words.map((word) => {
    const meaning = knownVocabularyMeaning(word);
    return meaning ? `${word} | ${meaning}` : word;
  }).join("\n");
  updateVocabImportCount();
}

function waitForTesseract() {
  if (window.Tesseract?.recognize) return Promise.resolve(true);
  return new Promise((resolve) => {
    let checks = 0;
    const interval = setInterval(() => {
      checks += 1;
      if (window.Tesseract?.recognize || checks >= 50) {
        clearInterval(interval);
        resolve(Boolean(window.Tesseract?.recognize));
      }
    }, 100);
  });
}

async function recognizeVocabImage() {
  if (!pendingVocabImage) {
    showToast("请先拍照或从手机相册导入图片");
    return;
  }
  const button = document.querySelector("#recognizeVocabImage");
  const progress = document.querySelector("#vocabOcrProgress");
  button.disabled = true;
  button.textContent = "正在加载识别模型...";
  progress.textContent = "准备英文识别模型";
  try {
    const available = await waitForTesseract();
    if (!available) {
      showVocabImportResult("", false);
      return;
    }
    button.textContent = "正在识别...";
    const result = await window.Tesseract.recognize(pendingVocabImage, "eng", {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
      langPath: new URL("ocr-data", document.baseURI).href.replace(/\/$/, ""),
      logger(message) {
        if (message.status === "recognizing text") progress.textContent = `正在识别 ${Math.round((message.progress || 0) * 100)}%`;
        else if (message.status) progress.textContent = "正在准备识别";
      }
    });
    showVocabImportResult(result.data?.text || "", true);
  } catch {
    showVocabImportResult("", false);
    showToast("自动识别失败，可以手动录入单词");
  } finally {
    button.disabled = false;
    button.textContent = "识别图片单词";
  }
}

function saveImportedVocabulary(event) {
  event.preventDefault();
  const imported = parseImportedVocabulary(document.querySelector("#vocabImportText").value);
  if (!imported.length) {
    showToast("请至少保留一个有效的英文单词");
    return;
  }
  const words = new Map((state.vocabulary.customWords || []).map((item) => [item.word.toLowerCase(), item]));
  imported.forEach((item) => {
    const existing = words.get(item.word);
    const meaning = item.meaning === "自定义词汇（待补充释义）" && existing?.meaning ? existing.meaning : item.meaning;
    words.set(item.word, { word: item.word, meaning });
  });
  state.vocabulary.customWords = [...words.values()];
  state.vocabulary.examLevel = "custom";
  state.vocabulary.active = [];
  state.vocabulary.index = 0;
  state.vocabulary.sessionDate = "";
  state.vocabulary.roundId = "";
  currentVocabTab = "today";
  vocabMeaningVisible = false;
  saveState();
  vocabImportModal.close();
  renderVocabulary();
  showToast(`已保存 ${imported.length} 个单词到我的词库`);
}

function renderMaterials() {
  const materials = Array.isArray(state.materials) ? state.materials : [];
  const categories = ["全部", ...MATERIAL_CATEGORIES];
  if (!categories.includes(currentMaterialCategory)) currentMaterialCategory = "全部";
  document.querySelector("#materialFilters").innerHTML = categories.map((category) => `<button class="segment-button ${category === currentMaterialCategory ? "active" : ""}" type="button" data-material-category="${category}">${category}</button>`).join("");

  const query = document.querySelector("#materialSearch").value.trim().toLowerCase();
  const filtered = materials.filter((item) => {
    const matchesCategory = currentMaterialCategory === "全部" || item.category === currentMaterialCategory;
    const haystack = `${item.title} ${item.content} ${item.source} ${(item.keywords || []).join(" ")}`.toLowerCase();
    return matchesCategory && haystack.includes(query);
  });

  const photoCount = materials.filter((item) => item.sourceType === "photo").length;
  const videoCount = materials.filter((item) => item.sourceType === "video").length;
  const categoryCount = new Set(materials.map((item) => item.category)).size;
  document.querySelector("#materialSummary").innerHTML = [
    ["素材总数", materials.length],
    ["图片摘录", photoCount],
    ["视频摘录", videoCount],
    ["已覆盖主题", categoryCount]
  ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");

  document.querySelector("#materialGrid").innerHTML = filtered.map((item) => {
    const sourceLabel = item.sourceType === "video" ? "视频摘录" : "图片摘录";
    const keywords = (item.keywords || []).slice(0, 4);
    return `
      <article class="material-card">
        <div class="material-card-top ${item.image ? "has-image" : ""}">
          ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.title)}的来源图片">` : `<span class="material-type-mark">${item.sourceType === "video" ? "播" : "摘"}</span>`}
          <div><span>${sourceLabel}</span><strong>${escapeHtml(item.category)}</strong></div>
        </div>
        <div class="material-card-body">
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(materialExcerpt(item.content))}</p>
          <div class="tag-row">${keywords.map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>
        </div>
        <div class="material-card-footer">
          <span title="${escapeHtml(item.source)}">${escapeHtml(item.source)}</span>
          <div><button type="button" data-material-copy="${item.id}">复制</button><button type="button" data-material-view="${item.id}">查看全文</button></div>
        </div>
      </article>`;
  }).join("");
  document.querySelector("#materialEmpty").hidden = filtered.length > 0;
  document.querySelector("#materialNavCount").textContent = materials.length;
}

function materialExcerpt(content = "") {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 105 ? `${compact.slice(0, 105)}...` : compact;
}

function openMaterialModal() {
  resetMaterialModal();
  materialModal.showModal();
}

function resetMaterialModal() {
  pendingMaterialImage = "";
  document.querySelector("#materialImage").value = "";
  document.querySelector("#materialVideoUrl").value = "";
  document.querySelector("#materialVideoText").value = "";
  document.querySelector("#materialImagePreview").hidden = true;
  document.querySelector("#materialDropZone").hidden = false;
  document.querySelector("#materialSourceStep").hidden = false;
  document.querySelector("#materialResult").hidden = true;
  setMaterialSourceMode("photo");
}

function setMaterialSourceMode(mode) {
  materialSourceMode = mode === "video" ? "video" : "photo";
  document.querySelectorAll("#materialSourceTabs [data-material-source]").forEach((button) => button.classList.toggle("active", button.dataset.materialSource === materialSourceMode));
  document.querySelector("#materialPhotoPanel").classList.toggle("active", materialSourceMode === "photo");
  document.querySelector("#materialVideoPanel").classList.toggle("active", materialSourceMode === "video");
  document.querySelector("#materialSourceHint").textContent = materialSourceMode === "photo"
    ? pendingMaterialImage ? "图片已准备好，可以开始提取" : "请选择一张含有清晰文字的图片"
    : "粘贴视频字幕或文案后开始整理素材";
}

async function handleMaterialImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("请选择一张含文字的图片");
    return;
  }
  try {
    pendingMaterialImage = await resizeImage(file);
    document.querySelector("#materialPreviewImage").src = pendingMaterialImage;
    document.querySelector("#materialDropZone").hidden = true;
    document.querySelector("#materialImagePreview").hidden = false;
    setMaterialSourceMode("photo");
  } catch {
    showToast("图片读取失败，请重新选择");
  }
}

function isValidVideoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeMaterialText(value = "") {
  return value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function splitMaterialSentences(text = "") {
  return normalizeMaterialText(text)
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
}

function inferMaterialTitle(text = "", fallback = "视频关键观点摘录") {
  const firstLine = normalizeMaterialText(text).split(/\n+/).find(Boolean) || fallback;
  return firstLine.replace(/[#【】]/g, "").slice(0, 28);
}

function inferMaterialKeywords(text = "") {
  const candidates = ["坚持", "成长", "选择", "责任", "科技", "文化", "自然", "青年", "奋斗", "创新", "规则", "理想", "时代", "社会", "人物", "观点"];
  const matched = candidates.filter((word) => text.includes(word)).slice(0, 5);
  return matched.length ? matched.join("、") : "观点、事例、写作主题";
}

function buildVideoMaterialContent(text = "") {
  const clean = normalizeMaterialText(text);
  const sentences = splitMaterialSentences(clean);
  const quote = sentences.find((sentence) => sentence.length <= 70) || sentences[0] || clean.slice(0, 70);
  const summary = sentences.slice(0, 3).join("");
  return `关键文字：${quote}\n\n内容概括：${summary || clean.slice(0, 120)}\n\n可用主题：可结合材料内容补充为成长、选择、责任、时代、科技或文化等作文角度。\n\n原始摘录：\n${clean}`;
}

function extractMaterialDraft() {
  const videoUrl = document.querySelector("#materialVideoUrl").value.trim();
  const videoText = normalizeMaterialText(document.querySelector("#materialVideoText").value);
  if (materialSourceMode === "photo" && !pendingMaterialImage) {
    showToast("请先拍照或从手机相册导入图片");
    return;
  }
  if (materialSourceMode === "video" && !isValidVideoUrl(videoUrl)) {
    showToast("请填写完整、有效的视频链接");
    return;
  }
  if (materialSourceMode === "video" && videoText.length < 12) {
    showToast("请先粘贴视频字幕、简介或关键段落");
    return;
  }

  const button = document.querySelector("#extractMaterial");
  button.disabled = true;
  button.textContent = "正在建立摘录...";
  setTimeout(() => {
    fillMaterialDraft(videoUrl, videoText);
    button.disabled = false;
    button.textContent = "开始提取";
  }, 800);
}

function fillMaterialDraft(videoUrl, videoText = "") {
  const isVideo = materialSourceMode === "video";
  document.querySelector("#materialSourceStep").hidden = true;
  document.querySelector("#materialResult").hidden = false;
  document.querySelector("#materialTitle").value = isVideo ? inferMaterialTitle(videoText) : "图片文字摘录（待核对）";
  document.querySelector("#materialCategory").value = isVideo ? "社会" : "成长";
  document.querySelector("#materialSource").value = isVideo ? videoUrl : "图片摘录（请补充书名、文章名或作者）";
  document.querySelector("#materialKeywords").value = isVideo ? inferMaterialKeywords(videoText) : "观点、事例、写作主题";
  document.querySelector("#materialContent").value = isVideo
    ? buildVideoMaterialContent(videoText)
    : "【请根据原图核对并替换以下内容】\n\n关键文字：摘录图片中最有信息量或表现力的句子。\n\n内容概括：用自己的话概括事件、人物或观点。\n\n写作角度：说明这段素材可以用于哪些作文主题。";
}

function saveMaterial(event) {
  event.preventDefault();
  const title = document.querySelector("#materialTitle").value.trim();
  const content = document.querySelector("#materialContent").value.trim();
  const source = document.querySelector("#materialSource").value.trim();
  if (!title || !content || !source) {
    showToast("请补充标题、来源和素材内容");
    return;
  }
  const keywords = [...new Set(document.querySelector("#materialKeywords").value.split(/[，,、\s]+/).map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 8);
  if (!Array.isArray(state.materials)) state.materials = [];
  const material = {
    id: `ma-${Date.now()}`,
    title,
    category: document.querySelector("#materialCategory").value,
    source,
    sourceType: materialSourceMode,
    keywords,
    content,
    date: localDateKey().slice(5),
    image: materialSourceMode === "photo" ? pendingMaterialImage : ""
  };
  state.materials.unshift(material);
  awardCoins(3, "整理一条作文素材", `material:${material.id}`);
  saveState();
  materialModal.close();
  renderAll();
  switchPage("materials");
  showToast("作文素材已保存，获得 3 金币");
}

function openMaterialDetail(id) {
  const item = (state.materials || []).find((material) => material.id === id);
  if (!item) return;
  activeMaterialId = id;
  document.querySelector("#materialDetailCategory").textContent = `${item.category} · ${item.sourceType === "video" ? "视频摘录" : "图片摘录"}`;
  document.querySelector("#materialDetailTitle").textContent = item.title;
  document.querySelector("#materialDetailMeta").innerHTML = `<span>来源：${escapeHtml(item.source)}</span><span>录入：${escapeHtml(item.date)}</span><div class="tag-row">${(item.keywords || []).map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>`;
  document.querySelector("#materialDetailContent").innerHTML = escapeHtml(item.content).replace(/\n/g, "<br>");
  materialDetailModal.showModal();
}

function materialCopyText(item) {
  return `${item.title}\n\n${item.content}\n\n来源：${item.source}`;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("素材已复制");
}

function copyMaterialById(id) {
  const item = (state.materials || []).find((material) => material.id === id);
  if (item) copyText(materialCopyText(item));
}

function renderMistakes() {
  const subjects = ["全部", ...HIGH_SCHOOL_SUBJECTS];
  if (!subjects.includes(currentSubject)) currentSubject = "全部";
  document.querySelector("#subjectFilters").innerHTML = subjects.map((subject) => `<button class="segment-button ${subject === currentSubject ? "active" : ""}" type="button" data-subject="${subject}">${subject}</button>`).join("");

  const query = document.querySelector("#mistakeSearch").value.trim().toLowerCase();
  const filtered = state.mistakes.filter((item) => {
    const matchesSubject = currentSubject === "全部" || item.subject === currentSubject;
    const haystack = `${item.question} ${item.knowledge} ${item.type}`.toLowerCase();
    return matchesSubject && haystack.includes(query);
  });
  const validIds = new Set(state.mistakes.map((item) => item.id));
  selectedMistakeIds = new Set([...selectedMistakeIds].filter((id) => validIds.has(id)));
  currentVisibleMistakeIds = filtered.map((item) => item.id);

  document.querySelector("#mistakeGrid").innerHTML = filtered.map((item) => `
    <article class="mistake-card ${selectedMistakeIds.has(item.id) ? "selected-for-paper" : ""}">
      <div class="question-visual">
        <label class="mistake-paper-check"><input type="checkbox" data-paper-select="${item.id}" ${selectedMistakeIds.has(item.id) ? "checked" : ""}><span>选入试卷</span></label>
        ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.subject)}题目图片">` : `<div class="equation">${escapeHtml(item.question)}</div>`}
      </div>
      <div class="card-body">
        <div class="card-meta"><span class="knowledge-link">${escapeHtml(item.subject)} / ${escapeHtml(item.knowledge)}</span><span class="difficulty ${item.difficulty}">${escapeHtml(item.difficulty)}</span></div>
        <h2>${escapeHtml(item.question)}</h2>
        <div class="tag-row"><span class="tag">题型：${escapeHtml(item.type)}</span><span class="tag">${item.reviewed ? "已复习" : "待复习"}</span></div>
        <p class="card-reason">错误原因：${escapeHtml(item.reason || "暂未填写")}</p>
      </div>
      <div class="card-footer"><span class="review-state">录入 ${item.date}</span><button class="review-button" type="button" data-review-id="${item.id}">${item.reviewed ? "标记待复习" : "完成复习"}</button></div>
    </article>
  `).join("");
  document.querySelector("#mistakeEmpty").hidden = filtered.length > 0;
  document.querySelector("#mistakeNavCount").textContent = state.mistakes.length;
  renderPaperSelectionControls();
}

function renderPaperSelectionControls() {
  const count = selectedMistakeIds.size;
  const allVisibleSelected = currentVisibleMistakeIds.length > 0 && currentVisibleMistakeIds.every((id) => selectedMistakeIds.has(id));
  document.querySelector("#paperSelectionCount").textContent = `已选 ${count} 道`;
  document.querySelector("#generatePaper").disabled = count === 0;
  document.querySelector("#clearPaperSelection").disabled = count === 0;
  document.querySelector("#selectVisibleMistakes").textContent = allVisibleSelected ? "取消当前全选" : "全选当前";
}

function toggleVisibleMistakes() {
  if (!currentVisibleMistakeIds.length) return;
  const allSelected = currentVisibleMistakeIds.every((id) => selectedMistakeIds.has(id));
  currentVisibleMistakeIds.forEach((id) => {
    if (allSelected) selectedMistakeIds.delete(id);
    else selectedMistakeIds.add(id);
  });
  renderMistakes();
}

function clearPaperSelection() {
  selectedMistakeIds.clear();
  renderMistakes();
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function generateRandomPaper() {
  const selected = state.mistakes.filter((item) => selectedMistakeIds.has(item.id));
  if (!selected.length) {
    showToast("请先勾选至少一道错题");
    return;
  }
  currentPaperMistakes = shuffleItems(selected);
  renderPaper();
  paperModal.showModal();
}

function renderPaper() {
  const date = new Date();
  const dateText = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const subjects = [...new Set(currentPaperMistakes.map((item) => item.subject))].join("、");
  document.querySelector("#paperQuestionCount").textContent = `共 ${currentPaperMistakes.length} 道题 · ${subjects}`;
  document.querySelector("#printablePaper").innerHTML = `
    <header class="paper-sheet-header">
      <span>拾题学习助手 · 错题随机组卷</span>
      <h1>错题复习试卷</h1>
      <div><span>姓名：${escapeHtml(state.profile.name)}</span><span>年级：${escapeHtml(state.profile.grade)}</span><span>日期：${dateText}</span></div>
    </header>
    <div class="paper-instructions">共 ${currentPaperMistakes.length} 道题。请独立完成后回到错题库核对错误原因。</div>
    <div class="paper-question-list">${currentPaperMistakes.map((item, index) => `
      <section class="paper-question">
        <div class="paper-question-heading"><strong>${index + 1}.</strong><span>${escapeHtml(item.subject)} · ${escapeHtml(item.knowledge)} · ${escapeHtml(item.type)}</span></div>
        ${item.image ? `<img src="${item.image}" alt="第 ${index + 1} 题图片">` : ""}
        <p>${escapeHtml(item.question)}</p>
        <div class="paper-answer-lines"><i></i><i></i><i></i></div>
      </section>
    `).join("")}</div>`;
}

function reshufflePaper() {
  currentPaperMistakes = shuffleItems(currentPaperMistakes);
  renderPaper();
  showToast("试题顺序已重新随机");
}

function waitForPaperImages() {
  const images = [...document.querySelectorAll("#printablePaper img")];
  return Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片生成失败")), "image/png", 1);
  });
}

async function savePaperToAlbum() {
  if (!currentPaperMistakes.length) {
    showToast("请先生成一张错题试卷");
    return;
  }
  if (!window.html2canvas) {
    showToast("图片导出组件加载失败，请刷新后重试");
    return;
  }
  const button = document.querySelector("#savePaperImage");
  const paper = document.querySelector("#printablePaper");
  button.disabled = true;
  button.textContent = "正在生成图片...";
  paper.classList.add("exporting");
  try {
    await waitForPaperImages();
    const canvas = await window.html2canvas(paper, {
      backgroundColor: "#ffffff",
      scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
      useCORS: true,
      logging: false,
      width: paper.scrollWidth,
      height: paper.scrollHeight,
      windowWidth: Math.max(920, paper.scrollWidth)
    });
    const blob = await canvasToBlob(canvas);
    const filename = `错题复习试卷-${localDateKey()}.png`;
    const file = typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;
    if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: "错题复习试卷", files: [file] });
        showToast("已打开系统分享，可选择保存到相册");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("试卷图片已下载，可保存到手机相册");
  } catch {
    showToast("试卷图片生成失败，请减少题目数量后重试");
  } finally {
    paper.classList.remove("exporting");
    button.disabled = false;
    button.textContent = "保存到相册";
  }
}

function renderKnowledge() {
  const groups = aggregateKnowledge();
  const repeatCount = groups.filter((item) => item.count > 1).length;
  const average = groups.length ? Math.round(groups.reduce((sum, item) => sum + item.mastery, 0) / groups.length) : 0;
  const pending = state.mistakes.filter((item) => !item.reviewed).length;
  document.querySelector("#knowledgeSummary").innerHTML = [
    ["已归纳知识点", groups.length],
    ["重复出错知识点", repeatCount],
    ["待复习错题", pending],
    ["平均掌握度", `${average}%`]
  ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");

  document.querySelector("#knowledgeList").innerHTML = groups.length ? groups.map((item) => `
    <article class="knowledge-item">
      <div class="knowledge-name"><strong>${item.knowledge}</strong><span>${item.subject} · 最近录入 ${item.latest}</span></div>
      <div class="type-list">${item.types.map((type) => `<span class="tag">${type}</span>`).join("")}</div>
      <div class="error-count"><strong>${item.count}</strong><span>错题数量</span></div>
      <div class="mastery"><strong>${masteryLabel(item.mastery)} ${item.mastery}%</strong><span>${item.reviewed}/${item.count} 道已复习</span></div>
    </article>
  `).join("") : `<div class="empty-state"><div class="empty-mark">＋</div><h2>还没有知识点分析</h2><p>上传错题后，这里会自动归纳薄弱知识点。</p></div>`;
}

function masteryLabel(value) {
  if (value < 40) return "需要巩固";
  if (value < 70) return "正在提升";
  return "基本掌握";
}

function renderTasks() {
  const groups = ["今天", "本周"];
  document.querySelector("#taskGroups").innerHTML = groups.map((group) => {
    const tasks = state.tasks.filter((task) => task.group === group);
    return `<section class="task-group"><h3>${group}</h3><div class="task-list">${tasks.map((task) => `
      <div class="task-item ${task.done ? "done" : ""}"><button class="task-check" type="button" data-task-id="${task.id}" aria-label="${task.done ? "标记为未完成" : "标记为完成"}">${task.done ? "✓" : ""}</button><div class="task-copy"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.note)}</span></div><span class="task-duration">${task.duration}</span></div>
    `).join("")}</div></section>`;
  }).join("");
  const done = state.tasks.filter((task) => task.done).length;
  const percent = state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0;
  document.querySelector("#planPercent").textContent = `${percent}%`;
  document.querySelector("#planProgressBar").style.width = `${percent}%`;
}

function renderSchedule() {
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const dates = ["3日", "4日", "5日", "6日", "7日", "8日", "9日"];
  document.querySelector("#weekHeader").innerHTML = `<div></div>${days.map((day, index) => `<div class="week-day ${index === 2 ? "today" : ""}"><strong>${day}</strong><span>${dates[index]}</span></div>`).join("")}`;
  const slots = ["18:40", "19:30", "20:30"];
  let cells = "";
  slots.forEach((time, slot) => {
    cells += `<div class="week-time">${time}</div>`;
    days.forEach((_, day) => {
      const block = state.schedule.find((item) => item.day === day && item.slot === slot);
      cells += `<div class="week-cell">${block ? `<div class="time-block ${subjectClass(block.subject)}"><strong>${escapeHtml(block.title)}</strong><br>${block.duration} 分钟</div>` : ""}</div>`;
    });
  });
  document.querySelector("#weekGrid").innerHTML = cells;

  const bySubject = state.schedule.reduce((acc, item) => {
    acc[item.subject] = (acc[item.subject] || 0) + item.duration;
    return acc;
  }, {});
  const total = Object.values(bySubject).reduce((sum, value) => sum + value, 0) || 1;
  document.querySelector("#timeSummary").innerHTML = Object.entries(bySubject).sort((a, b) => b[1] - a[1]).map(([subject, minutes]) => `
    <div class="summary-row"><strong>${subject}</strong><span>${minutes} 分钟</span><div class="summary-line"><i style="width:${Math.round(minutes / total * 100)}%"></i></div></div>
  `).join("");
}

function subjectClass(subject) {
  if (subject === "物理") return "physics";
  if (subject === "英语") return "english";
  if (subject === "复习") return "review";
  return "";
}

function openUploadModal() {
  resetUpload();
  uploadModal.showModal();
}

function resetUpload() {
  pendingImage = "";
  document.querySelector("#questionImage").value = "";
  document.querySelector("#uploadStep").hidden = false;
  document.querySelector("#dropZone").hidden = false;
  document.querySelector("#uploadPreview").hidden = true;
  document.querySelector("#recognitionForm").hidden = true;
}

async function handleImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("请选择一张题目图片");
    return;
  }
  document.querySelector("#dropZone").hidden = true;
  document.querySelector("#uploadPreview").hidden = false;
  document.querySelector("#scanStatus").textContent = "正在识别题目内容...";
  try {
    pendingImage = await resizeImage(file);
    document.querySelector("#previewImage").src = pendingImage;
    setTimeout(fillRecognitionResult, 1450);
  } catch {
    resetUpload();
    showToast("图片读取失败，请换一张清晰照片或截图");
  }
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxWidth = 900;
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function fillRecognitionResult() {
  document.querySelector("#uploadStep").hidden = true;
  document.querySelector("#recognitionForm").hidden = false;
  document.querySelector("#questionText").value = "已知函数 f(x)=x²+ax+1，若函数在区间 [1,+∞) 上单调递增，求实数 a 的取值范围。";
  document.querySelector("#questionSubject").value = "数学";
  document.querySelector("#questionDifficulty").value = "中等";
  document.querySelector("#questionKnowledge").value = "函数的单调性";
  document.querySelector("#questionType").value = "参数讨论题";
  document.querySelector("#questionReason").value = "没有先判断对称轴与区间的位置关系。";
}

function saveQuestion(event) {
  event.preventDefault();
  const question = document.querySelector("#questionText").value.trim();
  const knowledge = document.querySelector("#questionKnowledge").value.trim();
  const type = document.querySelector("#questionType").value.trim();
  if (!question || !knowledge || !type) {
    showToast("请补充题目、知识点和题型");
    return;
  }
  const mistake = {
    id: `m-${Date.now()}`,
    subject: document.querySelector("#questionSubject").value,
    knowledge,
    type,
    difficulty: document.querySelector("#questionDifficulty").value,
    question,
    reason: document.querySelector("#questionReason").value.trim(),
    date: "08-05",
    reviewed: false,
    image: pendingImage
  };
  state.mistakes.unshift(mistake);
  awardCoins(3, "整理一道错题", `mistake-added:${mistake.id}`);
  saveState();
  uploadModal.close();
  renderAll();
  switchPage("mistakes");
  showToast("错题已保存，获得 3 金币");
}

function subjectOptions(includeReview = false) {
  const subjects = includeReview ? [...HIGH_SCHOOL_SUBJECTS, "复习"] : HIGH_SCHOOL_SUBJECTS;
  return subjects.map((subject) => `<option>${subject}</option>`).join("");
}

function localDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function ensureFocusDay() {
  const today = localDateKey();
  if (state.focus.date === today) return;
  state.focus.date = today;
  state.focus.sessions = 0;
  state.focus.minutes = 0;
  saveState();
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function renderTimer() {
  ensureFocusDay();
  const display = formatTimer(timerRemaining);
  document.querySelector("#timerDisplay").textContent = display;
  document.querySelector("#timerDisplay").dateTime = `PT${Math.ceil(timerRemaining / 60)}M`;
  document.querySelector("#timerSession").textContent = `今日已完成 ${state.focus.sessions} 次，共 ${state.focus.minutes} 分钟`;
  document.querySelector("#focusTimer").classList.toggle("running", timerRunning);
  document.querySelector("#timerStart").textContent = timerRunning ? "Ⅱ 暂停" : timerRemaining === 0 ? "▶ 再来一次" : timerRemaining < timerDuration ? "▶ 继续专注" : "▶ 开始专注";
  document.querySelector("#timerStatus").textContent = timerRunning
    ? "保持专注，当前任务完成前尽量不切换页面"
    : timerRemaining === 0
      ? "本轮专注已完成，可以休息几分钟"
      : timerRemaining < timerDuration
        ? "计时已暂停，准备好后继续"
        : "选择时长，开始一段不被打扰的学习";
  document.querySelectorAll("#timerPresets [data-minutes]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.minutes) * 60 === timerDuration);
  });
  const customInput = document.querySelector("#customTimerMinutes");
  const currentMinutes = Math.round(timerDuration / 60);
  if (document.activeElement !== customInput && ![15, 25, 45, 52].includes(currentMinutes)) customInput.value = String(currentMinutes);
  document.title = timerRunning ? `${display} · 拾题` : "拾题学习助手";
}

function setTimerPreset(minutes) {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  timerDuration = minutes * 60;
  timerRemaining = timerDuration;
  state.focus.preset = minutes;
  saveState();
  renderTimer();
}

function applyCustomTimer() {
  const input = document.querySelector("#customTimerMinutes");
  const minutes = Math.round(Number(input.value));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
    showToast("自定义时长需在 1 到 180 分钟之间");
    input.focus();
    return;
  }
  input.value = String(minutes);
  setTimerPreset(minutes);
  showToast(`专注时长已设为 ${minutes} 分钟`);
}

function tickTimer() {
  timerRemaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
  if (timerRemaining === 0) finishTimer();
  renderTimer();
}

function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRunning = false;
    timerRemaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    renderTimer();
    return;
  }
  if (timerRemaining === 0) timerRemaining = timerDuration;
  timerEndAt = Date.now() + timerRemaining * 1000;
  timerRunning = true;
  timerInterval = setInterval(tickTimer, 250);
  renderTimer();
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  timerRemaining = timerDuration;
  renderTimer();
}

function finishTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  timerRemaining = 0;
  const focusedMinutes = Math.round(timerDuration / 60);
  const previousLevel = profileLevelData().level;
  state.focus.sessions += 1;
  state.focus.minutes += focusedMinutes;
  state.progress.totalFocusMinutes += focusedMinutes;
  const currentLevel = profileLevelData().level;
  awardCoins(15, `完成 ${focusedMinutes} 分钟专注`, `focus:${localDateKey()}:${state.focus.sessions}`);
  saveState();
  renderProfile();
  playTimerTone();
  showToast(currentLevel > previousLevel ? `专注完成，等级提升到 Lv. ${currentLevel}` : "本轮专注完成，获得 15 金币");
}

function playTimerTone() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    setTimeout(() => context.close(), 700);
  } catch {
    // The visual completion message remains available when audio is blocked.
  }
}

function openSimple(type, itemId = "") {
  simpleMode = type;
  editingRewardId = type === "reward" ? itemId : "";
  const fields = document.querySelector("#simpleFields");
  fields.className = "simple-fields";
  if (type === "profile") {
    document.querySelector("#simpleKicker").textContent = "个人资料";
    document.querySelector("#simpleTitle").textContent = "修改用户名";
    fields.innerHTML = `
      <label class="field">用户名<input name="name" required minlength="1" maxlength="12" value="${escapeHtml(state.profile.name)}" placeholder="请输入用户名"></label>
      <p class="profile-helper">用户名会显示在侧栏和首页问候语中。</p>`;
  } else if (type === "task") {
    document.querySelector("#simpleKicker").textContent = "学习规划";
    document.querySelector("#simpleTitle").textContent = "新增学习任务";
    fields.innerHTML = `
      <label class="field">任务名称<input name="title" required placeholder="例如：复习三角函数错题"></label>
      <label class="field">任务说明<input name="note" placeholder="资料范围或完成标准"></label>
      <div class="field-grid"><label class="field">计划范围<select name="group"><option>今天</option><option>本周</option></select></label><label class="field">预计时长<input name="duration" value="30 分钟"></label></div>`;
  } else if (type === "reward") {
    const reward = state.reward.items.find((item) => item.id === editingRewardId);
    document.querySelector("#simpleKicker").textContent = "学习奖励";
    document.querySelector("#simpleTitle").textContent = reward ? "编辑奖励" : "添加一个奖励";
    fields.innerHTML = `
      <label class="field">奖励名称<input name="title" required maxlength="30" value="${escapeHtml(reward?.title || "")}" placeholder="例如：看一场喜欢的电影"></label>
      <label class="field">奖励说明<input name="description" maxlength="60" value="${escapeHtml(reward?.description || "")}" placeholder="在什么条件下、怎样兑现"></label>
      <label class="field">所需金币<input name="cost" type="number" min="5" max="999" step="5" value="${reward?.cost || 50}" required></label>`;
  } else {
    document.querySelector("#simpleKicker").textContent = "时间规划";
    document.querySelector("#simpleTitle").textContent = "添加时间块";
    fields.innerHTML = `
      <label class="field">学习内容<input name="title" required placeholder="例如：物理错题复盘"></label>
      <div class="field-grid"><label class="field">星期<select name="day"><option value="0">周一</option><option value="1">周二</option><option value="2">周三</option><option value="3">周四</option><option value="4">周五</option><option value="5">周六</option><option value="6">周日</option></select></label><label class="field">时间<select name="slot"><option value="0">18:40</option><option value="1">19:30</option><option value="2">20:30</option></select></label></div>
      <div class="field-grid"><label class="field">学科<select name="subject">${subjectOptions(true)}</select></label><label class="field">时长（分钟）<input name="duration" type="number" min="10" max="180" value="40"></label></div>`;
  }
  simpleModal.showModal();
}

function saveSimple(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  if (simpleMode === "profile") {
    const name = data.get("name").trim();
    if (!name) {
      showToast("用户名不能为空");
      return;
    }
    state.profile.name = name;
    showToast("用户名已更新");
  } else if (simpleMode === "task") {
    state.tasks.push({ id: `t-${Date.now()}`, group: data.get("group"), title: data.get("title").trim(), note: data.get("note").trim() || "自定义学习任务", duration: data.get("duration").trim() || "30 分钟", done: false });
    showToast("学习任务已添加");
  } else if (simpleMode === "reward") {
    ensureRewardState();
    const reward = state.reward.items.find((item) => item.id === editingRewardId);
    const values = { title: data.get("title").trim(), description: data.get("description").trim(), cost: Number(data.get("cost")) || 50 };
    if (reward) {
      Object.assign(reward, values);
      showToast("奖励设置已更新");
    } else {
      state.reward.items.push({ id: `r-${Date.now()}`, ...values });
      showToast("自定义奖励已添加");
    }
  } else {
    const day = Number(data.get("day"));
    const slot = Number(data.get("slot"));
    const existing = state.schedule.find((item) => item.day === day && item.slot === slot);
    if (existing) {
      showToast("这个时间已有安排，请选择其他时段");
      return;
    }
    state.schedule.push({ id: `s-${Date.now()}`, day, slot, title: data.get("title").trim(), subject: data.get("subject"), duration: Number(data.get("duration")) || 40 });
    showToast("时间块已添加");
  }
  saveState();
  simpleModal.close();
  renderAll();
}

function escapeHtml(value = "") {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function renderAll() {
  renderProfile();
  renderOverview();
  renderRewards();
  renderMistakes();
  renderKnowledge();
  renderTasks();
  renderSchedule();
  renderTimer();
  renderVocabulary();
  renderMaterials();
}

navItems.forEach((item) => item.addEventListener("click", () => switchPage(item.dataset.page)));
document.querySelectorAll("[data-page-jump]").forEach((button) => button.addEventListener("click", () => switchPage(button.dataset.pageJump)));
document.querySelectorAll("[data-open-upload]").forEach((button) => button.addEventListener("click", openUploadModal));
document.querySelector("#openUpload").addEventListener("click", openUploadModal);
document.querySelector("#closeUpload").addEventListener("click", () => uploadModal.close());
document.querySelector("#reselectImage").addEventListener("click", resetUpload);
document.querySelector("#uploadForm").addEventListener("submit", saveQuestion);
document.querySelector("#questionImage").addEventListener("change", (event) => handleImage(event.target.files[0]));

document.querySelector("#profileForm").addEventListener("submit", saveProfile);
document.querySelector("#closeProfile").addEventListener("click", () => profileModal.close());
document.querySelector("#cancelProfile").addEventListener("click", () => profileModal.close());
document.querySelector("#profileAvatarInput").addEventListener("change", (event) => handleProfileAvatar(event.target.files[0]));
document.querySelector("#profileNameInput").addEventListener("input", renderProfileAvatarPreview);

document.querySelector("#openVocabImport").addEventListener("click", openVocabImportModal);
document.querySelector("#closeVocabImport").addEventListener("click", () => vocabImportModal.close());
document.querySelector("#vocabImportForm").addEventListener("submit", saveImportedVocabulary);
document.querySelector("#vocabImportImage").addEventListener("change", (event) => handleVocabImportImage(event.target.files[0]));
document.querySelector("#recognizeVocabImage").addEventListener("click", recognizeVocabImage);
document.querySelector("#replaceVocabImportImage").addEventListener("click", () => {
  pendingVocabImage = "";
  document.querySelector("#vocabImportImage").value = "";
  document.querySelector("#vocabImportDropZone").hidden = false;
  document.querySelector("#vocabImportPreview").hidden = true;
});
document.querySelector("#backToVocabImage").addEventListener("click", () => {
  document.querySelector("#vocabImportResult").hidden = true;
  document.querySelector("#vocabImportSource").hidden = false;
});
document.querySelector("#vocabImportText").addEventListener("input", updateVocabImportCount);

const vocabImportDropZone = document.querySelector("#vocabImportDropZone");
["dragenter", "dragover"].forEach((eventName) => vocabImportDropZone.addEventListener(eventName, (event) => { event.preventDefault(); vocabImportDropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((eventName) => vocabImportDropZone.addEventListener(eventName, (event) => { event.preventDefault(); vocabImportDropZone.classList.remove("dragging"); }));
vocabImportDropZone.addEventListener("drop", (event) => handleVocabImportImage(event.dataTransfer.files[0]));

document.querySelector("#openMaterial").addEventListener("click", openMaterialModal);
document.querySelectorAll("[data-open-material]").forEach((button) => button.addEventListener("click", openMaterialModal));
document.querySelector("#closeMaterial").addEventListener("click", () => materialModal.close());
document.querySelector("#materialForm").addEventListener("submit", saveMaterial);
document.querySelector("#materialSourceTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-material-source]");
  if (button) setMaterialSourceMode(button.dataset.materialSource);
});
document.querySelector("#materialImage").addEventListener("change", (event) => handleMaterialImage(event.target.files[0]));
document.querySelector("#replaceMaterialImage").addEventListener("click", () => {
  pendingMaterialImage = "";
  document.querySelector("#materialImage").value = "";
  document.querySelector("#materialImagePreview").hidden = true;
  document.querySelector("#materialDropZone").hidden = false;
  setMaterialSourceMode("photo");
});
document.querySelector("#extractMaterial").addEventListener("click", extractMaterialDraft);
document.querySelector("#backToMaterialSource").addEventListener("click", () => {
  document.querySelector("#materialResult").hidden = true;
  document.querySelector("#materialSourceStep").hidden = false;
});

const materialDropZone = document.querySelector("#materialDropZone");
["dragenter", "dragover"].forEach((eventName) => materialDropZone.addEventListener(eventName, (event) => { event.preventDefault(); materialDropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((eventName) => materialDropZone.addEventListener(eventName, (event) => { event.preventDefault(); materialDropZone.classList.remove("dragging"); }));
materialDropZone.addEventListener("drop", (event) => handleMaterialImage(event.dataTransfer.files[0]));

document.querySelector("#materialFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-material-category]");
  if (!button) return;
  currentMaterialCategory = button.dataset.materialCategory;
  renderMaterials();
});
document.querySelector("#materialSearch").addEventListener("input", renderMaterials);
document.querySelector("#materialGrid").addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-material-view]");
  const copyButton = event.target.closest("[data-material-copy]");
  if (viewButton) openMaterialDetail(viewButton.dataset.materialView);
  if (copyButton) copyMaterialById(copyButton.dataset.materialCopy);
});
document.querySelector("#closeMaterialDetail").addEventListener("click", () => materialDetailModal.close());
document.querySelector("#finishMaterialDetail").addEventListener("click", () => materialDetailModal.close());
document.querySelector("#copyMaterialDetail").addEventListener("click", () => copyMaterialById(activeMaterialId));

document.querySelector("#addReward").addEventListener("click", () => openSimple("reward"));
document.querySelectorAll("[data-add-reward]").forEach((button) => button.addEventListener("click", () => openSimple("reward")));
document.querySelector("#drawReward").addEventListener("click", drawRewardPrize);
document.querySelector("#rewardGrid").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-reward]");
  const redeemButton = event.target.closest("[data-redeem-reward]");
  if (editButton) openSimple("reward", editButton.dataset.editReward);
  else if (redeemButton) redeemReward(redeemButton.dataset.redeemReward);
});

const dropZone = document.querySelector("#dropZone");
["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); }));
dropZone.addEventListener("drop", (event) => handleImage(event.dataTransfer.files[0]));

document.querySelector("#subjectFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-subject]");
  if (!button) return;
  currentSubject = button.dataset.subject;
  renderMistakes();
});
document.querySelector("#mistakeSearch").addEventListener("input", renderMistakes);
document.querySelector("#mistakeGrid").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-paper-select]");
  if (!checkbox) return;
  if (checkbox.checked) selectedMistakeIds.add(checkbox.dataset.paperSelect);
  else selectedMistakeIds.delete(checkbox.dataset.paperSelect);
  renderMistakes();
});
document.querySelector("#mistakeGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-id]");
  if (!button) return;
  const item = state.mistakes.find((mistake) => mistake.id === button.dataset.reviewId);
  if (!item) return;
  const completing = !item.reviewed;
  const previousLevel = profileLevelData().level;
  item.reviewed = !item.reviewed;
  if (completing) state.progress.totalReviews += 1;
  const currentLevel = profileLevelData().level;
  const earned = completing && awardCoins(5, `复习错题：${item.knowledge}`, `mistake-reviewed:${item.id}`);
  saveState();
  renderAll();
  showToast(item.reviewed
    ? currentLevel > previousLevel ? `复习完成，等级提升到 Lv. ${currentLevel}` : earned ? "复习完成，获得 5 金币" : "已记录本次复习"
    : "已重新加入待复习");
});
document.querySelector("#selectVisibleMistakes").addEventListener("click", toggleVisibleMistakes);
document.querySelector("#clearPaperSelection").addEventListener("click", clearPaperSelection);
document.querySelector("#generatePaper").addEventListener("click", generateRandomPaper);
document.querySelector("#closePaper").addEventListener("click", () => paperModal.close());
document.querySelector("#shufflePaper").addEventListener("click", reshufflePaper);
document.querySelector("#printPaper").addEventListener("click", () => window.print());
document.querySelector("#savePaperImage").addEventListener("click", savePaperToAlbum);

document.querySelector("#taskGroups").addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-id]");
  if (!button) return;
  const task = state.tasks.find((item) => item.id === button.dataset.taskId);
  if (!task) return;
  const completing = !task.done;
  task.done = !task.done;
  const earned = completing && awardCoins(8, `完成任务：${task.title}`, `task:${task.id}`);
  saveState();
  renderAll();
  showToast(task.done ? earned ? "任务完成，获得 8 金币" : "任务已完成" : "任务已重新打开");
});

document.querySelector("#globalSearch").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  document.querySelector("#mistakeSearch").value = event.currentTarget.value;
  currentSubject = "全部";
  switchPage("mistakes");
});

document.querySelector("#focusButton").addEventListener("click", () => {
  switchPage("time");
  setTimeout(() => document.querySelector("#focusTimer").scrollIntoView({ behavior: "smooth", block: "start" }), 80);
});
document.querySelector("#openSidebar").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.add("open");
  document.querySelector("#sidebarScrim").classList.add("open");
});
document.querySelector("#closeSidebar").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.remove("open");
  document.querySelector("#sidebarScrim").classList.remove("open");
});
document.querySelector("#sidebarScrim").addEventListener("click", () => document.querySelector("#closeSidebar").click());

document.querySelector("#addPlanTask").addEventListener("click", () => openSimple("task"));
document.querySelector("#addTimeBlock").addEventListener("click", () => openSimple("time"));
document.querySelector("#editProfile").addEventListener("click", openProfileModal);
document.querySelector("#timerStart").addEventListener("click", toggleTimer);
document.querySelector("#timerReset").addEventListener("click", resetTimer);
document.querySelector("#applyCustomTimer").addEventListener("click", applyCustomTimer);
document.querySelector("#customTimerMinutes").addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyCustomTimer();
});
document.querySelector("#timerPresets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-minutes]");
  if (!button) return;
  setTimerPreset(Number(button.dataset.minutes));
});
document.querySelector("#vocabExamLevel").addEventListener("click", (event) => {
  const button = event.target.closest("[data-exam-level]");
  if (button) setVocabularyExamLevel(button.dataset.examLevel);
});
document.querySelector("#vocabTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-vocab-tab]");
  if (!button) return;
  currentVocabTab = button.dataset.vocabTab;
  renderVocabulary();
});
document.querySelector("#generateVocab").addEventListener("click", generateVocabularyRound);
document.querySelector("#newVocabRound").addEventListener("click", () => {
  state.vocabulary.sessionDate = "";
  state.vocabulary.index = 0;
  vocabMeaningVisible = false;
  saveState();
  renderVocabulary();
});
document.querySelector("#revealWord").addEventListener("click", revealVocabularyMeaning);
document.querySelector("#speakWord").addEventListener("click", speakCurrentWord);
document.querySelector("#wordActions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-word-action]");
  if (!button) return;
  classifyCurrentWord(button.dataset.wordAction);
});
document.querySelector("#unfamiliarWordList").addEventListener("click", (event) => {
  const reviewButton = event.target.closest("[data-vocab-review]");
  const masterButton = event.target.closest("[data-vocab-master]");
  if (reviewButton) startVocabularyReview(reviewButton.dataset.vocabReview);
  if (masterButton) markVocabularyMastered(masterButton.dataset.vocabMaster);
});
document.querySelector("#masteredWordList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-vocab-relearn]");
  if (!button) return;
  relearnVocabulary(button.dataset.vocabRelearn);
});
document.querySelector("#simpleForm").addEventListener("submit", saveSimple);
document.querySelector("#closeSimple").addEventListener("click", () => simpleModal.close());
document.querySelector("#cancelSimple").addEventListener("click", () => simpleModal.close());
document.querySelector("#reviewKnowledge").addEventListener("click", () => {
  switchPage("mistakes");
  currentSubject = "全部";
  document.querySelector("#mistakeSearch").value = "";
  renderMistakes();
  showToast("已按易错程度生成今日复习顺序");
});

renderAll();
