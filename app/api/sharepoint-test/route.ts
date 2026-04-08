import { NextResponse } from 'next/server'

const TENANT_ID = process.env.MICROSOFT_TENANT_ID!
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!
const SITE_ID = process.env.SHAREPOINT_SITE_ID!

async function getToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await res.json()
  return data
}

export async function GET() {
  try {
    const tokenData = await getToken()
    
    if (!tokenData.access_token) {
      return NextResponse.json({ 
        error: 'No token', 
        details: tokenData,
        env: {
          hasTenant: !!TENANT_ID,
          hasClient: !!CLIENT_ID,
          hasSecret: !!CLIENT_SECRET,
          hasSiteId: !!SITE_ID,
          siteId: SITE_ID?.slice(0, 30) + '...'
        }
      })
    }

    const token = tokenData.access_token

    const rootRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root/children`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const rootData = await rootRes.json()

    return NextResponse.json({ 
      tokenOk: true,
      rootData,
      siteId: SITE_ID?.slice(0, 40)
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
