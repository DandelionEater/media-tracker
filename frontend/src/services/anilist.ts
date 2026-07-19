export async function searchMedia(query: string, hideAdultContent = true) {
  return await window.api.searchMedia(query, hideAdultContent);
}
