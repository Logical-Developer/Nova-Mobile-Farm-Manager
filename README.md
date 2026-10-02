# Nova-Mobile-Farm-Manager

Nova Mobile Farm Manager

# Script URL:

```text
https://github.com/Logical-Developer/Nova-Mobile-Farm-Manager/raw/refs/heads/main/Nova-FarmManager-Mobile.user.js
```

## Current mobile scope

- Mobile-only scope.
- Multiple lists per village.
- Separate resume state for each list.
- List rename and delete supported in the rally panel.
- Remove-from-list support on the map popup.
- Bulk add/remove import from copied text is supported by the script core.

## Version

- v2.0.0

## Development Plan

1. Fix troop input sizing and place the map manager below `#map_details`, after its `.clear` element.
2. Keep paused runs separately for each village and list, while allowing only one active raid at a time.
3. Add visible list rename/delete actions and create a backup before destructive changes.
4. Support direct Add/Remove imports into a selected list, skipping duplicate coordinates.
5. Add or edit a map target in the selected list, or remove it from that list only.

Run state stays in `sessionStorage` to preserve the existing lifecycle; it is scoped to the current browser tab.

## Verification

- Check userscript syntax with `node --check`.
- Test two paused lists in one village and resume each independently.
- Test Import Add/Remove and map removal against one list while confirming other lists stay unchanged.
- Check the map popup placement and three-digit troop fields on a mobile viewport.
