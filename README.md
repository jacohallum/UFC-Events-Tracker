# 🥊 UFC Events Tracker

An automated UFC fight tracker that monitors upcoming fights, past events, and fighter details. Runs on GitHub Actions and sends notifications to Discord when new fight data is available.

## 🚀 Features

- **Automated Tracking**: Runs every 6 hours to check for UFC updates
- **Discord Notifications**: Get notified when new fights are announced or data changes
- **Smart Caching**: Efficiently tracks 122+ athletes with change detection
- **GitHub Integration**: Automatically commits and pushes updates to your repository
- **Manual Triggers**: Run the tracker anytime from GitHub Actions

## 📊 Data Tracked

- **Upcoming Fights**: Future UFC events and fight cards
- **Fighter Details**: Athlete information and statistics
- **Past Events**: Historical fight data
- **Event Updates**: Changes to fight cards, dates, and venues

## 🔧 Setup

### 1. Repository Setup
```bash
git clone your-repo-url
cd ufc-events-tracker
npm install
```

### 2. Discord Webhook (Optional)
1. Create a Discord webhook in your server
2. Go to your GitHub repository → Settings → Secrets and variables → Actions
3. Add a new secret named `DISCORD_WEBHOOK_URL` with your webhook URL

### 3. Manual Run
```bash
node ufc-watcher.js
```

## ⚙️ GitHub Actions Workflow

The tracker runs automatically using GitHub Actions:

- **Schedule**: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- **Manual Trigger**: Available in the Actions tab
- **Smart Commits**: Only commits when data actually changes
- **Error Handling**: Comprehensive error reporting with Discord notifications

### Workflow Features:
- ✅ Success notifications when data is updated
- ℹ️ Info messages when no changes are detected
- 🚨 Error alerts with direct links to logs
- 📊 Run summaries in GitHub Actions

## 📁 Project Structure

```
├── .github/
│   └── workflows/
│       └── ufc-watcher.yml          # GitHub Actions workflow
├── node_modules/                    # Dependencies
├── .env                            # Environment variables (local)
├── .gitignore                      # Git ignore rules
├── fightDetails.json               # Fight details cache
├── fightLog.json                   # Fight log data
├── index.js                        # Main application file
├── knownEvents.json                # Known events cache
├── knownFights.json                # Known fights cache
├── package-lock.json               # Dependency lock file
├── package.json                    # Project dependencies
├── pastEvents.json                 # Past events data
├── ufc-watcher.js                  # UFC watcher script
├── upcomingUnannouncedFights.json  # Upcoming unannounced fights
└── README.md                       # This file
```

## 🔄 How It Works

1. **Data Fetching**: Scrapes UFC data from official sources
2. **Change Detection**: Compares new data with cached versions
3. **Smart Updates**: Only processes and commits actual changes
4. **Notifications**: Sends Discord alerts for updates or errors
5. **Caching**: Maintains efficient local cache of fighter and event data

## 📈 Performance

- **Runtime**: ~2-5 seconds per run
- **Cache Size**: 122+ athletes tracked
- **Frequency**: 4 runs per day (every 6 hours)
- **Efficiency**: Zero commits when no changes detected

## 🛠️ Configuration

### Environment Variables
- `DISCORD_WEBHOOK_URL`: Discord webhook for notifications (optional)

### Workflow Schedule
To change the run frequency, edit `.github/workflows/ufc-watcher.yml`:

```yaml
schedule:
  - cron: "0 */6 * * *"  # Every 6 hours
  # - cron: "0 */12 * * *"  # Every 12 hours
  # - cron: "0 8 * * *"     # Daily at 8 AM UTC
```

## 📋 Example Output

```
Running UFC watcher script at 6/25/2025, 2:54:49 AM
UFC watcher completed in 5.35s - Cache: 122 athletes, 0 changes, 0 removals
```

## 🔍 Monitoring

- **GitHub Actions**: View detailed logs in the Actions tab
- **Discord**: Receive real-time notifications
- **Repository**: Check commit history for data update timeline

## 🚨 Error Handling

The tracker includes comprehensive error handling:
- Failed script execution → Discord alert with log links
- Git push failures → Warning notifications
- Network issues → Automatic retry logic
- Invalid data → Graceful error handling

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Discussions**: Ask questions in GitHub Discussions
- **Updates**: Watch the repository for updates and releases

---

**Last Updated**: Automatically maintained by GitHub Actions
**Status**: 🟢 Active (runs every 6 hours)
