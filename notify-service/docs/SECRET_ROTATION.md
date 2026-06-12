# Notify secret rotation

When the notify secret may have been exposed, rotate it on Render and in PolySchedule Admin.

## 1. Generate a new secret

From `notify-service/`:

```bash
npm run generate:notify-secret
```

Copy the output (64-character hex string).

## 2. Update Render

1. Render Dashboard → **polyschedule-notify** → **Environment**
2. Set `NOTIFY_SECRET` to the new value
3. Save and wait for redeploy

## 3. Update PolySchedule Admin

After logging in: **Admin** → **Notify Service** → paste the same secret → save config to Google Calendar.

Until Admin is updated, sync and push notifications will return `401` from the notify service.

## 4. Refresh clients

Hard refresh PolySchedule on each device (or use the blue update banner).

## 5. Reset partner passwords (if needed after hash wipe)

See [README.md](./README.md#lockout-recovery-all-admin-passwords-lost).

Batch reset on Render shell:

```bash
cd notify-service
node scripts/reset-partner-passwords.js mpburton kthompson jordan --password='Choose-A-New-Password'
```

Or via HTTP from your machine (PowerShell):

```powershell
$secret = "PASTE_NEW_NOTIFY_SECRET"
$pass = "Choose-A-New-Password"
$users = @("mpburton","kthompson","jordan")
foreach ($u in $users) {
  Invoke-RestMethod -Method POST -Uri "https://polyschedule-notify.onrender.com/v1/auth/reset-password" `
    -Headers @{"Content-Type"="application/json";"X-Notify-Secret"=$secret} `
    -Body (@{ username = $u; password = $pass } | ConvertTo-Json)
}
```
