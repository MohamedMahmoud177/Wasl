/* ====== إعدادات الاتصال بـ Supabase ======
   عدّل القيمتين دول بس ببيانات مشروعك (Supabase Dashboard → Project Settings → API):
   - Project URL
   - anon public key (آمن يظهر في الكود، مش الـ service_role key) */

const SUPABASE_URL = "https://ojyntfealtjjycnjnlzn.supabase.co";
const SUPABASE_ANON_KEY = "Sb_publishable_y34CSf8eEdOeqiL2XHhJjQ_KCy9pIwc";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
