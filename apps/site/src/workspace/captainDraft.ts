/** A first-ticket request is a draft: the person still chooses when to send it. */
export const CAPTAIN_DRAFT_EVENT = "autokolab-captain-draft";
export const captainDraftKey = (projectId: string) => `autokolab.captainDraft.${projectId}`;
export function offerCaptainDraft(projectId: string, text: string) {
  sessionStorage.setItem(captainDraftKey(projectId), text);
  window.dispatchEvent(new CustomEvent(CAPTAIN_DRAFT_EVENT, { detail: { projectId, text } }));
}
