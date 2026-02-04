# QWERTY Quest 🚀

**QWERTY Quest** is a modern, competitive multiplayer typing racing game designed to help users improve their typing speed and accuracy while competing with friends and players worldwide. Built with the MERN stack and powered by real-time WebSocket technology.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-Active-green.svg)

## ✨ Features

*   **🏎️ Real-time Multiplayer Races:** Compete head-to-head with other players in live typing battles using Socket.io.
*   **🧘 Solo Practice Mode:** Hone your skills with adjustable difficulty levels (Easy, Medium, Hard) and custom timers.
*   **📊 Comprehensive Dashboard:** Track your progress with detailed statistics including WPM (Words Per Minute), Accuracy, and Race History.
*   **🔐 Advanced Security:**
    *   **Passwordless Login:** Support for Biometric/Hardware Passkeys (WebAuthn).
    *   **Multi-Factor Authentication (MFA):** Secure your account with TOTP (Authenticator Apps).
    *   **Social Login:** Seamless sign-in with Google, GitHub, and Discord.
    *   **Magic Links:** Email-based one-click login.
*   **🎨 Modern UI:** A responsive, dark-themed interface built with Tailwind CSS and smooth animations using Framer Motion.
*   **👤 Customization:** Unlock and select unique user avatars.

## 🛠️ Tech Stack

### Frontend (`typemaster-client`)
*   **Framework:** React 19 (Vite)
*   **Styling:** Tailwind CSS
*   **Animations:** Framer Motion
*   **Real-time:** Socket.io Client
*   **Icons:** Lucide React

### Backend (`typemaster-server`)
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Database:** MongoDB (Mongoose)
*   **Real-time:** Socket.io
*   **Authentication:** Passport.js, JSON Web Tokens (JWT), SimpleWebAuthn, Speakeasy (MFA)

## ⚙️ Prerequisites

Before running the project, ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   [MongoDB](https://www.mongodb.com/) (Local instance or Atlas URI)

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/Asclepius-crown/QWERTY-Quest.git
cd QWERTY-Quest
```

### 2. Backend Setup
Navigate to the server directory and install dependencies:
```bash
cd typemaster-server
npm install
```

Create a `.env` file in `typemaster-server/` with the following variables:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/typemaster
JWT_SECRET=your_super_secret_jwt_key
CLIENT_URL=http://localhost:5173

# OAuth (Optional for local dev)
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
GITHUB_CLIENT_ID=your_github_id
GITHUB_CLIENT_SECRET=your_github_secret
DISCORD_CLIENT_ID=your_discord_id
DISCORD_CLIENT_SECRET=your_discord_secret

# Email Service (For Magic Links)
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_specific_password

# WebAuthn
RP_ID=localhost
ORIGIN=http://localhost:5173
```

Start the server:
```bash
npm run dev
```

### 3. Frontend Setup
Open a new terminal, navigate to the client directory, and install dependencies:
```bash
cd typemaster-client
npm install
```

Create a `.env` file in `typemaster-client/` (if it doesn't exist):
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Start the client:
```bash
npm run dev
```

Visit `http://localhost:5173` in your browser to start playing!

## 📂 Project Structure

```
QWERTY Quest/
├── typemaster-client/      # React Frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React Context (Auth)
│   │   ├── pages/          # Main application pages
│   │   └── ...
│   └── ...
└── typemaster-server/      # Express Backend
    ├── middleware/         # Auth & validation middleware
    ├── models/             # Mongoose schemas
    ├── routes/             # API endpoints
    └── server.js           # Entry point & Socket.io setup
```

## © Copyright

**© 2026 QWERTY Quest. All rights reserved.**

Created by **Amit Raj**.

This project is licensed under the MIT License - see the LICENSE file for details.
Unauthorized copying of this file, via any medium is strictly prohibited without express permission from the author.
