import { NextResponse } from "next/server"
import { providerStatus } from "@/lib/incidents/providers"
export const runtime = "nodejs"
export async function GET() { return NextResponse.json({providers:providerStatus()}) }
