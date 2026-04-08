import { NextResponse } from 'next/server'
import { syncAll } from '@/lib/sharepoint-sync'

export async function POST() {
  try {
    const results = await syncAll()
    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const results = await syncAll()
    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
