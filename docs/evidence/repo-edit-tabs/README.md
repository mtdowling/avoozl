# Repository Edit: every setting on a tab

Shots of Settings › Repository setup › Edit on `recipe-box`, in the full app
shell on fake data (`?page=app&roles=plans`), desktop 1280 px and phone
390 px, light and dark, with Kiro Crew's own stylesheet.

- `before/`: Role sits above the settings, outside any tab, and the settings
  have their own small segmented control (Mode and branch, Triggers and
  labels, Checks, Reviews, Workflow map). The private mirror box sits under
  Mode and branch.
- `after/`: one shared tab bar (General, Landing, GitHub, Mirror, Workflow
  map) holds everything. Only the title, the tab bar, the open tab and the
  footer's one Cancel and Save are in the dialog.
  - `general-*`: role, folder, the GitHub repository name and who codes.
  - `landing-*`: default branch, Release N, required checks, pull-request
    reviews and reviewer chats.
  - `github-*`: cache seconds, label rules, managed labels, Untriaged, who
    counts and priority.
  - `mirror-*`: Set up mirror, then this repository's own mirror settings.
  - `mirror-role-*`: after Set up mirror. General shows the unsaved dot, and
    Mirror shows a red dot until the public repository is named.
  - `map-*`: the Workflow map.

Merge method and landing mode are on Settings › Issue Radar and the
repository registry, not in this dialog, so Landing does not show them.

To make them again:

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/repo-edit-tabs-shots.mjs <out dir>
