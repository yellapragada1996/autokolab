import { useEffect, useState } from "react";
import { ticketRecord, type Ticket } from "../lib/data";
import { reportError } from "../lib/errors";

/** Keep the open record mounted while its own revision refreshes in the background. */
export function useFullTicket(listed: Ticket | undefined, demo = false) {
  const [loaded, setLoaded] = useState<Ticket | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const id = listed?.id;
  const updatedAt = listed?.updated_at;
  const complete = demo || listed?.description !== undefined;
  useEffect(() => {
    setFailure(null);
    if (!id || complete) return;
    let live = true;
    void ticketRecord(id)
      .then((ticket) => { if (live) setLoaded(ticket); })
      .catch((e) => { if (live) setFailure({ id, message: reportError(e, "load the ticket") }); });
    return () => { live = false; };
  }, [id, updatedAt, complete]);
  const cached = loaded?.id === id ? loaded : null;
  return {
    ticket: complete ? listed : cached ?? listed,
    loading: !!listed && !complete && !cached,
    error: failure && failure.id === id ? failure.message : "",
  };
}
