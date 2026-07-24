# How to sync the design system (no coding required)

This updates the live docs site with the latest components (and tokens) from
Figma. It runs in the browser — you don't need to install anything.

## Refresh components from Figma

1. Go to the **iqm-ds-sync** repository on GitHub:
   https://github.com/bhaveshvasava/iqm-ds-sync
2. Click the **Actions** tab (top of the page).
3. In the left list, click **Sync Design System**.
4. Click the **Run workflow** button on the right, then **Run workflow** again
   to confirm.
5. Wait about a minute. When the row shows a green ✓, it's done.
6. Open the docs site to see the update — it rebuilds automatically:
   https://bhaveshvasava.github.io/iqm-ds-docs

That's it. The sync pulls the current components from Figma, saves them, and
tells the docs site to rebuild itself.

## Update tokens (colors, spacing, etc.)

1. In Figma, run the token-export plugin and copy the JSON it produces.
2. Go to **Actions -> Import Tokens -> Run workflow**.
3. Paste the JSON into the **tokens** box and click **Run workflow**.
4. Wait about a minute for the green ✓, then check the docs site as above.

## Good to know

- **Who can run this:** only people with write access to the repository see the
  "Run workflow" button. Viewers cannot trigger a sync.
- **If a run fails (red ✗):** click the run to see the message. The most common
  cause is an expired Figma token — see "Secrets" below.
- **Secrets (one-time setup, done by an admin):** under
  *Settings -> Secrets and variables -> Actions*, three secrets must exist:
  `FIGMA_PAT` and `FIGMA_FILE_KEY` (to read Figma) and `DOCS_DISPATCH_TOKEN`
  (to tell the docs site to rebuild). These are never written in the code.
- **Nothing to undo:** each sync just records a new snapshot; it doesn't delete
  history.
