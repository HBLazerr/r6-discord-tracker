# R6 Discord Tracker (Team Edition)

Daily 9:00 AM Phoenix: posts a Rainbow Six Siege summary to Discord with:
- Each player's rank & MMR
- Daily MMR change (↑/↓/=)
- 🥇 Most Improved (largest positive MMR change)

## Setup

1) **Discord Webhook**
   - Server Settings → Integrations → Webhooks → New Webhook → Copy URL.

2) **Tracker Network Key**
   - Get a dev key from the TRN developer portal.
   - Dev key is enough for this private, educational usage.

3) **Players**
   - Edit `players.json` with your squad:
   ```json
   [
     { "username": "Lazerr.", "platform": "pc" },
     { "username": "Elchingon5010",   "platform": "pc" }
   ]
