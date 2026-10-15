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
  const freshFields = Object.fromEntries(Object.entries(listed).filter(([, value]) => value !== undefined));
  return { ticket: { ...loaded.ticket, ...freshFields } as Ticket, loading: false };
}

/** Detail views read one full ticket, independently of agent presence updates. */
export function useFullTicket(listed: Ticket | undefined, demo = false) {
  const [loaded, setLoaded] = useState<LoadedTicket | null>(null);
  const [error, setError] = useState<{ id: string; updatedAt: string; message: string } | null>(null);
  const complete = demo || listed?.description !== undefined;
  const id = listed?.id;
  const updatedAt = listed?.updated_at;
  useEffect(() => {
    if (!needsFullTicket(listed, loaded, complete)) return;
    let live = true;
    void ticketRecord(id!)
      .then((ticket) => {
        if (live) {
          setLoaded({ id: id!, updatedAt: updatedAt!, ticket });
          setError(null);
        }
      })
      .catch((e) => { if (live) setError({ id: id!, updatedAt: updatedAt!, message: reportError(e, "load the ticket") }); });
    return () => { live = false; };
  }, [id, updatedAt, complete, loaded]);
  const view = fullTicketView(listed, loaded, complete);
  return {
    ...view,
    error: view.loading && error && error.id === id && error.updatedAt === updatedAt ? error.message : "",
  };
}
