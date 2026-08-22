# Workshop NFC Tracker

Scan an NFC tag → open the item record on your phone. Assign boxes to shelves, register new tags, browse your full inventory.

## Stack
- **Next.js** (React) — frontend + API routes
- **Supabase** — Postgres database, free tier
- **Vercel** — hosting, free tier

---

## Setup (15 minutes)

### 1. Supabase database

1. Go to [supabase.com](https://supabase.com) → New project
2. Once created, go to **SQL editor** and paste the contents of `supabase-schema.sql` → Run
3. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` / public key
   - `service_role` key (keep this secret)

### 2. Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → Import project → select your repo
3. Add environment variables in Vercel dashboard:
   ```
   SUPABASE_URL              = https://xxxx.supabase.co   (project_db since 2026-08-22)
   SUPABASE_SERVICE_ROLE_KEY = sb_secret_...
   OWNER_USER_ID             = <auth user uuid whose inventory this is>
   ```
4. Deploy — Vercel gives you a URL like `your-workshop.vercel.app`

### 3. Write your NFC tags

Use any NFC writer app (e.g. **NFC Tools** on iOS/Android):
- Write a **URL** record to each tag
- URL format: `https://your-workshop.vercel.app/scan?id=box-red`
- The ID can be anything — letters, numbers, hyphens. Keep it short.
- If the ID exists in the database → shows the known-item view
- If the ID is new → shows the registration form

**Suggested ID naming:**
- Locations: `shelf-north`, `cabinet-a`, `bench-main`
- Containers: `box-red`, `drawer-1`, `bag-cables`

---

## Pages

| URL | Description |
|-----|-------------|
| `/` | Redirects to inventory |
| `/inventory` | Browse all items, search, filter |
| `/scan?id=<tag-id>` | Scan landing page (known or new) |

## Data model

```
items
  id          text (primary key — same as what's on the NFC tag)
  name        text
  type        'location' | 'container'
  parent_id   text? (references another item's id)
  notes       text
  created_at  timestamp
  updated_at  timestamp
```

A **location** is a place (shelf, cabinet, workbench).  
A **container** is a thing (box, drawer, bag) that lives inside a location.  
Both get NFC tags. Scanning a container shows which location it's in. Scanning a location shows everything inside it.

---

## Local development

```bash
cp .env.local.example .env.local
# fill in your Supabase keys

npm install
npm run dev
# open http://localhost:3000
```
