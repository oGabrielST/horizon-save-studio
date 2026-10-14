# Horizon 2 Save Editor

A clean, browser-based editor for credits and wheelspins in Forza Horizon 2 Azimuth saves.

## Use

1. Open the site in Chrome or Edge.
2. Select the extracted `player-1` folder from your Azimuth backup.
3. Set credits and wheelspins, then select **Export edited save**.
4. The browser downloads `forza-horizon-2-save-editado.zip`. Extract it to get the edited `player-1` folder.
5. Close Azimuth and the game. Back up the active folder, then replace `data/titles/1A96545B/saves/player-1` with the edited folder. Editing a `data/saves-backup-*` folder alone does not change the save loaded by the game.

The site is static. Your save is read and edited in your browser; it is never uploaded to a server.

## Supported format

The editor finds the latest revision under `User_*/revisions/*` containing `ProfileData`, `SaveState`, and its `commit` manifest. It updates `Credits` and `TombolaState/Spins`, recalculates SHA-256 hashes and file sizes in the manifest, and preserves the other backup files.

## Development

There is no build step or runtime dependency. Serve this folder with any static web server; Chrome or Edge is recommended for directory selection.

## Deployment

The GitHub Actions workflow at `.github/workflows/pages.yml` publishes this repository to GitHub Pages. Enable Pages in **Settings → Pages** and choose **GitHub Actions** as the source. GitHub Pages is available for public repositories on GitHub Free.

