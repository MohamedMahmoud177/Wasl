/* ====== وصل WASL — منطق تطبيق الموظفين (متصل بـ Supabase) ======
   البيانات كلها في قاعدة بيانات حقيقية على الإنترنت الآن، مش في المتصفح.
   لازم ترفع schema.sql على مشروع Supabase وتحدّث config.js ببيانات مشروعك أولاً. */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COMPANY = {
  name: "وصل للشحن السريع",
  phone: "19555",
  terms: "يقر المرسل بأن البيانات أعلاه صحيحة. تخضع الشحنة لشروط النقل الخاصة بشركة وصل. لا تتحمل الشركة مسؤولية تأخير التسليم الناتج عن ظروف خارجة عن إرادتها."
};

const STATUS_META = {
  pending:     { label: "قيد التجهيز", color: "#6B6A66", icon: "box" },
  shipped:     { label: "تم الشحن",    color: "#E8722A", icon: "truck" },
  "in-transit":{ label: "في الطريق",   color: "#2E4270", icon: "route" },
  delivered:   { label: "تم التسليم",  color: "#2D9C6F", icon: "check" }
};
const STATUS_ORDER = ["pending", "shipped", "in-transit", "delivered"];

/* ================= بيانات المحافظات والمناطق (مصر) ================= */
const GOVERNORATES = [
  "القاهرة","الجيزة","الإسكندرية","الدقهلية","البحر الأحمر","البحيرة","الفيوم","الغربية",
  "الإسماعيلية","المنوفية","المنيا","القليوبية","الوادي الجديد","السويس","أسوان","أسيوط",
  "بني سويف","بورسعيد","دمياط","الشرقية","جنوب سيناء","كفر الشيخ","مطروح","الأقصر","قنا",
  "شمال سيناء","سوهاج"
];
const AREAS_BY_GOVERNORATE = {
  "القاهرة": ["مدينة نصر","المعادي","مصر الجديدة","الزمالك","حلوان","شبرا","وسط البلد","التجمع الخامس","المقطم","عين شمس"],
  "الجيزة": ["الدقي","المهندسين","الهرم","فيصل","6 أكتوبر","الشيخ زايد","العجوزة","إمبابة"],
  "الإسكندرية": ["سيدي جابر","سموحة","ميامي","العجمي","محرم بك","ستانلي","المنتزه","سيدي بشر"],
  "القليوبية": ["بنها","شبرا الخيمة","القناطر الخيرية","الخانكة","طوخ"],
  "الشرقية": ["الزقازيق","العاشر من رمضان","بلبيس","منيا القمح","فاقوس"],
  "الدقهلية": ["المنصورة","ميت غمر","طلخا","دكرنس"]
};
const AREA_OTHER = "__other__";

function fillSelect(select, options, placeholder) {
  select.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : "") +
    options.map(o => `<option value="${o}">${o}</option>`).join("");
}
function initGovernorateSelects() {
  fillSelect(document.getElementById("origin"), GOVERNORATES, "اختر المحافظة");
  fillSelect(document.getElementById("destGovernorate"), GOVERNORATES, "اختر المحافظة");
  updateAreaOptions();
}
function updateAreaOptions() {
  const gov = document.getElementById("destGovernorate").value;
  const areas = AREAS_BY_GOVERNORATE[gov] || [];
  const areaSelect = document.getElementById("destArea");
  const options = [...areas, AREA_OTHER];
  areaSelect.innerHTML = `<option value="">اختر المنطقة</option>` +
    areas.map(a => `<option value="${a}">${a}</option>`).join("") +
    `<option value="${AREA_OTHER}">أخرى (اكتب يدويًا)</option>`;
  document.getElementById("destAreaOtherWrap").classList.add("hidden-field");
}
document.getElementById("destGovernorate").addEventListener("change", updateAreaOptions);
document.getElementById("destArea").addEventListener("change", (e) => {
  document.getElementById("destAreaOtherWrap").classList.toggle("hidden-field", e.target.value !== AREA_OTHER);
});

/* ================= المصادقة ================= */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errorEl.textContent = "بيانات الدخول غير صحيحة."; return; }
  const profile = await fetchOwnProfile(data.user.id);
  if (!profile || profile.role !== "staff") {
    errorEl.textContent = "هذا الحساب غير مصرّح له بدخول لوحة الموظفين.";
    await sb.auth.signOut();
    return;
  }
  await enterApp(profile);
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.reload();
});

async function fetchOwnProfile(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).single();
  return data;
}

async function enterApp(profile) {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appRoot").classList.add("visible");
  document.getElementById("currentUserLabel").textContent = `مرحبًا، ${profile.name || "موظف"}`;
  initGovernorateSelects();
  await Promise.all([renderDashboard(), renderAllTable(), renderStaffDirectory()]);
}

/* عند تحميل الصفحة: تحقق هل فيه جلسة دخول محفوظة */
(async function boot() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    const profile = await fetchOwnProfile(data.session.user.id);
    if (profile && profile.role === "staff") { await enterApp(profile); return; }
  }
  document.getElementById("loginScreen").classList.remove("hidden");
})();

/* ================= رقم التتبع ================= */
async function nextTrackingNumber() {
  const { data } = await sb.from("shipments").select("tracking").order("created_at", { ascending: false }).limit(1);
  if (!data || !data.length) return "WASL-10001";
  const n = parseInt(data[0].tracking.split("-")[1], 10) || 10000;
  return `WASL-${n + 1}`;
}

/* ================= تسجيل شحنة جديدة ================= */
document.getElementById("shipmentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const areaValue = document.getElementById("destArea").value;
  const destArea = areaValue === AREA_OTHER ? document.getElementById("destAreaOther").value.trim() : areaValue;
  const weightRaw = document.getElementById("weight").value;

  const tracking = await nextTrackingNumber();
  const { data: userData } = await sb.auth.getUser();

  const shipment = {
    tracking,
    sender_name: document.getElementById("custName").value.trim(),
    sender_phone: document.getElementById("custPhone").value.trim(),
    receiver_name: document.getElementById("recvName").value.trim(),
    receiver_phone: document.getElementById("recvPhone").value.trim(),
    origin_governorate: document.getElementById("origin").value,
    dest_governorate: document.getElementById("destGovernorate").value,
    dest_area: destArea,
    dest_address: document.getElementById("destAddress").value.trim(),
    weight: weightRaw ? parseFloat(weightRaw) : null,
    pieces: parseInt(document.getElementById("pieces").value, 10) || 1,
    service_type: document.getElementById("serviceType").value,
    item_desc: document.getElementById("itemDesc").value.trim(),
    payment_type: document.getElementById("paymentType").value,
    price: parseFloat(document.getElementById("manualPrice").value),
    status: "pending",
    created_by: userData.user.id
  };

  const { data, error } = await sb.from("shipments").insert(shipment).select().single();
  if (error) { alert("حصل خطأ أثناء تسجيل الشحنة: " + error.message); return; }

  if (document.getElementById("smsOnCreate").checked) {
    await sendSmsNotification(data, `تم تسجيل شحنتك برقم ${data.tracking}. سنعلمك عند تحديث الحالة.`);
  }

  e.target.reset();
  document.getElementById("pieces").value = 1;
  document.getElementById("smsOnCreate").checked = true;
  initGovernorateSelects();
  showReceipt(data);
  await renderDashboard();
  await renderAllTable();
});

/* ================= الإيصال المختصر ================= */
let receiptTracking = null;
function showReceipt(s) {
  receiptTracking = s.tracking;
  document.getElementById("receiptContent").innerHTML = `
    <div class="receipt">
      <div class="receipt-head">
        <img src="logo.svg" alt="وصل">
        <div><h3>وصل</h3><small>تم تسجيل الشحنة بنجاح</small></div>
      </div>
      <div class="receipt-track">${s.tracking}</div>
      <div class="receipt-row"><span>العميل</span><span>${escapeHtml(s.sender_name)}</span></div>
      <div class="receipt-row"><span>الوجهة</span><span>${escapeHtml(s.dest_governorate)} — ${escapeHtml(s.dest_area)}</span></div>
      <div class="receipt-row"><span>الإجمالي</span><span class="mono"><strong>${s.price} ج.م</strong></span></div>
    </div>`;
  document.getElementById("receiptModal").classList.add("open");
}
document.getElementById("closeReceipt").addEventListener("click", () => {
  document.getElementById("receiptModal").classList.remove("open");
});
document.getElementById("printWaybillBtn").addEventListener("click", async () => {
  const { data } = await sb.from("shipments").select("*").eq("tracking", receiptTracking).single();
  if (data) printWaybill(data);
});

function serviceLabel(type) { return { economy: "اقتصادي", express: "سريع", "same-day": "نفس اليوم" }[type] || type; }
function formatDate(iso) { return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }); }
function escapeHtml(str) { const div = document.createElement("div"); div.textContent = str ?? ""; return div.innerHTML; }

/* ================= بوليصة الشحن الاحترافية ================= */
function printWaybill(s) {
  const area = document.getElementById("waybillPrintArea");
  area.innerHTML = `
    <div class="waybill">
      <div class="wb-header">
        <div class="wb-brand"><img src="logo.svg" alt="وصل"><div><h2>وصل</h2><small>${COMPANY.name}</small></div></div>
        <div class="wb-title"><strong>بوليصة شحن</strong><span>${formatDate(s.created_at)}</span></div>
      </div>
      <div class="wb-barcode"><svg id="wbBarcode"></svg><div class="wb-track-code">${s.tracking}</div></div>
      <div class="wb-parties">
        <div class="wb-party sender">
          <h4>المرسل</h4>
          <p class="wb-name">${escapeHtml(s.sender_name)}</p>
          <p>${escapeHtml(s.sender_phone)}</p>
          <p>${escapeHtml(s.origin_governorate)}</p>
        </div>
        <div class="wb-party receiver">
          <h4>المستلم</h4>
          <p class="wb-name">${escapeHtml(s.receiver_name)}</p>
          <p>${escapeHtml(s.receiver_phone)}</p>
          <p>${escapeHtml(s.dest_governorate)} — ${escapeHtml(s.dest_area)}${s.dest_address ? " — " + escapeHtml(s.dest_address) : ""}</p>
        </div>
      </div>
      <div class="wb-details">
        <table>
          <tr><td>وصف البضاعة</td><td>${escapeHtml(s.item_desc || "غير محدد")}</td></tr>
          <tr><td>عدد الطرود</td><td>${s.pieces || 1}</td></tr>
          <tr><td>الوزن</td><td>${s.weight ? s.weight + " كجم" : "غير محدد"}</td></tr>
          <tr><td>نوع الخدمة</td><td>${serviceLabel(s.service_type)}</td></tr>
          <tr><td>طريقة الدفع</td><td>${s.payment_type === "cod" ? "تحصيل عند الاستلام" : "مدفوع مقدمًا"}</td></tr>
        </table>
      </div>
      ${s.payment_type === "cod" ? `
      <div class="wb-cod"><span>المبلغ المطلوب تحصيله</span><strong>${s.price} ج.م</strong></div>` : `
      <div class="wb-cod" style="border-color:var(--green);background:var(--green-light);"><span style="color:#1E6B4C;">الحالة</span><strong>مدفوع مقدمًا</strong></div>`}
      <div class="wb-footer">
        <div class="wb-qr"><div id="wbQr"></div><span>امسح للتتبع</span></div>
        <div class="wb-signatures">
          <div class="wb-sign"><div class="wb-sign-line"></div>توقيع المندوب</div>
          <div class="wb-sign"><div class="wb-sign-line"></div>توقيع المستلم</div>
        </div>
      </div>
      <div class="wb-terms">${COMPANY.terms} — للاستفسار: ${COMPANY.phone}</div>
    </div>`;

  if (window.JsBarcode) {
    JsBarcode("#wbBarcode", s.tracking, { format: "CODE128", height: 40, displayValue: false, margin: 0, background: "#ffffff", lineColor: "#1B2A4A" });
  }
  if (window.QRCode) {
    document.getElementById("wbQr").innerHTML = "";
    new QRCode(document.getElementById("wbQr"), {
      text: `${location.origin}${location.pathname}#track=${s.tracking}`,
      width: 76, height: 76, colorDark: "#1B2A4A", colorLight: "#ffffff"
    });
  }
  setTimeout(() => window.print(), 150);
}

/* ================= لوحة التحكم ================= */
async function renderDashboard() {
  const { data: list } = await sb.from("shipments").select("*").order("created_at", { ascending: false });
  const shipments = list || [];
  document.getElementById("statTotal").textContent = shipments.length;
  document.getElementById("statTransit").textContent = shipments.filter(s => s.status === "shipped" || s.status === "in-transit").length;
  document.getElementById("statDelivered").textContent = shipments.filter(s => s.status === "delivered").length;
  document.getElementById("statRevenue").textContent = `${shipments.reduce((sum, s) => sum + (s.price || 0), 0)} ج.م`;

  document.querySelector("#recentTable tbody").innerHTML = shipments.slice(0, 6).map(s => `
    <tr>
      <td class="mono">${s.tracking}</td>
      <td>${escapeHtml(s.sender_name)}</td>
      <td>${escapeHtml(s.dest_governorate)}</td>
      <td>${statusBadge(s.status)}</td>
      <td>${formatDate(s.created_at)}</td>
    </tr>`).join("");
  document.getElementById("dashEmptyHint").style.display = shipments.length ? "none" : "block";

  const { data: notifs } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(8);
  document.getElementById("notifList").innerHTML = (notifs || []).map(n => `
    <li>${escapeHtml(n.message)}<span class="notif-time">${n.tracking} — ${formatDate(n.created_at)}</span></li>`).join("");
  document.getElementById("notifEmptyHint").style.display = (notifs || []).length ? "none" : "block";
}
function statusBadge(status) { return `<span class="badge badge-${status}" style="background:${STATUS_META[status].color}22;color:${STATUS_META[status].color};">${STATUS_META[status].label}</span>`; }

async function sendSmsNotification(shipment, message) {
  await sb.from("notifications").insert({ tracking: shipment.tracking, phone: shipment.sender_phone, message });
  /* لتفعيل SMS حقيقي: استبدل هذا بطلب fetch() لمزود SMS بعد إدراج الإشعار، مثال:
     fetch('https://api.smsprovider.com/send', { method:'POST', body: JSON.stringify({ to: shipment.receiver_phone, message }) }) */
}

/* ================= جدول كل الشحنات + الحالة كـ checkboxes ================= */
let allShipmentsCache = [];
async function renderAllTable() {
  const { data } = await sb.from("shipments").select("*").order("created_at", { ascending: false });
  allShipmentsCache = data || [];
  applyTableFilters();
}
function applyTableFilters() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;
  const filtered = allShipmentsCache.filter(s => {
    const matchesSearch = !search || s.sender_name.toLowerCase().includes(search) || s.tracking.toLowerCase().includes(search);
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  document.querySelector("#allTable tbody").innerHTML = filtered.map(s => `
    <tr>
      <td class="mono">${s.tracking}</td>
      <td>${escapeHtml(s.sender_name)}</td>
      <td>${escapeHtml(s.dest_governorate)} — ${escapeHtml(s.dest_area)}</td>
      <td class="mono">${s.price} ج.م</td>
      <td>${statusCheckboxes(s)}</td>
      <td><div class="row-actions">
        <button class="mini-btn" onclick="reprintWaybill('${s.tracking}')">البوليصة</button>
        <button class="mini-btn" onclick="deleteShipment('${s.tracking}')">حذف</button>
      </div></td>
    </tr>`).join("");
  document.getElementById("allEmptyHint").style.display = filtered.length ? "none" : "block";
}
function statusCheckboxes(s) {
  return `<div class="status-check-group">` + STATUS_ORDER.map(key => `
    <label class="status-check" style="--stc:${STATUS_META[key].color}" title="${STATUS_META[key].label}">
      <input type="checkbox" ${s.status === key ? "checked" : ""} onchange="setStatus('${s.tracking}','${key}')">
      <span>${STATUS_META[key].label}</span>
    </label>`).join("") + `</div>`;
}
async function setStatus(tracking, status) {
  const { data, error } = await sb.from("shipments").update({ status }).eq("tracking", tracking).select().single();
  if (error) { alert("تعذّر تحديث الحالة: " + error.message); return; }
  await sendSmsNotification(data, `تحديث: شحنتك ${data.tracking} الآن ${STATUS_META[status].label}.`);
  await renderAllTable();
  await renderDashboard();
}
async function deleteShipment(tracking) {
  if (!confirm(`هل تريد حذف الشحنة ${tracking}؟`)) return;
  await sb.from("shipments").delete().eq("tracking", tracking);
  await renderAllTable();
  await renderDashboard();
}
async function reprintWaybill(tracking) {
  const { data } = await sb.from("shipments").select("*").eq("tracking", tracking).single();
  if (data) printWaybill(data);
}
document.getElementById("searchInput").addEventListener("input", applyTableFilters);
document.getElementById("statusFilter").addEventListener("change", applyTableFilters);

/* ================= تصدير Excel ================= */
document.getElementById("exportExcelBtn").addEventListener("click", () => {
  if (!window.XLSX) { alert("مكتبة التصدير لم تُحمّل بعد."); return; }
  const rows = allShipmentsCache.map(s => ({
    "رقم التتبع": s.tracking, "المرسل": s.sender_name, "هاتف المرسل": s.sender_phone,
    "المستلم": s.receiver_name, "هاتف المستلم": s.receiver_phone,
    "محافظة المنشأ": s.origin_governorate, "محافظة الوجهة": s.dest_governorate, "المنطقة": s.dest_area,
    "العنوان": s.dest_address, "الوزن (كجم)": s.weight ?? "", "عدد الطرود": s.pieces,
    "الخدمة": serviceLabel(s.service_type), "السعر": s.price,
    "الدفع": s.payment_type === "cod" ? "عند الاستلام" : "مدفوع مقدمًا",
    "الحالة": STATUS_META[s.status].label, "التاريخ": formatDate(s.created_at)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الشحنات");
  XLSX.writeFile(wb, `wasl-shipments-${new Date().toISOString().slice(0,10)}.xlsx`);
});

/* ================= التتبع (داخل تطبيق الموظفين) ================= */
document.getElementById("trackBtn").addEventListener("click", doTrack);
document.getElementById("trackInput").addEventListener("keydown", e => { if (e.key === "Enter") doTrack(); });
async function doTrack() {
  const query = document.getElementById("trackInput").value.trim().toUpperCase();
  const result = document.getElementById("trackResult");
  if (!query) { result.innerHTML = ""; return; }
  const { data: s } = await sb.from("shipments").select("*").eq("tracking", query).single();
  if (!s) { result.innerHTML = `<p class="empty-hint">لم يتم العثور على شحنة بهذا الرقم.</p>`; return; }
  result.innerHTML = renderTrackTimeline(s);
}
function renderTrackTimeline(s) {
  const idx = STATUS_ORDER.indexOf(s.status);
  const icons = {
    box: `<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>`,
    truck: `<rect x="2" y="8" width="12" height="8" rx="1"/><path d="M14 11h4l3 3v2h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>`,
    route: `<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M6 8v3a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4"/>`,
    check: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>`
  };
  const steps = STATUS_ORDER.map((key, i) => {
    const meta = STATUS_META[key];
    const done = i <= idx;
    return `
      <div class="track-step2 ${done ? "done" : ""}" style="--stc:${meta.color}">
        <div class="track-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[meta.icon]}</svg></div>
        <span>${meta.label}</span>
      </div>`;
  }).join(`<div class="track-line"></div>`);
  return `
    <div class="track-result-card">
      <div class="receipt-row"><span>العميل</span><span>${escapeHtml(s.sender_name)}</span></div>
      <div class="receipt-row"><span>من → إلى</span><span>${escapeHtml(s.origin_governorate)} → ${escapeHtml(s.dest_governorate)} (${escapeHtml(s.dest_area)})</span></div>
      <div class="track-steps2">${steps}</div>
    </div>`;
}

/* ================= دليل الموظفين (للقراءة فقط) ================= */
async function renderStaffDirectory() {
  const { data } = await sb.from("profiles").select("*").eq("role", "staff").order("created_at");
  document.querySelector("#employeesTable tbody").innerHTML = (data || []).map(p => `
    <tr><td>${escapeHtml(p.name || "—")}</td><td class="mono">${escapeHtml(p.phone || "—")}</td></tr>`).join("");
}

/* ================= التبويبات ================= */
document.getElementById("tabs").addEventListener("click", async (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  if (btn.dataset.tab === "dashboard") await renderDashboard();
  if (btn.dataset.tab === "shipments") await renderAllTable();
  if (btn.dataset.tab === "employees") await renderStaffDirectory();
});
