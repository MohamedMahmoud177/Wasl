-- ============================================================
-- وصل WASL — سكيما قاعدة البيانات على Supabase
-- الصق هذا الملف بالكامل في: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- جدول الملفات الشخصية (يمتد من مستخدمي نظام المصادقة auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('staff','customer')),
  name text,
  phone text,
  created_at timestamptz default now()
);

-- جدول الشحنات
create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  tracking text unique not null,
  sender_name text not null,
  sender_phone text not null,
  receiver_name text not null,
  receiver_phone text not null,
  origin_governorate text not null,
  dest_governorate text not null,
  dest_area text not null,
  dest_address text,
  weight numeric,                 -- اختياري
  pieces int default 1,
  service_type text default 'economy',
  item_desc text,
  payment_type text default 'cod',
  price numeric not null,         -- يحدده الموظف يدويًا
  status text not null default 'pending' check (status in ('pending','shipped','in-transit','delivered')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- جدول محاكاة إشعارات SMS
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tracking text not null,
  phone text,
  message text,
  created_at timestamptz default now()
);

-- تفعيل الحماية على مستوى الصف (RLS) — هذا هو خط الدفاع الحقيقي عن البيانات
alter table profiles enable row level security;
alter table shipments enable row level security;
alter table notifications enable row level security;

-- ---------- سياسات profiles ----------
create policy "المستخدم يشوف ملفه الشخصي" on profiles
  for select using (auth.uid() = id);

create policy "الموظفون يشوفوا كل الملفات" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'staff')
  );

create policy "المستخدم يعدّل ملفه الشخصي" on profiles
  for update using (auth.uid() = id);

-- ---------- سياسات shipments ----------
-- الموظفون: صلاحية كاملة (قراءة/إضافة/تعديل/حذف) على كل الشحنات
create policy "الموظفون صلاحية كاملة على الشحنات" on shipments
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'staff')
  );

-- العملاء: يشوفوا فقط الشحنات اللي رقم هاتفهم مسجل فيها كمرسل أو مستلم
create policy "العملاء يشوفوا شحناتهم فقط" on shipments
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'customer'
        and p.phone is not null
        and (p.phone = shipments.sender_phone or p.phone = shipments.receiver_phone)
    )
  );

-- ---------- سياسات notifications ----------
create policy "الموظفون صلاحية كاملة على الإشعارات" on notifications
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'staff')
  );

-- ---------- تريجر: إنشاء ملف شخصي تلقائيًا عند تسجيل أي مستخدم جديد ----------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- بعد تشغيل هذا الملف:
-- 1) سجّل أول حساب موظف من صفحة تسجيل الدخول في التطبيق (هيتسجل كـ customer افتراضيًا)
-- 2) ارجع هنا ونفّذ السطر ده لترقيته لموظف (بدّل البريد الإلكتروني):
--
--    update profiles set role = 'staff'
--    where id = (select id from auth.users where email = 'admin@wasl.com');
--
-- 3) كرر الخطوة دي لأي موظف جديد تضيفه
-- ============================================================
