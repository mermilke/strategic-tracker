// Helpers for the RLS integration tests. These run against a LOCAL Supabase
// stack (npx supabase start), never a hosted project. Connection details are
// read from `supabase status` at runtime, so there are no hardcoded secrets and
// the suite follows whatever ports the local stack is on.

import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const PASSWORD = 'test-password-123'

let cachedConfig = null

// Read API URL + keys from the running local stack. Memoized so we only shell
// out once per worker.
function config() {
  if (cachedConfig) return cachedConfig

  let out
  try {
    out = execSync('npx supabase status -o env', { encoding: 'utf8' })
  } catch (err) {
    throw new Error(
      'Could not read the local Supabase status. Start the stack first with: npx supabase start\n' +
        (err.stderr || err.message || '')
    )
  }

  const read = (key) => {
    const match = out.match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))
    return match ? match[1] : null
  }

  const url = read('API_URL')
  const anonKey = read('ANON_KEY')
  const serviceKey = read('SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Local Supabase status did not include the expected keys; is the stack running?')
  }

  cachedConfig = { url, anonKey, serviceKey }
  return cachedConfig
}

// Service-role client: bypasses RLS. Used only to build fixtures and clean up.
export function adminClient() {
  const { url, serviceKey } = config()
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Anonymous client, signed in below to carry a specific user's JWT so RLS applies.
function anonClient() {
  const { url, anonKey } = config()
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Delete every auth user. The users.id -> auth.users FK cascades, which wipes
// the public.users row and everything that user owns, so each run starts clean.
export async function resetDb(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  for (const user of data.users) {
    await admin.auth.admin.deleteUser(user.id)
  }
}

let userCounter = 0

// Create an auth user with a role. The on_auth_user_created trigger reads the
// role out of user_metadata and inserts the matching public.users row.
export async function createUser(admin, role, fullName) {
  userCounter += 1
  const email = `rls-${role}-${userCounter}@example.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: fullName || email },
  })
  if (error) throw error
  return { id: data.user.id, email }
}

// Returns a client authenticated as the given user; its requests carry that
// user's JWT, so the database applies RLS as that user.
export async function signInAs(email) {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}
