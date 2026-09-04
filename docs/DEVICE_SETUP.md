# Fire TV Stick 4K Max + Fully Kiosk Browser

Getting the board running full-screen and unattended on a Fire TV Stick.

Budget about 20 minutes. Most of it is typing on a remote, which is the worst
part — a Bluetooth keyboard paired to the Fire TV, or the Fire TV app on a
phone, makes this much less painful.

> **Before you start:** deploy the board and have its URL to hand. See the
> [README](../README.md).

---

## 1. Let the Fire TV install apps from outside the Appstore

Fully Kiosk is not in the Amazon Appstore, so it has to be sideloaded.

1. **Settings → My Fire TV → About**, then click **Fire TV Stick** seven times.
   A "no need, you are already a developer" or "developer options enabled"
   toast appears.
2. Go back to **Settings → My Fire TV → Developer Options**.
3. Turn on **ADB debugging** (used later, and harmless to leave on for a device
   on your own network).

You will enable "install unknown apps" for Downloader specifically in step 3 —
newer Fire OS versions grant that per-app rather than globally.

## 2. Install Downloader

1. From the Fire TV home screen, search for **Downloader** (the orange one, by
   AFTVnews) and install it from the Amazon Appstore.
2. Open it once and accept the storage permission prompt.

## 3. Allow Downloader to install apps

1. **Settings → My Fire TV → Developer Options → Install unknown apps**.
2. Find **Downloader** in the list and turn it **on**.

If your Fire OS version has a single **Apps from Unknown Sources** toggle
instead, turn that on.

## 4. Download and install Fully Kiosk

In Downloader's **Home** tab, in the URL box, enter:

```
https://www.fully-kiosk.com/files/2026/08/Fully-Kiosk-Browser-v1.61.2.apk
```

> That is the current version at the time of writing and the filename contains
> the version number, so it will go stale. If it 404s, put `fully-kiosk.com/en/`
> into Downloader's **Browser** tab instead and use the download box on the
> page to get the latest APK.

Then:

1. Press **Go**. Wait for the download.
2. Press **Install** when prompted, then **Done**.
3. Choose **Delete** to remove the APK and free up space.

## 5. Point Fully Kiosk at the board

Open Fully Kiosk. The settings menu is reached from the left drawer — on a
remote, press the **menu** button, or navigate to the hamburger icon.

**Web Content Settings**

| Setting | Value |
| --- | --- |
| **Start URL** | your board's URL |

Add `?debug` to the Start URL temporarily if you want to confirm data is
arriving; take it off once you are happy.

**Device Management**

| Setting | Value |
| --- | --- |
| **Keep Screen On** | **On** — stops Android sleeping the display |

**Other Settings**

| Setting | Value |
| --- | --- |
| **Start on Boot** | **On** — see the Fire TV caveat below |

**Auto-reload (Web Content Settings)**

| Setting | Value | Why |
| --- | --- | --- |
| **Auto Reload on Internet Reconnect** | **On** | Fully pings 8.8.8.8 every 10s and reloads when the connection genuinely comes back. This is the safety net for a router reboot. |
| **Auto Reload on Network Reconnect** | **On** | Fires when Wi-Fi itself reassociates. |
| **Auto Reload on Idle** | **0 / off** | **Leave this off.** It reloads after a period with no interaction — and nobody ever interacts with this screen, so it would reload continuously. The board already reloads itself once a day at `VITE_RELOAD_HOUR`. |

**Turn off what you do not need**

| Setting | Value | Why |
| --- | --- | --- |
| **Screensaver** (Fully's own, under Device Management) | **Off** | It would cover the board. |
| **Motion Detection** | **Off** | It runs the camera and burns CPU for no benefit here. |

Leave **Graphics Acceleration Mode** alone. Fully's FAQ suggests setting it to
None on Fire TV, but that is specifically to fix embedded video playback — this
board has no video, and disabling acceleration would make the burn-in shift and
the night fade less smooth.

**Kiosk Mode** is a PLUS (paid) feature. You do not need it here: there is no
input device pointed at this screen and nothing to exit into. Buy the licence if
you want the home button locked down.

## 6. Turn off the Fire TV screensaver

This is separate from Fully's own screensaver and will cover the board if you
skip it.

**Settings → Display & Sounds → Screensaver → Start after → Never**

While you are in **Display & Sounds**, also check **Display → Video Resolution**
is `1080p 60Hz` rather than Auto. The board is built at exactly 1920×1080 and
scales to whatever the WebView reports; pinning the output avoids the panel
renegotiating resolution and reloading the WebView underneath it.

## 7. Start on boot — the Fire TV caveat

This is the one step that does not just work, and it is worth knowing up front.

Fire TV devices (tested on Fire OS 8.1.8.0) will not grant Fully the permissions
it needs through the normal prompts. Per Fully's own FAQ, you have to attempt
the permission grants several times and press the **Ignore** button, or grant
them over ADB. Once **Overlay** and **Usage Access** are granted, autostart on
boot works — though Fully notes it is *slow* to come up.

To grant them over ADB from a computer on the same network, with ADB debugging
enabled from step 1:

```bash
adb connect <fire-tv-ip>:5555
adb shell pm grant de.ozerov.fully android.permission.SYSTEM_ALERT_WINDOW
adb shell appops set de.ozerov.fully GET_USAGE_STATS allow
```

Find the IP under **Settings → My Fire TV → About → Network**. You will have to
accept an authorisation prompt on the TV the first time you connect.

If autostart proves unreliable, the pragmatic fallback is to leave the stick
powered on permanently and never reboot it — the board's own daily reload
handles the drift that a restart would otherwise clear.

## 8. Check it

Let it run and confirm:

- The board fills the screen with no black borders and nothing cut off.
- The clock updates on the minute.
- Nothing scrolls.

Then load it once with `?debug` on the end of the URL. Every source should show
`ok` with an age well under its TTL. Two useful checks while you are there:

- **Pull the Wi-Fi** for a minute. Tiles should keep showing their last values
  and pick up an amber staleness marker rather than going blank, and the board
  should recover within seconds of the network returning — not wait out a full
  poll interval.
- **Load `?mock=degraded`** to see the failure states deliberately: two tiles
  greyed out with a reason, two stale, the rest unaffected.

Finally, leave it overnight and check the palette has dimmed by itself.

## Troubleshooting

**Board is cut off, or has black bars.** The page declares a 1920-wide layout
viewport and lets the WebView scale it, so this normally means the Fire TV is
outputting a non-16:9 resolution. Check step 6. Also make sure **Desktop Mode**
is *off* in Web Content Settings — it forces a different viewport width.

**Tiles are all grey.** The Worker is not reachable. Load the board URL in
Downloader's browser to check it responds, then add `?debug` and read the fetch
error.

**One tile is grey, the rest are fine.** That source is failing, which is
working as designed. `?debug` names the source and the error.

**Everything is stale but nothing is grey.** The board is reaching the Worker
but the Worker's cron has stopped refreshing. Check the Worker's logs and that
the KV namespace id in `wrangler.jsonc` is real.

**Screen goes black after a while.** Something is still sleeping the display —
recheck **Keep Screen On** (step 5) *and* the Fire TV screensaver (step 6).
Both have to be set.
