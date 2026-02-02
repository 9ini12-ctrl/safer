/* منصة إدارة السفراء — نسخة ثابتة مناسبة لـ GitHub Pages / Netlify
   كل البيانات تُحفظ محلياً داخل LocalStorage (في هذا الـ MVP).
*/

const LS = {
  ambassadors: "ambassadors_v1",
  donations: "donations_v1",
  boxes: "boxes_v1",
  settings: "settings_v1",
  share: "share_v1",
  sync: "sync_v1",
  session: "session_v1",
};

const DEFAULTS = {
  settings: { goalBoxes: 10, goalAmount: 2000, adminPass: "admin123" },
  share: {
    msg:
`مساء الخير 🌿
أنا {name} سفير منصة الخير.
اليوم وصلت: {today_boxes} صندوق، وحققت: {today_amount} ﷼

إذا تحب تكون جزء من الأثر:
استخدم كود الإحالة: {ref}
جزاك الله خيرًا 🤍`,
    imgDataUrl: ""
  }
};

const el = (id) => document.getElementById(id);
const fmtSAR = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString("ar-SA") + " ﷼";
};
const fmtInt = (n) => Number(n || 0).toLocaleString("ar-SA");
const nowYMD = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};

// --- Robust-ish CSV parsing (handles quotes, commas, newlines) ---
function parseCSV(text){
  // Normalize line endings
  const s = String(text || "").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  let i=0, field="", row=[], out=[];
  let inQuotes=false;

  const pushField = () => { row.push(field); field=""; };
  const pushRow = () => {
    // ignore empty final row
    if(row.length===1 && row[0].trim()===""){ row=[]; return; }
    out.push(row); row=[];
  };

  while(i < s.length){
    const c = s[i];

    if(inQuotes){
      if(c === '"'){
        if(s[i+1] === '"'){ field += '"'; i+=2; continue; }
        inQuotes = false; i++; continue;
      } else {
        field += c; i++; continue;
      }
    } else {
      if(c === '"'){ inQuotes = true; i++; continue; }
      if(c === ','){ pushField(); i++; continue; }
      if(c === '\n'){ pushField(); pushRow(); i++; continue; }
      field += c; i++; continue;
    }
  }
  pushField();
  pushRow();

  if(out.length === 0) return { headers: [], rows: [] };
  const headers = out[0].map(h => normalizeHeader(h));
  const rows = out.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
    return obj;
  });
  return { headers, rows };
}
function normalizeHeader(h){
  return String(h||"")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u0600-\u06FF]+/g, "");
}

function normalizePhone(raw){
  const digits = String(raw || "").replace(/\D+/g, "");
  if(!digits) return "";
  // Convert Saudi formats:
  // 9665xxxxxxxx -> 05xxxxxxxx
  if(digits.startsWith("966") && digits.length >= 12){
    const rest = digits.slice(3);
    if(rest.startsWith("5") && rest.length === 9) return "0" + rest;
  }
  // 5xxxxxxxx -> 05xxxxxxxx
  if(digits.length === 9 && digits.startsWith("5")) return "0" + digits;
  // keep as-is (may already be 05xxxxxxxx or other)
  return digits;
}

function normalizeAmount(a){
  const s = String(a ?? "").replace(/[^\d.\-]/g,"");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toYMD(anyDate){
  const v = String(anyDate || "").trim();
  if(!v) return "";
  // If already y-m-d
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/yyyy or d/m/yyyy
  const dm = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(dm){
    const d = String(dm[1]).padStart(2,"0");
    const m = String(dm[2]).padStart(2,"0");
    let y = dm[3];
    if(y.length === 2) y = "20" + y; // reasonable assumption
    return `${y}-${m}-${d}`;
  }

  // Try Date parsing (best effort)
  const dt = new Date(v);
  if(!Number.isNaN(dt.getTime())){
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,"0");
    const d = String(dt.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

function loadJSON(key, fallback){
  try{
    const v = localStorage.getItem(key);
    if(!v) return fallback;
    return JSON.parse(v);
  }catch(_){ return fallback; }
}
function saveJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function getSettings(){
  const s = loadJSON(LS.settings, null) || {};
  return { ...DEFAULTS.settings, ...s };
}
function setSettings(next){
  saveJSON(LS.settings, { ...getSettings(), ...next });
}

function getShare(){
  const s = loadJSON(LS.share, null) || {};
  return { ...DEFAULTS.share, ...s };
}
function setShare(next){
  saveJSON(LS.share, { ...getShare(), ...next });
}

function getData(){
  return {
    ambassadors: loadJSON(LS.ambassadors, []),
    donations: loadJSON(LS.donations, []),
    boxes: loadJSON(LS.boxes, []),
    sync: loadJSON(LS.sync, { lastSync: "" }),
  };
}

function setData(partial){
  if(partial.ambassadors) saveJSON(LS.ambassadors, partial.ambassadors);
  if(partial.donations) saveJSON(LS.donations, partial.donations);
  if(partial.boxes) saveJSON(LS.boxes, partial.boxes);
  if(partial.sync) saveJSON(LS.sync, partial.sync);
}

function computeForAmbassador(amb, data){
  const today = nowYMD();
  const ref = String(amb.referral_code || amb.ref || "").trim();
  const phone = normalizePhone(amb.phone || amb.mobile || "");
  const donations = (data.donations || []).filter(d => String(d.referral_code || d.ref || "").trim() === ref);
  const boxes = (data.boxes || []).filter(b => normalizePhone(b.phone || b.mobile || "") === phone);

  const allAmount = donations.reduce((sum, d) => sum + normalizeAmount(d.amount), 0);
  const allDonations = donations.length;

  const todayAmount = donations
    .filter(d => toYMD(d.donation_date || d.date || "") === today)
    .reduce((sum, d) => sum + normalizeAmount(d.amount), 0);

  const todayBoxes = boxes.filter(b => toYMD(b.created_at || b.date || "") === today).length;

  return {
    phone, ref,
    allAmount, allDonations,
    allBoxes: boxes.length,
    todayAmount, todayBoxes
  };
}

function scoreBadge(todayAmount, todayBoxes, goals){
  const a = goals.goalAmount > 0 ? (todayAmount / goals.goalAmount) : 0;
  const b = goals.goalBoxes > 0 ? (todayBoxes / goals.goalBoxes) : 0;
  const p = Math.max(a, b);
  if(p >= 1) return "🔥 تم — ممتاز";
  if(p >= .7) return "✨ قريب";
  if(p >= .35) return "🌿 جيد";
  if(p > 0) return "🌱 بداية";
  return "—";
}

function pct(value, goal){
  const v = Number(value || 0);
  const g = Number(goal || 0);
  if(g <= 0) return 0;
  return Math.max(0, Math.min(100, (v / g) * 100));
}

function show(viewId){
  ["viewLogin","viewAmbassador","viewAdmin"].forEach(id => el(id).classList.add("hidden"));
  el(viewId).classList.remove("hidden");
}

function toast(msg){
  // Minimal toast using alert-like behavior but calmer.
  // If you want a fancier toast, we can add it later.
  window.setTimeout(() => {}, 0);
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  Object.assign(t.style, {
    position:"fixed", left:"16px", bottom:"18px", zIndex:99,
    padding:"12px 14px", borderRadius:"14px",
    backdropFilter:"blur(12px)",
    background:"rgba(0,0,0,.55)",
    border:"1px solid rgba(255,255,255,.12)",
    color:"white", fontWeight:"700",
    maxWidth:"min(520px, calc(100vw - 32px))"
  });
  if(document.documentElement.classList.contains("light")){
    t.style.background="rgba(255,255,255,.85)";
    t.style.color="#111";
    t.style.border="1px solid rgba(0,0,0,.08)";
  }
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2200);
}

async function readFileText(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result||""));
    r.onerror = () => reject(r.error);
    r.readAsText(file, "utf-8");
  });
}

async function readFileDataUrl(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result||""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function ensureDefaults(){
  if(!localStorage.getItem(LS.settings)) saveJSON(LS.settings, DEFAULTS.settings);
  if(!localStorage.getItem(LS.share)) saveJSON(LS.share, DEFAULTS.share);
  if(!localStorage.getItem(LS.sync)) saveJSON(LS.sync, { lastSync: "" });
}

function renderAmbassador(amb){
  const data = getData();
  const settings = getSettings();
  const share = getShare();

  const m = computeForAmbassador(amb, data);

  el("ambName").textContent = amb.name || "سفير";
  el("ambMeta").textContent = `الجوال: ${m.phone} • كود الإحالة: ${m.ref}`;

  el("mTodayAmount").textContent = fmtSAR(m.todayAmount);
  el("mTodayAmountSub").textContent = `الهدف: ${fmtSAR(settings.goalAmount)}`;
  el("pTodayAmount").style.width = pct(m.todayAmount, settings.goalAmount) + "%";

  el("mTodayBoxes").textContent = fmtInt(m.todayBoxes);
  el("mTodayBoxesSub").textContent = `الهدف: ${fmtInt(settings.goalBoxes)}`;
  el("pTodayBoxes").style.width = pct(m.todayBoxes, settings.goalBoxes) + "%";

  el("mTodayBadge").textContent = scoreBadge(m.todayAmount, m.todayBoxes, settings);

  el("mAllAmount").textContent = fmtSAR(m.allAmount);
  el("mAllDonations").textContent = fmtInt(m.allDonations);
  el("mAllBoxes").textContent = fmtInt(m.allBoxes);

  const sync = data.sync?.lastSync ? data.sync.lastSync : "—";
  el("mLastSync").textContent = sync;

  // Share
  const msg = String(share.msg || "");
  const personalized = msg
    .replaceAll("{name}", amb.name || "سفير")
    .replaceAll("{ref}", m.ref || "")
    .replaceAll("{today_amount}", fmtSAR(m.todayAmount))
    .replaceAll("{today_boxes}", fmtInt(m.todayBoxes));
  el("shareMsg").value = personalized;

  const img = el("shareImg");
  if(share.imgDataUrl){
    img.src = share.imgDataUrl;
    img.style.opacity = "1";
  } else {
    img.removeAttribute("src");
    img.style.opacity = ".55";
  }
}

function getAmbassadorByPhone(phone){
  const p = normalizePhone(phone);
  const data = getData();
  return (data.ambassadors || []).find(a => normalizePhone(a.phone || a.mobile || "") === p) || null;
}

function renderLeaderboard(){
  const data = getData();
  const settings = getSettings();
  const tbody = el("leaderboard").querySelector("tbody");
  tbody.innerHTML = "";

  const rows = (data.ambassadors || []).map(a => {
    const m = computeForAmbassador(a, data);
    return { a, m };
  }).sort((x,y) => {
    if(y.m.todayAmount !== x.m.todayAmount) return y.m.todayAmount - x.m.todayAmount;
    if(y.m.todayBoxes !== x.m.todayBoxes) return y.m.todayBoxes - x.m.todayBoxes;
    return (y.m.allAmount - x.m.allAmount);
  });

  for(const r of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.a.name || "—")}</td>
      <td>${escapeHtml(r.m.phone || "—")}</td>
      <td>${escapeHtml(r.m.ref || "—")}</td>
      <td>${fmtSAR(r.m.todayAmount)}</td>
      <td>${fmtInt(r.m.todayBoxes)}</td>
      <td>${fmtSAR(r.m.allAmount)}</td>
      <td>${fmtInt(r.m.allBoxes)}</td>
    `;
    tbody.appendChild(tr);
  }

  // sync status
  const sync = data.sync?.lastSync ? data.sync.lastSync : "—";
  el("syncStatus").textContent = `آخر حفظ: ${sync} • عدد السفراء: ${(data.ambassadors||[]).length} • عدد التبرعات: ${(data.donations||[]).length} • عدد الصناديق: ${(data.boxes||[]).length}`;
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

function download(filename, content, mime="text/plain;charset=utf-8"){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

// --- Routing-ish helpers ---
function setSession(ambPhone){
  saveJSON(LS.session, { phone: normalizePhone(ambPhone), at: new Date().toISOString() });
}
function clearSession(){
  localStorage.removeItem(LS.session);
}
function getSession(){
  return loadJSON(LS.session, null);
}

function applyTheme(){
  const t = localStorage.getItem("theme_v1") || "dark";
  document.documentElement.classList.toggle("light", t === "light");
}
function toggleTheme(){
  const isLight = document.documentElement.classList.contains("light");
  localStorage.setItem("theme_v1", isLight ? "dark" : "light");
  applyTheme();
}

function enterAdmin(){
  show("viewAdmin");
  el("adminGate").classList.remove("hidden");
  el("adminBody").classList.add("hidden");
  el("adminPass").value = "";
  // load current values
  const settings = getSettings();
  el("goalBoxes").value = settings.goalBoxes ?? "";
  el("goalAmount").value = settings.goalAmount ?? "";
  el("adminNewPass").value = "";
  const share = getShare();
  el("adminShareMsg").value = share.msg || "";
  const prev = el("adminShareImgPreview");
  if(share.imgDataUrl){
    prev.src = share.imgDataUrl;
    prev.style.opacity = "1";
  } else {
    prev.removeAttribute("src");
    prev.style.opacity = ".55";
  }
  renderLeaderboard();
}

function adminUnlock(){
  const pass = el("adminPass").value || "";
  const settings = getSettings();
  if(pass !== settings.adminPass){
    toast("كلمة المرور غير صحيحة");
    return;
  }
  el("adminGate").classList.add("hidden");
  el("adminBody").classList.remove("hidden");
  renderLeaderboard();
}

// --- CSV mapping helpers ---
function mapAmbassadors(rows){
  return rows.map(r => ({
    name: r.name || r.full_name || r.ambassador || r.السفير || "",
    phone: normalizePhone(r.phone || r.mobile || r.جوال || r.رقم_الجوال || ""),
    referral_code: (r.referral_code || r.ref || r.code || r.كود_الاحالة || r.كود_الإحالة || "").trim()
  })).filter(x => x.phone && x.referral_code);
}
function mapDonations(rows){
  return rows.map(r => ({
    amount: normalizeAmount(r.amount || r.المبلغ || r.value || 0),
    donor_phone: normalizePhone(r.donor_phone || r.phone || r.mobile || r.جوال_المتبرع || ""),
    donation_date: toYMD(r.donation_date || r.date || r.تاريخ_التبرع || r.created_at || ""),
    referral_code: (r.referral_code || r.ref || r.كود_الاحالة || r.كود_الإحالة || "").trim()
  })).filter(x => x.referral_code && (x.amount !== 0 || x.donor_phone || x.donation_date));
}
function mapBoxes(rows){
  return rows.map(r => ({
    phone: normalizePhone(r.phone || r.mobile || r.جوال || r.رقم_الجوال || ""),
    box_id: (r.box_id || r.box || r.رقم_الصندوق || r.الصندوق || "").trim(),
    created_at: toYMD(r.created_at || r.date || r.تاريخ_الانشاء || r.تاريخ_الإنشاء || "")
  })).filter(x => x.phone && x.box_id);
}

function loadSamples(){
  // Embedded sample data (small)
  const ambassadors = [
    { name:"زياد", phone:"0550000000", referral_code:"Z10" },
    { name:"سارة", phone:"0550000001", referral_code:"S20" },
    { name:"محمد", phone:"0550000002", referral_code:"M30" },
  ];
  const today = nowYMD();
  const donations = [
    { amount: 100, donor_phone:"0501111111", donation_date: today, referral_code:"Z10" },
    { amount: 250, donor_phone:"0502222222", donation_date: today, referral_code:"Z10" },
    { amount: 50, donor_phone:"0503333333", donation_date: today, referral_code:"S20" },
    { amount: 500, donor_phone:"0504444444", donation_date: today, referral_code:"M30" },
  ];
  const boxes = [
    { phone:"0550000000", box_id:"BX-1001", created_at: today },
    { phone:"0550000000", box_id:"BX-1002", created_at: today },
    { phone:"0550000001", box_id:"BX-2001", created_at: today },
  ];
  setData({ ambassadors, donations, boxes, sync: { lastSync: new Date().toLocaleString("ar-SA") } });
  toast("تم تحميل بيانات تجريبية");
  renderLeaderboard();
}

function exportLeaderboard(){
  const data = getData();
  const rows = (data.ambassadors||[]).map(a => {
    const m = computeForAmbassador(a, data);
    return {
      name: a.name || "",
      phone: m.phone || "",
      referral_code: m.ref || "",
      today_amount: m.todayAmount || 0,
      today_boxes: m.todayBoxes || 0,
      all_amount: m.allAmount || 0,
      all_boxes: m.allBoxes || 0,
    };
  });

  const headers = Object.keys(rows[0] || { name:"", phone:"", referral_code:"", today_amount:"", today_boxes:"", all_amount:"", all_boxes:"" });
  const lines = [headers.join(",")].concat(rows.map(r => headers.map(h => csvEscape(r[h])).join(",")));
  download(`leaderboard_${nowYMD()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  toast("تم تصدير CSV");
}

function csvEscape(v){
  const s = String(v ?? "");
  if(/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

// --- Init / events ---
function init(){
  ensureDefaults();
  applyTheme();

  const session = getSession();
  if(session?.phone){
    const amb = getAmbassadorByPhone(session.phone);
    if(amb){
      show("viewAmbassador");
      renderAmbassador(amb);
    } else {
      clearSession();
      show("viewLogin");
    }
  } else {
    show("viewLogin");
  }

  // top actions
  el("btnTheme").addEventListener("click", toggleTheme);
  el("btnAdmin").addEventListener("click", enterAdmin);

  // login
  el("btnLogin").addEventListener("click", () => {
    const phone = el("phoneInput").value;
    const amb = getAmbassadorByPhone(phone);
    if(!amb){
      toast("لم يتم العثور على سفير بهذا الرقم");
      return;
    }
    setSession(phone);
    show("viewAmbassador");
    renderAmbassador(amb);
  });

  // ambassador actions
  el("btnLogout").addEventListener("click", () => {
    clearSession();
    el("phoneInput").value = "";
    show("viewLogin");
  });

  el("btnCopyMsg").addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(el("shareMsg").value || "");
      toast("تم نسخ الرسالة");
    }catch(_){
      download("message.txt", el("shareMsg").value || "");
      toast("تم تنزيل الرسالة كملف");
    }
  });

  el("btnDownloadImg").addEventListener("click", () => {
    const share = getShare();
    if(!share.imgDataUrl){
      toast("لا توجد صورة محفوظة");
      return;
    }
    // DataURL -> download
    const a = document.createElement("a");
    a.href = share.imgDataUrl;
    a.download = `share_${nowYMD()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  el("btnCopyLink").addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(window.location.href);
      toast("تم نسخ الرابط");
    }catch(_){
      toast("تعذر نسخ الرابط");
    }
  });

  // admin
  el("btnBack").addEventListener("click", () => {
    const session = getSession();
    if(session?.phone){
      const amb = getAmbassadorByPhone(session.phone);
      if(amb){ show("viewAmbassador"); renderAmbassador(amb); return; }
    }
    show("viewLogin");
  });

  el("btnAdminEnter").addEventListener("click", adminUnlock);

  el("btnSaveGoals").addEventListener("click", () => {
    const goalBoxes = Number(el("goalBoxes").value || 0);
    const goalAmount = Number(el("goalAmount").value || 0);
    const newPass = el("adminNewPass").value?.trim();
    const next = { goalBoxes, goalAmount };
    if(newPass) next.adminPass = newPass;
    setSettings(next);
    toast("تم حفظ الأهداف");
    renderLeaderboard();
  });

  el("btnInsertTemplate").addEventListener("click", () => {
    el("adminShareMsg").value =
`مساء الخير 🌿
أنا {name} سفير منصة الخير.

اليوم حققت:
• صناديق: {today_boxes}
• تحصيل: {today_amount}

إذا تحب تشارك بالأجر:
استخدم كود الإحالة: {ref}
جزاك الله خيرًا 🤍`;
  });

  el("btnSaveShare").addEventListener("click", () => {
    setShare({ msg: el("adminShareMsg").value || "" });
    toast("تم حفظ رسالة النشر");
  });

  el("adminShareImg").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const dataUrl = await readFileDataUrl(file);
    el("adminShareImgPreview").src = dataUrl;
    el("adminShareImgPreview").style.opacity = "1";
    // cache temp
    el("adminShareImgPreview").dataset.temp = dataUrl;
  });

  el("btnSaveShareImg").addEventListener("click", () => {
    const prev = el("adminShareImgPreview");
    const temp = prev.dataset.temp || prev.src || "";
    if(!temp){
      toast("اختر صورة أولاً");
      return;
    }
    setShare({ imgDataUrl: temp });
    toast("تم حفظ الصورة");
  });

  el("btnClearShareImg").addEventListener("click", () => {
    const prev = el("adminShareImgPreview");
    prev.removeAttribute("src");
    prev.dataset.temp = "";
    prev.style.opacity = ".55";
    setShare({ imgDataUrl: "" });
    toast("تم حذف الصورة");
  });

  el("btnLoadSamples").addEventListener("click", loadSamples);

  el("btnReset").addEventListener("click", () => {
    const ok = confirm("سيتم مسح كل البيانات من هذا المتصفح. هل أنت متأكد؟");
    if(!ok) return;
    localStorage.removeItem(LS.ambassadors);
    localStorage.removeItem(LS.donations);
    localStorage.removeItem(LS.boxes);
    localStorage.removeItem(LS.sync);
    localStorage.removeItem(LS.session);
    localStorage.removeItem(LS.settings);
    localStorage.removeItem(LS.share);
    ensureDefaults();
    toast("تم المسح");
    renderLeaderboard();
  });

  el("btnExportLeaderboard").addEventListener("click", exportLeaderboard);

  el("btnSaveFiles").addEventListener("click", async () => {
    const fA = el("fileAmbassadors").files?.[0];
    const fD = el("fileDonations").files?.[0];
    const fB = el("fileBoxes").files?.[0];

    const partial = {};
    try{
      if(fA){
        const txt = await readFileText(fA);
        const { rows } = parseCSV(txt);
        partial.ambassadors = mapAmbassadors(rows);
      }
      if(fD){
        const txt = await readFileText(fD);
        const { rows } = parseCSV(txt);
        partial.donations = mapDonations(rows);
      }
      if(fB){
        const txt = await readFileText(fB);
        const { rows } = parseCSV(txt);
        partial.boxes = mapBoxes(rows);
      }

      if(Object.keys(partial).length === 0){
        toast("اختر ملف واحد على الأقل");
        return;
      }

      partial.sync = { lastSync: new Date().toLocaleString("ar-SA") };
      setData(partial);

      toast("تم حفظ البيانات");
      renderLeaderboard();

      // If ambassador session is active, refresh
      const session = getSession();
      if(session?.phone){
        const amb = getAmbassadorByPhone(session.phone);
        if(amb) renderAmbassador(amb);
      }
    }catch(err){
      console.error(err);
      toast("تعذر قراءة ملف CSV — تأكد من الترميز والحقول");
    }
  });

  // Improve UX: enter to login
  el("phoneInput").addEventListener("keydown", (e)=>{
    if(e.key === "Enter") el("btnLogin").click();
  });
  el("adminPass").addEventListener("keydown", (e)=>{
    if(e.key === "Enter") el("btnAdminEnter").click();
  });

  // Small help: if no data exists, show a gentle hint
  const data = getData();
  if((data.ambassadors||[]).length === 0){
    setTimeout(()=> toast("ابدأ من لوحة الإدارة: ارفع ملف السفراء أولاً"), 600);
  }
}

document.addEventListener("DOMContentLoaded", init);
