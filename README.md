# Bil ve Fethet - Deutschland Edition (Classroom Quiz Game)

This project is a browser-based, real-time multiplayer quiz game designed for classroom education and activities, inspired by the mechanics of the popular "Triviador" (Bil ve Fethet) series.

The game is centered on the administrative districts of Germany. It allows students to use their smartphones as controllers to compete on a main map displayed on a classroom's smart board or projector.

## Project Milestone
Following its initial release, this project reached 97 downloads within the first 24 hours. This English documentation has been introduced to better serve the growing international user base.

## Key Features
- **Smartphone Integration**: Players can join the game instantly by scanning a QR code on the main screen. No application download is required.
- **Dynamic Mapping with D3.js**: The map, representing 401 German districts, is dynamically rendered as an SVG using GeoJSON data.
- **Score-Based Conquest**: Players earn points based on the accuracy and speed of their responses. Territorial expansion is automated based on performance thresholds (e.g., 800+ points grants 3 cities, 500+ points grants 2 cities).
- **Competitive Mechanics**: If multiple players attempt to expand into the same region simultaneously, the player with the highest score for that round successfully captures the territory.
- **Adjustable Timing**: The host can configure question durations from the setup screen before beginning a session.
- **Cloud-Synced Architecture**: Connections and game state are managed via Firebase Realtime Database, ensuring perfect stability across different networks (e.g., school Wi-Fi and mobile data) without complex server installations.

---
## Security and Privacy
This project uses Firebase for real-time networking:
- **Public API Keys**: The Firebase configuration and API keys included in the codebase are public by design. They only identify the project and do not grant administrative access.
- **Anonymous Authentication**: The database is secured using Firebase Anonymous Authentication (`auth != null`). Only players actively using the application can read or write to the game sessions.
- **Zero Financial Risk**: The project runs entirely on Firebase's free "Spark" plan. There are no stored credit cards, and the security rules prevent malicious bots from spamming the database.
- **No Personal Data**: The game only stores temporary session data (like player names and scores) which is overwritten or deleted automatically. No sensitive user information is ever collected or stored.

---

**Developed for interactive and engaging classroom experiences.**

