# Bil ve Fethet - Deutschland Edition (Classroom Quiz Game)

This project is a browser-based, real-time multiplayer quiz game designed for classroom education and activities, inspired by the mechanics of the popular "Triviador" (Bil ve Fethet) series.

The game is centered on the administrative districts of Germany (401 Landkreise). It allows students to use their smartphones as controllers to compete on a main map displayed on a classroom's smart board or projector.

## Project Milestone
Following its initial release, this project reached 97 downloads within the first 24 hours. This English documentation has been introduced to better serve the growing international user base.

## Key Features
- **Smartphone Integration**: Players can join the game instantly by scanning a QR code on the main screen. No application download is required.
- **Dynamic Mapping with D3.js**: The map, representing 401 German districts, is dynamically rendered as an SVG using GeoJSON data.
- **Score-Based Conquest**: Players earn points based on the accuracy and speed of their responses. Territorial expansion is automated based on performance thresholds (e.g., 800+ points grants 3 cities, 500+ points grants 2 cities).
- **Competitive Mechanics**: If multiple players attempt to expand into the same region simultaneously, the player with the highest score for that round successfully captures the territory.
- **Adjustable Timing**: The host can configure question durations from the setup screen before beginning a session.
- **100% Client-Side Architecture**: No database or server installation is required. Connections are established peer-to-peer (P2P) using PeerJS, enabling free hosting on platforms such as GitHub Pages.

---

## Setup and Usage (GitHub Pages)
Since this project consists of static files (HTML, CSS, JS), it requires no backend infrastructure.

1. Fork or download the repository to your GitHub account.
2. Navigate to the **Settings > Pages** tab of your repository.
3. Select the **main** (or **master**) branch as the deployment source and save.
4. GitHub will generate a URL (e.g., `https://username.github.io/repo-name/`) within a few minutes.
5. Open this URL on the classroom's smart board. This screen acts as the **Host (Main Screen)**.
6. Players join by scanning the **QR Code** on the Host screen or by navigating to the URL and entering the Host ID.

---

## Project Structure
- `index.html`: The main game board and lobby interface for the host.
- `controller.html`: The gamepad interface accessed by players via smartphone.
- `js/board.js`: Manages UI transitions, lobby logic, and PeerJS host connections.
- `js/game.js`: The core engine handling score calculations, answer verification, and conquest logic.
- `js/map.js`: Utilizes D3.js to render GeoJSON data and manage territorial coloring.
- `js/controller.js`: Logic for the mobile interface and data transmission to the host.
- `data/questions.json`: The source file for questions, categories, and answers.
- `data/germany_districts.geojson`: Geographic data for the German administrative districts.

---

## Customizing Questions
You can adapt the game to any subject by modifying the `data/questions.json` file.

Example Question Format:
```json
{
  "type": "multiple_choice",
  "text": "What is the capital of Germany?",
  "options": ["Munich", "Berlin", "Hamburg", "Cologne"],
  "answer": 1,
  "duration": 20
}
```
*Note: The `answer` field is zero-indexed (e.g., 1 corresponds to the second option, Berlin).*

---

## Security and Privacy
This project operates entirely on the client side:
- No API keys are required.
- No backend database is maintained.
- Peer-to-peer communication is handled via PeerJS public cloud servers.
- The project is safe to host in public repositories as it contains no sensitive credentials or server-side vulnerabilities.

---

**Developed for interactive and engaging classroom experiences.**

