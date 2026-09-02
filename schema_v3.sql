-- ============================================================
-- وصل WASL — ترقية السكيما (Migration v3)
-- نفّذ بعد schema.sql و schema_v2.sql (SQL Editor → New query → Run)
-- ============================================================

-- ---------- 1) اسم مضيف العميل يظهر جانب الصف ----------
alter table customers add column if not exists created_by_name text;

-- ---------- 2) الموظفون بقى ليهم صلاحية إضافة عملاء (مش حذف) ----------
drop policy if exists "المالك صلاحية كاملة على العملاء" on customers;
create policy "المالك صلاحية كاملة على العملاء" on customers
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );

drop policy if exists "الموظفون يضيفوا عملاء" on customers;
create policy "الموظفون يضيفوا عملاء" on customers
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','staff'))
  );

-- (سياسة القراءة "الموظفون يشوفوا العملاء فقط" من v2 لسه شغالة زي ما هي)

-- ---------- 3) جدول الوكلاء (الشحن خارج المحافظة) ----------
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  governorate text,
  notes text,
  created_by uuid references profiles(id),
  created_by_name text,
  created_at timestamptz default now()
);
alter table agents enable row level security;

drop policy if exists "المالك صلاحية كاملة على الوكلاء" on agents;
create policy "المالك صلاحية كاملة على الوكلاء" on agents
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );

drop policy if exists "الموظفون يشوفوا ويضيفوا وكلاء" on agents;
create policy "الموظفون يشوفوا ويضيفوا وكلاء" on agents
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','staff'))
  );

drop policy if exists "الموظفون يضيفوا وكلاء" on agents;
create policy "الموظفون يضيفوا وكلاء" on agents
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','staff'))
  );
-- الحذف والتعديل لمدير المكتب فقط (عبر سياسة "for all" فوق)
