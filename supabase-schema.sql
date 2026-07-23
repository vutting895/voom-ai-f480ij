-- Voom AI V2 Supabase Schema
-- Run this in Supabase SQL Editor

-- Enable vector extension
create extension if not exists vector;

-- Memories table
create table if not exists voom_memories (
  id uuid primary key,
  content text not null,
  embedding vector(768),
  created_at timestamptz default now()
);

-- Documents table
create table if not exists voom_documents (
  id uuid primary key,
  filename text not null,
  content text,
  created_at timestamptz default now()
);

-- Document chunks with embeddings
create table if not exists voom_document_chunks (
  id uuid primary key,
  document_id uuid references voom_documents(id) on delete cascade,
  content text not null,
  embedding vector(768)
);

-- Indexes for speed
create index if not exists voom_memories_embedding_idx on voom_memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists voom_chunks_embedding_idx on voom_document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Function: match memories
create or replace function match_memories(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (id uuid, content text, similarity float)
language sql stable
as $$
  select
    voom_memories.id,
    voom_memories.content,
    1 - (voom_memories.embedding <=> query_embedding) as similarity
  from voom_memories
  where 1 - (voom_memories.embedding <=> query_embedding) > match_threshold
  order by voom_memories.embedding <=> query_embedding
  limit match_count;
$$;

-- Function: match document chunks
create or replace function match_document_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql stable
as $$
  select
    voom_document_chunks.id,
    voom_document_chunks.document_id,
    voom_document_chunks.content,
    1 - (voom_document_chunks.embedding <=> query_embedding) as similarity
  from voom_document_chunks
  where 1 - (voom_document_chunks.embedding <=> query_embedding) > match_threshold
  order by voom_document_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- Enable RLS (optional, allow all for now)
alter table voom_memories enable row level security;
alter table voom_documents enable row level security;
alter table voom_document_chunks enable row level security;

create policy "Allow all" on voom_memories for all using (true) with check (true);
create policy "Allow all" on voom_documents for all using (true) with check (true);
create policy "Allow all" on voom_document_chunks for all using (true) with check (true);
