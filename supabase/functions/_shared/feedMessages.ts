// What to tell a person about a calendar address that didn't work. Shared by the signed-in check
// (validate-source) and the signed-out preview (preview-source), so both say the same thing.
export const FEED_MESSAGES: Record<string, string> = {
  not_a_url: "That isn't a web address. Paste the whole link, starting with https:// or webcal://.",
  truncated: 'The address is cut off (it ends in "…"). Copy it again from the page, not from a preview.',
  not_https: 'The address has to start with https:// or webcal://.',
  private_host: "That address points inside a private network, so Runway can't reach it.",
  redirect: "That address sends Runway somewhere it won't follow. Copy the calendar's own address.",
  html: 'That address returns a web page, not a calendar. For Google, use the secret address in iCal format (it ends in basic.ics), not the embed link.',
  not_calendar: "That address doesn't return a calendar file.",
  http_404:
    'Nothing was found at that address (HTTP 404). For Google, the public address only works when the calendar is public; use the secret one.',
  http_401: 'The calendar refused the request. Try copying the address again.',
  too_large: 'That feed is larger than 5 MB.',
  timeout: "The calendar's server didn't answer in 15 seconds. Try again in a minute.",
  empty: 'The feed is valid but has no events in the next six months.',
};
