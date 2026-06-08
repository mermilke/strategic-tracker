import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '../../../../lib/auth'

export async function GET() {
  // Bind the OAuth flow to the validated session. The user comes from the
  // session, never from the query string, and we set a random state nonce in an
  // HttpOnly cookie that the callback must echo back. Without this, anyone could
  // start the flow with a victim's id and land their own Microsoft tokens on
  // that account (token fixation).
  const auth = await getAuthenticatedUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = process.env.AZURE_CLIENT_ID!
  const tenantId = process.env.AZURE_TENANT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback`

  const scope = 'User.Read Calendars.Read Calendars.Read.Shared Notes.Read Notes.Read.All offline_access'

  const state = crypto.randomUUID()

  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scope)
  authUrl.searchParams.set('response_mode', 'query')
  authUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authUrl.toString())
  // SameSite=Lax so the cookie survives Microsoft's top-level redirect back here.
  res.cookies.set('ms_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
