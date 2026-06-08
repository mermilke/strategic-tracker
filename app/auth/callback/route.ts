import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../lib/database.types'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/dashboard'

  // Supabase sometimes sends errors back as query params, catch those
  const errorParam = searchParams.get('error')
  const errorCode = searchParams.get('error_code')
  const errorDescription = searchParams.get('error_description')
  if (errorParam || errorCode) {
    const errorQuery = new URLSearchParams()
    if (errorParam) errorQuery.set('error', errorParam)
    if (errorCode) errorQuery.set('error_code', errorCode)
    if (errorDescription) errorQuery.set('error_description', errorDescription)
    return NextResponse.redirect(`${origin}/login?${errorQuery.toString()}`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(origin + next)
    }
  }

  // no code and no error, back to login. Hash fragment errors (#error=...) can't
  // be read server-side, so the login page parses those client-side.
  return NextResponse.redirect(origin + '/login?error=auth_callback_failed')
}
