import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const supabaseUserId = searchParams.get('userId')

  if (!supabaseUserId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const clientId = process.env.AZURE_CLIENT_ID!
  const tenantId = process.env.AZURE_TENANT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback`

  const scope = 'User.Read Calendars.Read Calendars.Read.Shared Notes.Read Notes.Read.All offline_access'

  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scope)
  authUrl.searchParams.set('response_mode', 'query')
  authUrl.searchParams.set('state', supabaseUserId)

  return NextResponse.redirect(authUrl.toString())
}
