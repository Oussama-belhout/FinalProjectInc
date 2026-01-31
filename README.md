# 🎛️ Web Audio Sampler & Preset Manager

A full-stack web application combining a creative musical sampler with a robust administration dashboard. This project demonstrates modern web technologies including **Angular**, **Node.js**, **Express**, and **MongoDB**.

## 🚀 Project Overview

This project consists of three main distinct parts interacting together:

1.  **The Sampler (Front-End 1):** A creative musical interface allowing users to play sounds, load distinct presets, and visualize audio playback.
2.  **The Administration Dashboard (Front-End 2):** A secured Angular application to manage the database of presets and sounds.
3.  **The API Server (Back-End):** A Node.js/Express REST API connecting the interfaces to a cloud MongoDB database and handling file storage.

## ✨ Features

### 🎧 The Sampler
* **Dynamic Preset Loading:** Fetches available presets dynamically from the server.
* **Real-time Audio:** Low-latency playback using the Web Audio API.
* **Visual Feedback:** Interactive UI that responds to user input and playback state.
* **Headless Mode:** Includes a `headless-demo.html` for testing audio engine logic without the GUI (as per requirements).

### ⚙️ Administration (Angular App)
* **Authentication:** Secure Login/Logout functionality using **JWT (JSON Web Tokens)**.
* **CRUD Operations:** Full capability to **C**reate, **R**ead, **U**pdate, and **D**elete presets.
* **File Upload:** *[OPTIONAL FEATURE]* Integrated file upload system allowing users to upload custom MP3 samples directly to the server, rather than just using URLs.
* **Reactive Interface:** Uses Angular's reactive forms and routing for a smooth single-page application (SPA) experience.

### 🔌 Back-End (Node.js API)
* **MongoDB Persistence:** *[OPTIONAL FEATURE]* All data is stored in a MongoDB Atlas cloud database, ensuring data persistence across restarts.
* **Secure API:** Endpoints for modifying data are protected via JWT middleware.
* **File Storage:** *[OPTIONAL FEATURE]* Uses `multer` to handle `multipart/form-data` for audio file uploads, storing them on the server and serving them statically.
* **CORS Enabled:** Configured to allow secure cross-origin requests between the Angular app and the API.

---

## 🛠️ Tech Stack

* **Frontend:** Angular (v16+), HTML5, SCSS, TypeScript.
* **Backend:** Node.js, Express.js.
* **Database:** MongoDB (Mongoose ODM).
* **Authentication:** `jsonwebtoken` (JWT), `bcrypt` for password hashing.
* **File Handling:** `multer` for backend uploads.

---

## 🤖 AI Usage Report

Artificial Intelligence tools were utilized in this project primarily for scaffolding, debugging, and optimizing standard boilerplate code. This ensured best practices were followed while allowing focus on complex logic and architecture.

**Tools Used:**
* GitHub Copilot / ChatGPT

**Summary of Contribution:**

1.  **Scaffolding & Boilerplate:**
    * *Prompt Example:* "Generate an Angular service with HttpClient for a 'Preset' model including standard CRUD operations and error handling."
    * *Role:* AI helped generate the initial structure of Angular services (`auth.service.ts`, `preset.service.ts`) and the Mongoose model definitions, saving setup time.

2.  **CSS & Layouts:**
    * *Prompt Example:* "Create a responsive CSS Grid layout for a 4x4 audio sampler pad that centers content and handles hover states."
    * *Role:* Assisted in refining the SCSS for the sampler grid and the login form responsiveness.

3.  **Debugging Middleware:**
    * *Prompt Example:* "How to configure Multer in Express to accept only audio files and rename them with a unique ID?"
    * *Role:* Provided guidance on configuring the `multer` middleware for the optional file upload feature to ensure secure filename handling.

*Note: All AI-generated code was reviewed, adapted, and integrated manually to ensure it met the specific architectural requirements of the course.*

---

## 📦 Installation & Setup

### Prerequisites
* Node.js (v18+)
* MongoDB Atlas Account (or local MongoDB)

### 1. Backend Setup
```bash
# Navigate to the root folder
cd FinalProjectInc

# Install dependencies
npm install

# Configure Environment
# Create a .env file based on .env.example
# Add your MongoDB Connection String and JWT_SECRET

```

### 2. Frontend (Angular) Setup

```bash
# Navigate to the Angular project
cd preset-manager

# Install dependencies
npm install

```

---

## ▶️ Running the Project

**Start the Backend Server:**

```bash
# From the root folder
node server.js
# Server will start on http://localhost:3000

```

*The Sampler is accessible at http://localhost:3000/sampler.html*

**Start the Angular Admin App:**

```bash
# From the preset-manager folder
ng serve -o
# App will open at http://localhost:4200



```

```