import { NextResponse } from "next/server"
import { deny, fail } from "@/lib/driver/http"
import { driverOrders } from "@/lib/driver/orders"
export const runtime = "nodejs"
export async function GET(request: Request) {
  const no = deny(request); if (no) return no
  try { return NextResponse.json({ orders: await driverOrders() }) } catch (e) { return fail(e) }
}
