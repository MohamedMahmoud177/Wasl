-- ============================================================
-- وصل WASL — ترقية السكيما (Migration v2)
-- نفّذ هذا الملف في نفس مشروع Supabase الحالي (SQL Editor → New query → Run)
-- لا يحذف أي بيانات موجودة — يضيف جداول وصلاحيات جديدة فقط.
-- ============================================================

-- ---------- 1) الأدوار: إضافة دور "المالك" (owner) ----------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('owner','staff','customer'));

-- رقّي حسابك الحالي من staff إلى owner (بدّل البريد لو مختلف)
update profiles set role = 'owner'
where id = (select id from auth.users where email = 'mm3200162@gmail.com');

-- ---------- 2) حالة "مرفوضة" + تكلفة فعلية للشحنات المرفوضة ----------
alter table shipments drop constraint if exists shipments_status_check;
alter table shipments add constraint shipments_status_check
  check (status in ('pending','shipped','in-transit','delivered','rejected'));

alter table shipments add column if not exists actual_cost numeric; -- تُدخل يدويًا عند الرفض

-- ---------- 3) جدول العملاء ----------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  governorate text,
  business_type text,   -- طبيعة العمل
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table customers enable row level security;

drop policy if exists "المالك صلاحية كاملة على العملاء" on customers;
create policy "المالك صلاحية كاملة على العملاء" on customers
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );

drop policy if exists "الموظفون يشوفوا العملاء فقط" on customers;
create policy "الموظفون يشوفوا العملاء فقط" on customers
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','staff'))
  );

-- ---------- 4) لوحة أسعار المحافظات ----------
create table if not exists pricing_governorates (
  governorate text primary key,
  price numeric not null,
  updated_at timestamptz default now()
);
alter table pricing_governorates enable row level security;

drop policy if exists "الجميع من الموظفين يشوفوا الأسعار" on pricing_governorates;
create policy "الجميع من الموظفين يشوفوا الأسعار" on pricing_governorates
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','staff'))
  );

drop policy if exists "المالك فقط يعدّل الأسعار" on pricing_governorates;
create policy "المالك فقط يعدّل الأسعار" on pricing_governorates
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );
drop policy if exists "المالك فقط يحدّث الأسعار" on pricing_governorates;
create policy "المالك فقط يحدّث الأسعار" on pricing_governorates
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );
drop policy if exists "المالك فقط يحذف الأسعار" on pricing_governorates;
create policy "المالك فقط يحذف الأسعار" on pricing_governorates
  for delete using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- ---------- 5) تحديث صلاحيات profiles: الموظفون بقوا ما يشوفوش دليل الموظفين ----------
drop policy if exists "الموظفون يشوفوا كل الملفات" on profiles;
create policy "المالك بس يشوف كل الملفات" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- ---------- 6) تحديث صلاحيات shipments: الموظفون تعامل عادي، المالك صلاحية كاملة (بدون تغيير فعلي، للتوثيق فقط) ----------
drop policy if exists "الموظفون صلاحية كاملة على الشحنات" on shipments;
create policy "الموظفون والمالك صلاحية كاملة على الشحنات" on shipments
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','staff'))
  );

-- ============================================================
-- بعد التنفيذ:
-- 1) تأكد إن حسابك بقى role = 'owner' (شغّل: select role from profiles where id = auth.uid();)
-- 2) لإضافة سعر محافظة أول مرة، من داخل التطبيق (تبويب "أسعار المحافظات") أو يدويًا:
--    insert into pricing_governorates (governorate, price) values ('القاهرة', 60);
-- ============================================================
