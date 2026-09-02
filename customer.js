/* ====== وصل WASL — بوابة العميل ======
   العميل يشوف بس الشحنات اللي رقم هاتفه مسجل فيها كمرسل أو مستلم.
   الحماية الفعلية هنا مش في هذا الكود، بل في سياسات RLS داخل قاعدة البيانات (شوف schema.sql). */

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUS_META = {
  pending:     { label: "قيد التجهيز", color: "#6B6A66", icon: "box" },
  shipped:     { label: "تم الشحن",    color: "#E8722A", icon: "truck" },
  "in-transit":{ label: "في الطريق",   color: "#2E4270", icon: "route" },
  delivered:   { label: "تم التسليم",  color: "#2D9C6F", icon: "check" }
};
const STATUS_ORDER = ["pending", "shipped", "in-transit", "delivered"];
const ICONS = {
  box: `<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>`,
  truck: `<rect x="2" y="8" width="12" height="8" rx="1"/><path d="M14 11h4l3 3v2h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>`,
  route: `<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M6 8v3a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4"/>`,
  check: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>`
};

/* تبديل تسجيل الدخول / حساب جديد */
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.mode === "login";
    document.getElementById("loginCustForm").classList.toggle("hidden-field", !isLogin);
    document.getElementById("signupCustForm").classList.toggle("hidden-field", isLogin);
  });
});

document.getElementById("loginCustForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("custLoginEmail").value.trim();
  const password = document.getElementById("custLoginPass").value;
  const errorEl = document.getElementById("custLoginError");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errorEl.textContent = "بيانات الدخول غير صحيحة."; return; }
  await enterCustomerApp(data.user.id);
});

document.getElementById("signupCustForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("custSignName").value.trim();
  const phone = document.getElementById("custSignPhone").value.trim();
  const email = document.getElementById("custSignEmail").value.trim();
  const password = document.getElementById("custSignPass").value;
  const errorEl = document.getElementById("custSignError");
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name, phone, role: "customer" } }
  });
  if (error) { errorEl.textContent = error.message; return; }
  if (!data.session) {
    errorEl.style.color = "#1E6B4C";
    errorEl.textContent = "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.";
    return;
  }
  await enterCustomerApp(data.user.id);
});

document.getElementById("custLogoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.reload();
});

async function enterCustomerApp(userId) {
  const { data: profile } = await sb.from("profiles").select("*").eq("id", userId).single();
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("custRoot").classList.add("visible");
  document.getElementById("custUserLabel").textContent = `مرحبًا، ${profile?.name || "عميل"}`;
  await loadMyShipments();
}

async function loadMyShipments() {
  const { data, error } = await sb.from("shipments").select("*").order("created_at", { ascending: false });
  const list = document.getElementById("custShipmentsList");
  if (error || !data || !data.length) {
    document.getElementById("custEmptyHint").style.display = "block";
    list.innerHTML = "";
    return;
  }
  document.getElementById("custEmptyHint").style.display = "none";
  list.innerHTML = data.map(renderShipmentCard).join("");
}

function renderShipmentCard(s) {
  const idx = STATUS_ORDER.indexOf(s.status);
  const steps = STATUS_ORDER.map((key, i) => {
    const meta = STATUS_META[key];
    const done = i <= idx;
    return `
      <div class="track-step2 ${done ? "done" : ""}" style="--stc:${meta.color}">
        <div class="track-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[meta.icon]}</svg></div>
        <span>${meta.label}</span>
      </div>`;
  }).join(`<div class="track-line"></div>`);

  return `
    <div class="track-result-card" style="margin-bottom:14px;">
      <div class="receipt-row"><span>رقم التتبع</span><span class="mono"><strong>${escapeHtml(s.tracking)}</strong></span></div>
      <div class="receipt-row"><span>من → إلى</span><span>${escapeHtml(s.origin_governorate)} → ${escapeHtml(s.dest_governorate)} (${escapeHtml(s.dest_area)})</span></div>
      <div class="track-steps2">${steps}</div>
    </div>`;
}
function escapeHtml(str) { const div = document.createElement("div"); div.textContent = str ?? ""; return div.innerHTML; }

/* هل فيه جلسة دخول محفوظة؟ */
(async function boot() {
  const { data } = await sb.auth.getSession();
  if (data.session) { await enterCustomerApp(data.session.user.id); }
  else { document.getElementById("authScreen").classList.remove("hidden"); }
})();
