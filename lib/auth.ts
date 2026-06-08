import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

// Server-side session check. Returns { user, profile } or null.
export async function getAuthenticatedUser() {
  const cookieStore = await cookies()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  // getUser() validates the token with the auth server. getSession() only
  // decodes the cookie, so it isn't safe to authorize on.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, email, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return { user, profile }
}
