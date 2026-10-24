import { DatasetIncident } from "../../dataset-incident"
export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) { return <DatasetIncident id={(await params).id} /> }
export const maxDuration = 130
