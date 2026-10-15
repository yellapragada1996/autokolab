import { useEffect, useState } from "react";
import { ticketRecord, type Ticket } from "../lib/data";
import { reportError } from "../lib/errors";

/** Detail views read one full ticket, independently of agent presence updates. */
export function useFullTicket(listed: Ticket | undefined, demo = false) {
  const [loaded, setLoaded] = useState<{ source: Ticket; ticket: Ticket } | null>(null);
  const [error, setError] = useState("");
  const complete = demo || listed?.description !== undefined;
  useEffect(() => {
    setError("");
    if (!listed || complete) return;
    let live = true;
    void ticketRecord(listed.id)
      .then((ticket) => { if (live) setLoaded({ source: listed, ticket }); })
      .catch((e) => { if (live) setError(reportError(e, "load the ticket")); });
    return () => { live = false; };
  }, [listed, complete]);
  return {
    ticket: complete ? listed : loaded && loaded.source === listed ? loaded.ticket : listed,
    loading: !!listed && !complete && loaded?.source !== listed,
    error,
  };
}
