# Submit CalmKit to App Store and Play Store

Everything is automated. Once you add the secrets below to GitHub, run one workflow and both stores get submitted simultaneously.

---

## Step 1 — Add secrets to GitHub

Go to: github.com/TEAMHMC/CalmKit → Settings → Secrets and variables → Actions → New repository secret

### Apple App Store secrets (need Apple Developer account at developer.apple.com — $99/yr)

| Secret name | Where to get it |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership — 10-char code like `AB12CD34EF` |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect → Users → Keys → Create key (Admin role) — shows key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Same page — Issuer ID at the top |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | Contents of the downloaded `.p8` file (open in TextEdit, copy all) |
| `MATCH_GIT_URL` | A private GitHub repo for certificates, e.g. `git@github.com:TEAMHMC/certificates.git` |
| `MATCH_PASSWORD` | Any password you choose — used to encrypt the certificates repo |

### Google Play Store secrets (need Play Console account at play.google.com/console — $25 one-time)

| Secret name | Where to get it |
|---|---|
| `GOOGLE_PLAY_JSON_KEY_CONTENT` | Play Console → Setup → API access → Create service account → JSON key file (copy full contents) |

### Android signing secrets (create a keystore once — keep it forever)

Run this once on your Mac to create the signing keystore:
```bash
keytool -genkey -v -keystore calmkit-release.keystore -alias calmkit \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Health Matters Clinic, OU=CalmKit, O=Health Matters Clinic, L=Los Angeles, S=CA, C=US"
# Enter a strong password when prompted — save it
base64 calmkit-release.keystore | pbcopy  # copies base64 to clipboard
```

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Paste from clipboard after running the command above |
| `ANDROID_KEYSTORE_PASSWORD` | The password you entered |
| `ANDROID_KEY_ALIAS` | `calmkit` |
| `ANDROID_KEY_PASSWORD` | Same as keystore password |

---

## Step 2 — Register app on both stores (one-time setup)

### App Store Connect
1. Go to appstoreconnect.apple.com → My Apps → + → New App
2. Bundle ID: `com.healthmatters.calmkit`
3. Name: `CalmKit — Mental Wellness`
4. SKU: `calmkit-hmcla-2026`
5. Fill in pricing (Free), age rating (12+), category (Health & Fitness)
6. Privacy policy URL: `https://healthmatters.clinic/privacy`

### Google Play Console
1. Go to play.google.com/console → Create app
2. App name: `CalmKit — Mental Wellness`
3. Default language: English (United States)
4. Type: App (not game)
5. Free or paid: Free
6. Declaration checkboxes → Create app
7. Complete store listing: use content from `store-assets/android/store-listing.json`

---

## Step 3 — Trigger the workflow

1. Go to: github.com/TEAMHMC/CalmKit → Actions → "Submit to App Store and Play Store"
2. Click "Run workflow" → Run workflow
3. Both jobs run in parallel: iOS (~15 min) and Android (~10 min)
4. iOS goes to App Store Connect for review (1-3 days)
5. Android goes to Play Store internal track — promote to production when ready

---

## That's it

The workflow handles: web build → Capacitor sync → native build → signing → upload → submission.
