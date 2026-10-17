import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { go, href, type Route } from "../../lib/router";

/** Keep native links (including new tabs) and the existing SPA navigation. */
export function OverviewLink({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: Route | string }) {
  const url = typeof to === "string" ? to : href(to);
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    go(url);
  };
  return <a {...props} href={url} onClick={navigate}>{children}</a>;
}
