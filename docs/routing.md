# Workspace Routing

The workspace UI now syncs the active surface to the URL so deep links can target specific tabs directly.

## Routes

- `/workspace/timeline` – default landing view, renders the project timeline.
- `/workspace/change-orders` – shows the change order management surface.
- `/workspace/account` – opens account settings.

Unknown tab paths automatically redirect back to `/workspace/timeline` to prevent broken states.

## Project selection

Choosing a project in the sidebar keeps the current tab intact; the path remains on whichever `/workspace/:tab` route you are viewing while the context updates the selected project.

## Implementation Notes

- `App.tsx` registers a `BrowserRouter` and delegates to `WorkspaceRouter` for tab routes.
- `WorkspaceRoot` reads the `:tab` URL param, normalises it to internal tab keys, and pushes navigation updates when users switch tabs.
- The `WorkspaceLayout` retains button-based tab UI so existing keyboard and screen reader flows are unchanged.

## Testing

Manual smoke steps:

1. Visit `/workspace/timeline` after signing in – verify the timeline renders and the `Timeline` tab is marked active.
2. Switch to `Change Orders`; confirm the URL becomes `/workspace/change-orders` and a browser refresh keeps you on the same view.
3. Enter `/workspace/unknown` – confirm you are redirected to `/workspace/timeline`.
