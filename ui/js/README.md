# GrowIn Frontend (UI)

This folder contains the Electron frontend for GrowIn.

## Overview

The frontend provides the main desktop user interface of GrowIn. It allows users to interact with the core features of the app, including:

- focus sessions
- whitelist management
- statistics and achievements
- food and skin gacha
- pet interaction
- minigames during break periods

## Tech Used

- Electron
- HTML
- CSS
- JavaScript
- REST API
- WebSocket

## Requirements

Please install the following before running the frontend locally:

- Node.js (LTS version recommended)
- npm

You can check your installation with:

- node -v
- npm -v

## Install Dependencies:

Open a terminal in the ui folder and run:

npm install

This will install Electron and other frontend dependencies.

## Local Frontend + Backend Test Flow

If a packaged GrowIn .exe is already open, close it before running the frontend locally

Before starting the frontend, make sure the backend is already running.

In a separate terminal, start the backend first:

- cd src
- dotnet run

Then, in the ui folder, run:

- npm start
