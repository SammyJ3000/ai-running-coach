# iPhone Shortcut: "Send runs to Coach"

Sends the last 3 days of running data from Apple Health to the coach. Two tips that save time: name every result with **Set Variable**, and turn on "Allow Sharing Large Amounts of Data" for Shortcuts.

You need the live app's address and this app's passphrase (`APP_KEY`). Keep the passphrase private.

## 1. Distance (the important one)
1. **Find Health Samples**: type **Walking + Running Distance**, start date in the last **3** days, sorted oldest first, no limit.
2. **Get Details of Health Samples → Value**, then **Combine Text** (New Lines), then **Set Variable** `dist values`
3. **Get Details → Start Date** (from step 1), then Combine Text, then **Set Variable** `dist dates`
4. **Get Details → End Date** (from step 1), then Combine Text, then **Set Variable** `dist ends`

## 2. Heart rate and steps
Duplicate the block above twice:
- **Heart Rate**: `hr values` / `hr dates` (the end dates aren't needed)
- **Steps**: `steps values` / `steps dates` / `steps ends` (for cadence)

## 3. Send it
**Get Contents of URL**
- URL: `https://<coach-app>.vercel.app/api/runs`
- Method **POST**, header `x-app-key` = the passphrase
- Request Body **JSON**: field `samples` (Dictionary) containing
  - `dist`: `values`, `dates`, `ends`
  - `hr`: `values`, `dates`
  - `steps`: `values`, `dates`, `ends`

**First test:** use `…/api/runs?dry=1` and add **Show Result**. It should list the runs it found (km, time, pace, heart rate).

## 4. Make it run by itself
Shortcuts → Automation → **+** → **App** → your watch's phone app → **Is Closed** → **Run Immediately** → "Send runs to Coach".
After a run you open the watch app to sync; when you close it, the run goes to the coach.

## Fallback
If the watch app doesn't write distance to Apple Health, the app has **Add run** (distance and time typed in) and can read a screenshot of the run summary.
