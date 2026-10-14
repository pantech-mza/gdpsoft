import { refreshStoredSession } from "../client/session";

export async function treeApiFetch(url, options = {}) {
  let token = sessionStorage.getItem("gdpsoft_access_token") || await refreshStoredSession();
  const run = (access) => fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${access}` },
  });
  let response = await run(token);
  if (response.status === 401) response = await run(await refreshStoredSession());
  return response;
}
