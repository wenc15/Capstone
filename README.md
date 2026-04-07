# 🌱 GrowIn(Windows System Only)

GrowIn is a gamified productivity desktop application designed to help users stay focused while making study or work sessions more engaging and rewarding. Instead of treating focus as a repetitive task, GrowIn combines a timer-based focus system with interactive features such as rewards, progress tracking, and whitelist-based distraction control.

<img width="1072" height="888" alt="image" src="https://github.com/user-attachments/assets/b7f1037c-3be9-470b-b7c8-694b4b72cf2c" />

## 🧩 Features

- Focus session timer
- Whitelist support for allowed apps and websites
- Website and application usage tracking
- Gamified productivity experience
- Desktop app with integrated backend
- Chrome extension support for browser-related features

## 🛠️Tech Stack

### Frontend
- Electron
- HTML
- CSS
- JavaScript

### Backend
- ASP.NET Core
- C#

### Database
- SQLite

### Browser Extension
- Chrome Extension
- JavaScript
- HTML

## 🔌Communication / APIs

GrowIn uses multiple communication methods between different parts of the system:

- **REST API**  
  Used for communication between the Electron frontend, Chrome extension, and ASP.NET Core backend for actions such as usage reporting, focus session updates, and data retrieval.

- **WebSocket**  
  Used for real-time communication when browser activity or other events need to be sent quickly between components.

- **Local backend service**  
  The packaged desktop app starts a local ASP.NET Core backend and communicates through `http://localhost:5024`.

## 🖥️ Project Structure

- `src/` - ASP.NET Core backend source code
- `ui/` - Electron frontend source code

## ⬇️ Download the EXE Version

1. Go to the repository's **Releases** page.
2. Download the latest Windows build, such as:
   - `GrowIn.exe`
3. Double-click the `.exe` file to launch the app.

### If Windows Shows a Security Warning
Because the executable is unsigned, Windows may display a warning such as:
- "Windows protected your PC"
- "Unknown publisher"

If that happens:
1. Click **More info**
2. Click **Run anyway**


## Core Features

### 1. Focus Sessions 🎯
GrowIn helps users stay productive through customizable focus sessions. Users can set their own focus duration based on their personal study or work habits, making the app flexible for different routines.

### 2. Whitelist Management 📊
Users can browse, manage, and customize their own whitelist for apps and websites. This allows them to control which tools remain accessible during a focus session and reduce unnecessary distractions.

### 3. Progress Tracking and Achievements 🏆
GrowIn includes statistics and achievement features that help users track their productivity over time. These features are designed to encourage long-term improvement by giving users a clearer view of their progress and milestones.

### 4. Gamified Reward System ✨
To make productivity more engaging, GrowIn includes gamified reward mechanics. After completing focus sessions, users earn credits that can be used in the app’s gacha system.

### 5. Food and Skin Gacha 🎁
Users can spend earned credits on food and skin gacha features. These collectible rewards add an element of fun and motivation to the focus experience.

### 6. Pet Interaction 🐾
Users can use the food they collect to feed their pets in the app. This creates a stronger sense of progress and gives users an additional reason to stay consistent with their focus sessions.

### 7. Minigames During Break Time 🎮
GrowIn also includes minigames that users can enjoy during rest periods after completing focus sessions. This helps make breaks more enjoyable while keeping the overall experience connected to the productivity system.

For most users, no additional dependency installation is required to run the packaged `.exe`.

## Download and Use the Chrome Extension

The Chrome extension is only needed if you want to test the extension UI or browser-related features directly.

### Steps
1. Go to the repository's **Releases** page.
2. Download the extension package, such as:
   - `growin-extension.zip`
3. Extract the zip file to a folder on your computer.
4. Open Chrome and go to:

`chrome://extensions`

5. Turn on **Developer mode** in the top right.
6. Click **Load unpacked**.
7. Select the extracted extension folder.

The extension folder should contain files such as:
- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.js`

After loading it, the GrowIn extension should appear in your Chrome extensions list. You can click the extension icon in Chrome to open its UI.

### Notes
- You must extract the zip file before loading it.
- Make sure you select the folder that contains `manifest.json`.
- The extension is optional for general desktop app testing.

## Running From Source

### Backend
bash
- cd src
- dotnet run


## Local Development and Testing

For users or TAs who would like to test the project locally from source code, please refer to the README files inside each subfolder:

- `src/README.md` — backend running instructions
- `ui/README.md` — frontend running instructions
