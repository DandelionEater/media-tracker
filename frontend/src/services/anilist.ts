export async function searchMedia(
  query: string,
  hideAdultContent = true,
  options?: { signal?: AbortSignal }
) {
  return await window.api.searchMedia(query, hideAdultContent, options);
}
