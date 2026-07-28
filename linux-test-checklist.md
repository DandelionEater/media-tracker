# Seenary Linux first-test checklist

## Build in GitHub Actions

Pushing the `linux-port` branch starts **Build Linux test artifact** automatically. A completed
or failed run can be rerun from the repository's **Actions** page. Once this workflow also exists
on the default branch, GitHub will expose its separate manual **Run workflow** control.

When the run finishes:

1. Open the workflow run.
2. Download the `seenary-linux-test-...` artifact.
3. Extract the downloaded ZIP on the Linux laptop.
4. Optionally run `sha256sum -c SHA256SUMS` inside the extracted directory.

The artifact includes an AppImage and a permission-preserving `tar.gz` fallback. Make the AppImage
executable and launch it from a terminal so diagnostic output remains visible:

```bash
chmod +x Seenary-<version>.AppImage
./Seenary-<version>.AppImage
```

If AppImage/FUSE is unavailable, extract and run the fallback:

```bash
tar -xzf Seenary-<version>-linux-unpacked.tar.gz
./linux-unpacked/seenary
```

The laptop does not need Node.js, npm, Git, compilers, or a source checkout.

## Optional local Linux build

Developers who already have Node.js installed can still run `npm ci` in `frontend` and `backend`,
then run `npm run dist:linux` from `backend`.

## Record the environment

In Seenary, open **Settings → General → About Seenary** and confirm that the desktop and display system are correct.

Also record:

```bash
echo "$XDG_SESSION_TYPE"
echo "$XDG_CURRENT_DESKTOP"
plasmashell --version
```

## KDE Plasma Wayland checks

- Seenary opens without a blank or transparent window.
- Corners, shadows, and the transparent outer area render correctly.
- The custom title area drags the window.
- Every window edge and corner can be resized manually.
- Compact, Balanced, Cinematic, and custom live sizes either apply or show an honest compositor rejection.
- Manual size survives closing and reopening Seenary.
- Window placement is left to KWin and does not jump to a stored coordinate.
- The default global shortcut registers, including any KDE portal prompt.
- Rebinding, disabling, and re-enabling the shortcut behave correctly.
- The shortcut hides Seenary and shows it again.
- Search receives focus when KWin grants activation.
- The tray icon appears and its Show / Hide, Gaming mode, and Exit actions work.
- A second launch reveals the existing window instead of opening another instance.
- External links and account authorization open in the default browser.
- Fractional display scaling does not blur content or break resize edges.
- No automatic-update error appears in this first Linux test build.
- Launch at login is visible but clearly marked unavailable.
- Settings changes from `linux-port` are present even though the hosted frontend was not deployed.

## Useful failure report

For each failure, include:

- The checklist item.
- What happened and what was expected.
- Whether the unpacked build and AppImage behave the same way.
- A screenshot for visual issues.
- Terminal output from the launch.
- Desktop and display-system values shown in Seenary.
