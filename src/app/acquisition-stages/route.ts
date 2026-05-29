import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
  const filePath = path.join(process.cwd(), 'public', 'acquisition-stages-design.html')
  const html = fs.readFileSync(filePath, 'utf-8')
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
