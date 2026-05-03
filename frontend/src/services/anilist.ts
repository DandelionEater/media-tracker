export async function searchAnime(query: string, hideAdultContent = true) {
  return await window.api.searchAnime(query, hideAdultContent);
}
