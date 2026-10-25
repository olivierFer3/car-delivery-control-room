"use server"

import { cookies } from "next/headers"
import type { Command, PublicIncident, Scenario } from "@/lib/incidents/contracts"
import { createIncident, WorkflowError } from "@/lib/incidents/engine"
import { commandIncidentService, createLiveIncident, createOperationalIncident } from "@/lib/incidents/service"
import { publicIncident } from "@/lib/incidents/http"
import { insertOrGetIncident, toolsData } from "@/lib/incidents/store"
import { issueSession, OPERATOR_COOKIE, tokenMatches, validSession } from "@/lib/incidents/operator-session"
import { driverCode } from "@/lib/driver/access"

type Result = { incident?: PublicIncident; error?: string }
export async function unlockOperator(token: string): Promise<{ error?: string }> {
  const secret = process.env.INCIDENT_OPERATOR_TOKEN
  if (!secret) return { error: "Operator access is not configured on this server." }
  if (!tokenMatches(token, secret)) return { error: "Incorrect operator token." }
  const jar = await cookies()
  jar.set(OPERATOR_COOKIE, issueSession(secret), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 })
  return {}
}
export async function operatorAccess(): Promise<boolean> {
  return validSession((await cookies()).get(OPERATOR_COOKIE)?.value, process.env.INCIDENT_OPERATOR_TOKEN)
}
export async function lockOperator(): Promise<void> { (await cookies()).delete(OPERATOR_COOKIE) }
async function requireOperator() {
  if (!await operatorAccess()) throw new WorkflowError("Unlock operator access before making a decision.")
}
function failure(error: unknown): Result {
  return { error: error instanceof WorkflowError ? error.message : "Could not save this change. Check the database connection, then refresh before retrying." }
}
export async function createDemoIncident(): Promise<Result> {
  try {
    await requireOperator()
    const orderId = "ord-00603", signalId = "alert-x5259ff7f2e03f0e6"
    const context = await toolsData.context(orderId)
    if (!context?.alerts.some(a => a.id === signalId)) throw new WorkflowError("The ferry demo order is unavailable. Load the challenge snapshot first.")
    return { incident: publicIncident(await insertOrGetIncident(createIncident(orderId, signalId, "delay"))) }
  } catch (error) { return failure(error) }
}
export async function commandIncident(id: string, command: Command): Promise<Result> {
  try {
    await requireOperator()
    if (typeof id !== "string" || !id || id.length > 100 || !command || typeof command !== "object") throw new WorkflowError("Invalid incident command")
    const incident = await commandIncidentService(id,{...command,...(command.command === "decide" ? {operator:"demo-operator"} : {})} as Command)
    return { incident: publicIncident(incident) }
  } catch (error) { return failure(error) }
}

export async function createAgentIncident(scenario: Scenario, provider: "groq" | "gemini"): Promise<Result> {
  try { await requireOperator(); return {incident:publicIncident(await createLiveIncident(scenario,provider))} } catch(error) { return failure(error) }
}

export async function openOrderInvestigation(orderId:string,signalId:string,provider?:string):Promise<Result>{
  try{await requireOperator();return {incident:publicIncident(await createOperationalIncident(orderId,signalId,provider))}}catch(error){return failure(error)}
}

/** The Driver Support link carries a code derived from the operator token; only an unlocked operator can see it. */
export async function driverAccess(): Promise<{ code?: string; error?: string }> {
  if (!await operatorAccess()) return { error: "Unlock operator access to show the Driver Support link." }
  const code = driverCode()
  return code ? { code } : { error: "Operator access is not configured on this server." }
}
