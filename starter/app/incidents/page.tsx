import DemoDashboard from "./demo-dashboard"
import { DatasetDashboard } from "./dataset-dashboard"
export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  return params.view === "workspace" ? <DemoDashboard /> : <DatasetDashboard initial={Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"))} />
}
