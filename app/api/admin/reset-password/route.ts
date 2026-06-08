import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../../lib/database.types'

export async function POST(request: Request) {
  try {
    const { email, action } = await request.json()
    // action: 'generate_link' -- returns a recovery link the admin can share

    // make sure the caller is an admin, via the SSR client
    const cookieStore = await cookies()
    const supabaseSSR = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        // This route only reads the session to authorize the caller; it never
        // writes cookies, so getAll alone is enough.
        cookies: { getAll() { return cookieStore.getAll() } },
      }
    )
    const { data: { user } } = await supabaseSSR.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const { data: profile } = await supabaseSSR.from('users').select('role').eq('id', user.id).single()
    if (!profile || (profile.role !== 'manager' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // service role key for the admin operations
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({
        error: 'Service role key not configured. Add SUPABASE_SERVICE_ROLE_KEY to your .env.local file. Find it in Supabase > Settings > API > service_role key.'
      }, { status: 500 })
    }

    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (action === 'generate_link') {
      // recovery link, sidesteps the email rate limits
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
      })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      // Link straight to our reset-password page with the token_hash, skipping
      // Supabase's /auth/v1/verify endpoint. That page calls verifyOtp() client-side.
      const origin = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get('origin') || 'http://localhost:3000'
      const tokenHash = data.properties.hashed_token
      const directLink = `${origin}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
      return NextResponse.json({
        success: true,
        link: directLink,
        message: 'Recovery link generated. Share it with the user directly.'
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err) {
    console.error('Admin reset-password error:', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
