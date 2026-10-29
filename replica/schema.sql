-- monday-replica schema (Postgres). Used by /replica-backend; the client's lib/data.js mirrors these shapes.
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  title text,
  avatar_color text not null default 'blue',
  timezone text not null default 'Europe/London',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (team_id, user_id)
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'open' check (kind in ('open','closed')),
  description text,
  is_default boolean not null default false,
  state text not null default 'active' check (state in ('active','archived','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workspaces_one_default on workspaces (is_default) where is_default;

create table folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_folder_id uuid references folders(id) on delete cascade,
  name text not null,
  color text not null default 'grey',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index on folders (workspace_id);

create table boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  description text check (char_length(description) <= 1000),
  kind text not null default 'public' check (kind in ('public','private','share')),
  state text not null default 'active' check (state in ('active','archived','deleted')),
  permissions text not null default 'everyone' check (permissions in ('everyone','collaborators','assignee','owners')),
  item_terminology text not null default 'item',
  position double precision not null default 0,
  created_by uuid references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on boards (workspace_id, state);

create table board_members (
  board_id uuid not null references boards(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'subscriber' check (role in ('owner','subscriber')),
  primary key (board_id, user_id)
);

create table board_views (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null,
  type text not null check (type in ('table','kanban','calendar')),
  settings jsonb not null default '{}',
  filter jsonb not null default '{"rules":[],"logic":"and"}',
  sort jsonb not null default '[]',
  hidden_column_ids uuid[] not null default '{}',
  position double precision not null default 0,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index on board_views (board_id);

create table groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  title text not null check (char_length(title) <= 255),
  color text not null default 'blue',
  position double precision not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on groups (board_id, position);

create table columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  title text not null,
  type text not null,
  settings jsonb not null default '{}',
  description text,
  width integer not null default 140,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index on columns (board_id, position);

create table items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  parent_item_id uuid references items(id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  state text not null default 'active' check (state in ('active','archived','deleted')),
  created_by uuid references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on items (board_id, state);
create index on items (group_id, position);
create index on items (parent_item_id);

create table column_values (
  item_id uuid not null references items(id) on delete cascade,
  column_id uuid not null references columns(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (item_id, column_id)
);
-- people lookups for My Work and the person filter: value->'user_ids' contains the user
create index column_values_people on column_values using gin (value jsonb_path_ops);

create table updates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  parent_update_id uuid references updates(id) on delete cascade,
  creator_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) <= 46000),
  pinned boolean not null default false,
  likes uuid[] not null default '{}',
  seen_by uuid[] not null default '{}',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on updates (item_id, created_at desc);

create table activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  event text not null,
  column_id uuid references columns(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index on activity (board_id, created_at desc);
create index on activity (item_id, created_at desc);

create table favorites (
  user_id uuid not null references users(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  position double precision not null default 0,
  primary key (user_id, board_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('mention','assigned','reply')),
  item_id uuid references items(id) on delete cascade,
  update_id uuid references updates(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, read_at, created_at desc);
