import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../../lib/database.types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // supabase user id
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/meeting?msError=${error}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/meeting?msError=missing_params`
    )
  }

  const clientId = process.env.AZURE_CLIENT_ID!
  const clientSecret = process.env.AZURE_CLIENT_SECRET!
  const tenantId = process.env.AZURE_TENANT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback`

  try {
    // swap the code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'User.Read Calendars.Read Calendars.Read.Shared Notes.Read Notes.Read.All offline_access',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('Token exchange failed:', err)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/meeting?msError=token_failed`
      )
    }

    const tokens = await tokenRes.json()

    // store tokens via service role to bypass RLS
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: upsertError } = await supabaseAdmin
      .from('microsoft_tokens')
      .upsert({
        user_id: state,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertError) {
      console.error('Token storage failed:', upsertError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/meeting?msError=storage_failed`
      )
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/meeting?msConnected=true`
    )
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/meeting?msError=unknown`
    )
  }
}
