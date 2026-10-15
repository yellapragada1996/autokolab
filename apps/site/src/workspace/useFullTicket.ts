import { useEffect, useState } from "react";
import { ticketRecord, type Ticket } from "../lib/data";
import { reportError } from "../lib/errors";

type LoadedTicket = { id: string; updatedAt: string; ticket: Ticket };

export function needsFullTicket(listed: Ticket | undefined, loaded: LoadedTicket | null, complete: boolean) {
  return !!listed && !complete && (loaded?.id !== listed.id || loaded.updatedAt !== listed.updated_at);
}

/** A list refresh keeps the full fields and the mounted detail view for the same ticket. */
export function fullTicketView(listed: Ticket | undefined, loaded: LoadedTicket | null, complete: boolean) {
  if (!listed) return { ticket: undefined, loading: false };
  if (complete) return { ticket: listed, loading: false };
  if (!loaded || loaded.id !== listed.id) return { ticket: listed, loading: true };
  if (loaded.updatedAt === listed.updated_at) return { ticket: loaded.ticket, loading: false };
  const freshFields = Object.fromEntries(Object.entries(listed).filter(([, value]) => value !== undefined));
  return { ticket: { ...loaded.ticket, ...freshFields } as Ticket, loading: false };
}

/** Keep the open record mounted while its own revision refreshes in the background. */
export function useFullTicket(listed: Ticket | undefined, demo = false) {
  const [loaded, setLoaded] = useState<LoadedTicket | null>(null);
  const [failure, setFailure] = useState<{ id: string; updatedAt: string | undefined; message: string } | null>(null);
  const id = listed?.id;
  const updatedAt = listed?.updated_at;
  const complete = demo || listed?.description !== undefined;
  useEffect(() => {
    setFailure(null);
    if (!id || !needsFullTicket(listed, loaded, complete)) return;
    let live = true;
    void ticketRecord(id)
      .then((ticket) => { if (live) setLoaded({ id, updatedAt: updatedAt!, ticket }); })
      .catch((e) => { if (live) setFailure({ id, updatedAt, message: reportError(e, "load the ticket") }); });
    return () => { live = false; };
    // New list objects alone do not change the full record’s revision.
  }, [id, updatedAt, complete]);
  const view = fullTicketView(listed, loaded, complete);
  return {
    ...view,
    error: failure && failure.id === id && failure.updatedAt === updatedAt ? failure.message : "",
  };
}
