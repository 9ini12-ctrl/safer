// app.js (No external deps)
// CSV location (in repo): /data/safaraa.csv
const CSV_PATH = "/data/safaraa.csv";

// ------- Helpers -------
const qs = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const fmtSAR = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString("ar-SA") + " ريال";
};
const pct = (a,b) => {
  const A = Number(a||0), B = Number(b||0);
  if (!B) return 0;
  return Math.max(0, Math.min(100, (A/B)*100));
};

function cacheBustUrl(url){
  // break browser + CDN caches
  return `${url}?v=${Date.now()}`;
}

// Robust-ish CSV parser (supports quoted fields)
function parseCSV(text){
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i=0; i<text.length; i++){
    const ch = text[i];
    const next = text[i+1];

    if (ch === '"' ){
      if (inQuotes && next === '"'){ // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === ',' || ch === '\n' || ch === '\r')){
      if (ch === '\r' && next === '\n'){ i++; }
      row.push(cur);
      cur = "";
      if (ch === '\n' || ch === '\r'){
        // ignore empty trailing lines
        if (row.some(c => String(c).trim() !== "")) rows.push(row);
        row = [];
      }
      continue;
    }

    cur += ch;
  }
  // last
  if (cur.length || row.length){
    row.push(cur);
    if (row.some(c => String(c).trim() !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map(h => String(h||"").trim());
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => obj[h] = (r[idx] ?? "").toString().trim());
    return obj;
  });
}

function toNumber(v){
  const n = Number(String(v ?? "").replace(/,/g,"").trim());
  return Number.isFinite(n) ? n : 0;
}

function cleanRow(r){
  return {
    ...r,
    role: String(r.role ?? "").trim(),
    ambassador_id: String(r.ambassador_id ?? "").trim(),
    name: String(r.name ?? "").trim(),
    phone: String(r.phone ?? "").trim(),
    branch: String(r.branch ?? "").trim(),
    group: String(r.group ?? "").trim(),
    leader_name: String(r.leader_name ?? "").trim(),
    achieved_amount: toNumber(r.achieved_amount),
    active_boxes: toNumber(r.active_boxes),
    daily_target_boxes: toNumber(r.daily_target_boxes),
    daily_target_amount: toNumber(r.daily_target_amount),
    today_opened_boxes: toNumber(r.today_opened_boxes),
    today_amount: toNumber(r.today_amount),
    rank_on_ambassadors: toNumber(r.rank_on_ambassadors),
    rank_on_branch: toNumber(r.rank_on_branch),
    rank_on_ambassadors_of_branch: toNumber(r.rank_on_ambassadors_of_branch),
    coupon_code: String(r.coupon_code ?? "").trim(),
    coupon_unlock_rule: String(r.coupon_unlock_rule ?? "").trim(),
    share_url: String(r.share_url ?? "").trim(),
    updated_at: String(r.updated_at ?? "").trim(),
  };
}

async function loadRows(){
  const res = await fetch(cacheBustUrl(CSV_PATH), { cache: "no-store" });
  if (!res.ok) throw new Error("فشل تحميل ملف البيانات (CSV)");
  const text = await res.text();
  const raw = parseCSV(text);
  return raw.map(cleanRow);
}

// rule: "opened_boxes>=10" OR "today_amount>=2000" OR "achieved_amount>=50000"
function evalRule(rule, ctx){
  if (!rule) return false;
  const m = String(rule).match(/^\s*([a-zA-Z_]+)\s*(>=|<=|==|>|<)\s*([0-9]+(?:\.[0-9]+)?)\s*$/);
  if (!m) return false;

  const key = m[1];
  const op = m[2];
  const val = Number(m[3]);

  const map = {
    opened_boxes: ctx.active_boxes,
    today_opened_boxes: ctx.today_opened_boxes,
    today_amount: ctx.today_amount,
    achieved_amount: ctx.achieved_amount,
  };

  const left = Number(map[key] ?? 0);

  switch(op){
    case ">=": return left >= val;
    case "<=": return left <= val;
    case ">": return left > val;
    case "<": return left < val;
    case "==": return left === val;
    default: return false;
  }
}

function setProgress(el, value, total){
  const p = pct(value, total);
  const bar = qs("i", el);
  if (bar) bar.style.width = p.toFixed(1) + "%";
  const label = el.getAttribute("data-label");
  if (label){
    const txt = qs(label);
    if (txt) txt.textContent = `${Math.min(value,total).toLocaleString("ar-SA")} / ${total.toLocaleString("ar-SA")}`;
  }
}

// ------- Page: Ambassador -------
async function initAmbassador(){
  const root = qs("[data-page='ambassador']");
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const id = (params.get("id") || "").trim();
  const phone = (params.get("phone") || "").trim();

  try{
    const rows = await loadRows();
    const ambassadors = rows.filter(r => r.role === "ambassador");

    let me = null;
    if (id) me = ambassadors.find(r => r.ambassador_id === id);
    if (!me && phone) me = ambassadors.find(r => r.phone === phone);

    if (!me){
      qs("#state").textContent = "لم يتم العثور على سفير مطابق للرابط. جرّب إضافة ?id=رقم_السفير";
      return;
    }

    qs("#state").classList.add("hidden");
    qs("#hello").textContent = "أهلاً بك";
    qs("#name").textContent = me.name;

    qs("#achieved").textContent = fmtSAR(me.achieved_amount);
    qs("#active_boxes").textContent = me.active_boxes.toLocaleString("ar-SA");
    qs("#updated").textContent = me.updated_at ? `آخر تحديث: ${me.updated_at}` : "";

    // Goal title
    qs("#goal_date").textContent = me.updated_at ? `(${me.updated_at})` : "";
    // progress bars
    setProgress(qs("#p_boxes"), me.today_opened_boxes, me.daily_target_boxes);
    setProgress(qs("#p_amount"), me.today_amount, me.daily_target_amount);

    qs("#goal_boxes_text").textContent = `فتح ${me.daily_target_boxes.toLocaleString("ar-SA")} صناديق سهمية فعّالة`;
    qs("#goal_amount_text").textContent = `تحقيق ${me.daily_target_amount.toLocaleString("ar-SA")} ريال`;

    // coupon
    const unlocked = evalRule(me.coupon_unlock_rule, me);
    if (unlocked && me.coupon_code){
      qs("#coupon_note").textContent = "كوبونك جاهز";
      qs("#coupon_code").textContent = me.coupon_code;
    }else{
      qs("#coupon_note").textContent = "سيفتح الكوبون عند التحقيق";
      qs("#coupon_code").textContent = "******-******-" + (me.ambassador_id || "00000");
    }

    // ranks
    qs("#rank_amb").textContent = me.rank_on_ambassadors ? me.rank_on_ambassadors.toLocaleString("ar-SA") : "—";
    qs("#rank_branch").textContent = me.rank_on_ambassadors_of_branch ? me.rank_on_ambassadors_of_branch.toLocaleString("ar-SA") : "—";
    qs("#rank_branches").textContent = me.rank_on_branch ? me.rank_on_branch.toLocaleString("ar-SA") : "—";

    // share
    qs("#shareBtn").addEventListener("click", async () => {
      const url = me.share_url || location.href;
      const msg =
`مساء الخير 🌿
ساهمتُ في فتح صناديق سهمية لدعم تحفيظ القرآن، وتقدر تشاركني الأجر عبر الرابط:
${url}

جزاك الله خيرًا ✨`;
      try{
        await navigator.clipboard.writeText(msg);
        qs("#shareBtn").textContent = "تم نسخ الرسالة ✅";
        setTimeout(()=> qs("#shareBtn").textContent="مشاركة", 1400);
      }catch(e){
        alert("انسخ هذه الرسالة:\n\n" + msg);
      }
    });

    qs("#refreshBtn").addEventListener("click", () => location.reload());

  }catch(err){
    qs("#state").textContent = err.message || "حدث خطأ غير متوقع";
  }
}

// ------- Page: Branch -------
async function initBranch(){
  const root = qs("[data-page='branch']");
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const b = (params.get("branch") || params.get("b") || "").trim();

  try{
    const rows = await loadRows();
    const ambassadors = rows.filter(r => r.role === "ambassador");

    // if branch not provided, pick first branch
    const branchName = b || (ambassadors[0]?.branch || "");
    const inBranch = ambassadors.filter(r => r.branch === branchName);

    if (!branchName || !inBranch.length){
      qs("#state").textContent = "لم يتم العثور على فرع. جرّب ?branch=اسم_الفرع";
      return;
    }

    qs("#state").classList.add("hidden");
    qs("#branchName").textContent = branchName;

    const sum = (arr, key)=> arr.reduce((a,x)=> a + (Number(x[key])||0), 0);

    const totalAchieved = sum(inBranch, "achieved_amount");
    const totalToday = sum(inBranch, "today_amount");
    const totalActiveBoxes = sum(inBranch, "active_boxes");
    const ambassadorsCount = inBranch.length;

    qs("#kpi_achieved").textContent = fmtSAR(totalAchieved);
    qs("#kpi_today").textContent = fmtSAR(totalToday);
    qs("#kpi_boxes").textContent = totalActiveBoxes.toLocaleString("ar-SA");
    qs("#kpi_count").textContent = ambassadorsCount.toLocaleString("ar-SA");

    // branch rank: best (min) rank_on_branch among members if provided
    const ranks = inBranch.map(x=>x.rank_on_branch).filter(n=>n>0);
    qs("#kpi_rank").textContent = ranks.length ? Math.min(...ranks).toLocaleString("ar-SA") : "—";

    // list ambassadors sorted by today_amount desc
    const sorted = [...inBranch].sort((a,b)=> b.today_amount - a.today_amount);
    const tbody = qs("#ambTbody");
    tbody.innerHTML = "";
    sorted.slice(0, 12).forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.name}</td>
        <td>${fmtSAR(r.today_amount)}</td>
        <td>${r.today_opened_boxes.toLocaleString("ar-SA")}</td>
      `;
      tbody.appendChild(tr);
    });

    qs("#moreLink").href = `admin.html?branch=${encodeURIComponent(branchName)}`;

    qs("#refreshBtn").addEventListener("click", () => location.reload());

  }catch(err){
    qs("#state").textContent = err.message || "حدث خطأ غير متوقع";
  }
}

// ------- Page: Admin -------
async function initAdmin(){
  const root = qs("[data-page='admin']");
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const branchFilter = (params.get("branch") || "").trim();

  // Local settings (message + image) stored in browser
  const msgKey = "daily_message";
  const imgKey = "daily_image";

  const msgInput = qs("#dailyMessage");
  const imgInput = qs("#dailyImage");
  msgInput.value = localStorage.getItem(msgKey) || "رسالة اليوم: شاركنا الأجر بدعم طالب قرآن 🌿";
  imgInput.value = localStorage.getItem(imgKey) || "";

  const applyPreview = ()=>{
    qs("#previewMsg").textContent = msgInput.value || "—";
    const img = qs("#previewImg");
    if (imgInput.value){
      img.src = imgInput.value;
      img.classList.remove("hidden");
    }else{
      img.classList.add("hidden");
    }
  };
  applyPreview();

  qs("#saveBtn").addEventListener("click", ()=>{
    localStorage.setItem(msgKey, msgInput.value);
    localStorage.setItem(imgKey, imgInput.value);
    applyPreview();
    qs("#saveBtn").textContent = "تم الحفظ ✅";
    setTimeout(()=> qs("#saveBtn").textContent="حفظ", 1200);
  });

  try{
    const rows = await loadRows();
    let ambassadors = rows.filter(r => r.role === "ambassador");

    if (branchFilter){
      ambassadors = ambassadors.filter(r => r.branch === branchFilter);
      qs("#filterBadge").textContent = `فلترة: ${branchFilter}`;
      qs("#filterBadge").classList.remove("hidden");
    }

    // Top ambassadors by today_amount
    const topAmb = [...ambassadors].sort((a,b)=> b.today_amount - a.today_amount).slice(0, 8);
    const aBody = qs("#topAmbTbody");
    aBody.innerHTML = "";
    topAmb.forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.name}</td>
        <td>${r.branch}</td>
        <td>${fmtSAR(r.today_amount)}</td>
      `;
      aBody.appendChild(tr);
    });

    // Top branches by today_amount (aggregation)
    const byBranch = new Map();
    ambassadors.forEach(r=>{
      const key = r.branch || "—";
      if (!byBranch.has(key)) byBranch.set(key, {branch:key, today:0, achieved:0, boxes:0, ambassadors:0});
      const o = byBranch.get(key);
      o.today += r.today_amount;
      o.achieved += r.achieved_amount;
      o.boxes += r.active_boxes;
      o.ambassadors += 1;
    });

    const branches = Array.from(byBranch.values()).sort((a,b)=> b.today - a.today).slice(0, 8);
    const bBody = qs("#topBranchTbody");
    bBody.innerHTML = "";
    branches.forEach(o=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${o.branch}</td>
        <td>${fmtSAR(o.today)}</td>
        <td>${o.ambassadors.toLocaleString("ar-SA")}</td>
      `;
      bBody.appendChild(tr);
    });

    // Count
    qs("#countTxt").textContent = ambassadors.length.toLocaleString("ar-SA");

    // Search ambassadors by name/phone/id
    const input = qs("#search");
    const list = qs("#searchList");
    const renderSearch = (q)=>{
      const qq = (q||"").trim();
      list.innerHTML = "";
      if (!qq) return;
      const hits = ambassadors
        .filter(r => (r.name.includes(qq) || r.phone.includes(qq) || r.ambassador_id.includes(qq)))
        .slice(0, 10);

      hits.forEach(r=>{
        const a = document.createElement("a");
        a.className = "badge";
        a.href = `ambassador.html?id=${encodeURIComponent(r.ambassador_id)}`;
        a.textContent = `${r.name} — ${fmtSAR(r.today_amount)}`;
        list.appendChild(a);
      });
    };
    input.addEventListener("input", ()=> renderSearch(input.value));

    qs("#refreshBtn").addEventListener("click", ()=> location.reload());

  }catch(err){
    qs("#state").textContent = err.message || "حدث خطأ غير متوقع";
  }
}

// ------- Boot -------
document.addEventListener("DOMContentLoaded", ()=>{
  initAmbassador();
  initBranch();
  initAdmin();
});
