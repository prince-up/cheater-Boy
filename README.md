# CheaterBoy

AI Study Assistant is a modern, lightweight desktop application built to assist students and programmers. It securely captures your screen (or a specific region), automatically extracts text using offline OCR, and uses Google's Gemini AI to provide instant explanations, solutions, and code reviews.

## 🚀 Tech Stack
- **Desktop Environment:** Electron
- **Frontend Framework:** React + Vite
- **Styling:** TailwindCSS
- **AI Integration:** Google Gemini 1.5 Flash API (via native REST fetch)
- **Local OCR:** Tesseract.js
- **UI Components:** Lucide-React (Icons), React-Markdown & React-Syntax-Highlighter (Code Formatting)

## ✨ Core Features
- **Region Capture (Snipping Tool Style):** Press `F4` to draw a box around any code snippet or question on your screen.
- **Full Screen Capture:** Press `F1` to instantly capture your entire primary display.
- **Auto Text Extraction:** Uses Tesseract.js to automatically scan your screenshot and extract the text offline.
- **Auto-Ask AI Mode:** When enabled in settings, capturing the screen will automatically trigger the AI without needing extra clicks.
- **Global Hotkeys:** `F1`, `F3`, and `F4` work globally across your entire OS, even if the app is minimized. `F2` toggles the app's visibility (Boss Key).
- **Premium UI:** Beautiful dark theme, window opacity slider, always-on-top toggle, and perfectly formatted markdown/syntax-highlighted code responses.

## ⚙️ Installation & Setup

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine. You will also need a free [Gemini API Key](https://aistudio.google.com/).

### Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/prince-up/cheater-Boy.git
   cd cheater-Boy
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the application. You need two terminal windows:
   - **Terminal 1 (React Frontend):**
     ```bash
     npm run dev
     ```
   - **Terminal 2 (Electron Backend):**
     ```bash
     npm run electron:start
     ```

### Building the Executable (.exe)
To package the app into a standalone Windows installer:
```bash
npm run dist
```
Once the build is complete, you will find the installer file inside the `release/` folder.

## ⌨️ Shortcuts Reference
- **F1:** Capture Full Screen
- **F4:** Capture Specific Region
- **F3:** Ask AI manually
- **F2:** Toggle Window Visibility (Hide/Show)
