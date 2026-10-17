import { apiFetch, idFrom, toJobCard, type ApiJob, type JobCard } from "../helpers.ts"

/** Lấy chi tiết một tin theo mã số hoặc URL `/candidate/jobs/<id>/...`. */
export async function detail(target: string): Promise<JobCard | null> {
  const id = idFrom(target)
  if (!id) return null

  const response = await apiFetch<ApiJob>(`/jobs/detail/${id}`)
  return response ? toJobCard(response.data) : null
}
