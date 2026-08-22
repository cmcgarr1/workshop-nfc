// Thin wrapper over fetch() for our own /api/* routes. There is no login
// anymore (the backend moved into project_db and is service-role-only, same
// posture as that app), so this no longer attaches a bearer token.
export async function apiFetch(url, options = {}) {
  return fetch(url, options)
}
