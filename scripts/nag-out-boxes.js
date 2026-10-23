#!/usr/bin/env node
// Reads nfc_items for anything still marked status = 'out' and raises one
// switchboard operator packet per box, so `remote sync` mirrors it to
// Discord #board as a "put away | still using" button. Built for switchboard
// item 0588 (serves outcome 0465 — the workshop nags things back to their
// home). Never touches Discord directly: it only writes switchboard item
// files and shells out to switchboard.py, the board's one packet loop.
//
// Usage: node scripts/nag-out-boxes.js
//
// Secrets: read from .env.local next to this repo, never printed or passed
// on the command line (secrets-come-from-a-file).

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')

const REPO_ROOT = path.resolve(__dirname, '..')
const SWITCHBOARD = '/Users/connormcgarr/Documents/switchboard/switchboard.py'
const SWITCHBOARD_ITEMS = '/Users/connormcgarr/Documents/switchboard/items'
const SERVES_OUTCOME = '0465'
const PROJECT = 'Workshop NFC'

function loadEnv(file) {
  const out = {}
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function slugifyBoxId(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function todayStamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function existingItemDir(slug) {
  if (!fs.existsSync(SWITCHBOARD_ITEMS)) return null
  const hit = fs.readdirSync(SWITCHBOARD_ITEMS).find(d => d.endsWith(`-${slug}`))
  return hit ? path.join(SWITCHBOARD_ITEMS, hit) : null
}

function packetBody({ iid, boxName, boxId, checkedOutAt }) {
  const when = checkedOutAt ? new Date(checkedOutAt).toISOString().replace('T', ' ').slice(0, 16) : 'an unknown time'
  return `## Packet

### #${iid} · ${boxName} still marked out · permission · blocks 0

The workshop-nfc catalog shows "${boxName}" (\`${boxId}\`) marked **out** since ${when}. This is the nag script (0588/0465) reading real inventory state, not a hand-run test.

Why you: only you know whether it's still in use.

If unanswered: it stays marked out and the next run of the nag script raises it again.

-> answer: ${boxName} (${iid}): put away | still using

## Plain words

The workshop catalog still shows "${boxName}" as out — pulled off the shelf and not back where it lives yet. Put away means you've returned it, so mark it home in the catalog (scan the tag or use the scan page's toggle) and this closes. Still using means leave it out, you're not done with it, and it'll get asked about again next run.

## Resume state

On \`put away\`: \`done ${iid}\` once the box's status is back to \`home\` in nfc_items (scan the tag, tap "Mark home", or a direct update) — this packet only closes the nag, it does not flip the box itself.
On \`still using\`: \`park ${iid}\` until the box goes back to home.
`
}

function raisePacket(box) {
  const boxSlug = slugifyBoxId(box.id)
  const slug = `nag-out-${boxSlug}-${todayStamp()}`
  const already = existingItemDir(slug)
  if (already) {
    console.log(`skip ${box.id}: already raised today (${path.basename(already)})`)
    return
  }

  const title = `${box.name} is still marked out`
  const goal = `The workshop-nfc catalog shows "${box.name}" (${box.id}) marked out. Confirm with the owner whether it should be put away or is still in use.`
  const done = `The owner answers put away or still using.`

  execFileSync('python3', [
    SWITCHBOARD, 'new',
    '--slug', slug,
    '--title', title,
    '--goal', goal,
    '--done', done,
    '--deliver', 'answer',
    '--project', PROJECT,
    '--serves', SERVES_OUTCOME,
    '--why', 'A box the catalog shows out is the exact overdue case outcome 0465 exists to catch; naming it is the shortest path to proving the loop.',
  ], { stdio: 'inherit' })

  const dir = existingItemDir(slug)
  if (!dir) {
    console.error(`could not find item directory just created for slug ${slug}`)
    return
  }
  const iid = path.basename(dir).split('-')[0]

  fs.writeFileSync(path.join(dir, 'checkpoint.md'),
    `---\nitem: ${iid}\nraised_by: nag-out-boxes\ngate: pending\ntype: permission\nkind: putaway\nblocks: 0\n---\n\n` +
    packetBody({ iid, boxName: box.name, boxId: box.id, checkedOutAt: box.checked_out_at }))

  execFileSync('python3', [SWITCHBOARD, 'block', iid, `${box.name} (${box.id}) still marked out`], { stdio: 'inherit' })
  console.log(`raised packet ${iid} for ${box.id}`)
}

async function main() {
  const env = loadEnv(path.join(REPO_ROOT, '.env.local'))
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data, error } = await supabase
    .from('nfc_items')
    .select('id, name, status, checked_out_at')
    .eq('user_id', env.OWNER_USER_ID)
    .eq('status', 'out')
    .order('checked_out_at', { ascending: true })

  if (error) {
    console.error('query failed:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('nothing left out')
    return
  }

  console.log(`${data.length} box(es) still marked out:`)
  for (const box of data) {
    console.log(`- ${box.name} (${box.id}) since ${box.checked_out_at}`)
    raisePacket(box)
  }
}

main()
