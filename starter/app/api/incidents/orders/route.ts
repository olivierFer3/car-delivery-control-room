import { NextResponse } from 'next/server'
import { operationalOrders } from '@/lib/incidents/store'
export const runtime='nodejs'
export async function GET(){try{return NextResponse.json({orders:await operationalOrders(),simulationTime:'2026-10-21T09:00:00Z'})}catch{return NextResponse.json({error:'Order or incident storage unavailable; no safety conclusion was made'},{status:503})}}
