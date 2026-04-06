## Testing the Pre-release EXE

Developers can download the latest Windows test build from the repository's **Releases** section and run it directly.

### Steps
1. Go to **Releases**
2. Download the latest pre-release `.exe`
3. Run the executable
4. If Windows shows a warning, click **More info** → **Run anyway**

### What to test
- App launches successfully
- Backend starts automatically
- Focus sessions work
- GrowIn itself is allowed during focus mode
- Website tracking works in the packaged version
- Whitelist behavior works as expected

### Notes
- This build is for Windows
- The executable is unsigned, so Windows may show an "Unknown publisher" warning
- If website tracking does not work on your machine, please report it
