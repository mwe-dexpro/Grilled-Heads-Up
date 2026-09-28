# PWA instead of a native Android app

The app ships as an installable PWA, Android/Chrome first, not a native APK. Google's developer verification for sideloaded apps (enforced from 2026/2027) makes distributing a personal APK awkward, while an installed PWA on Android gets a home-screen icon, full-screen, offline storage, Web Push and the share sheet. A PWA also runs on desktop (planned second device) and iOS, keeping the product path open.

## Consequences

- PWAs cannot schedule local notifications (Chrome ended the Notification Triggers API), so every Reminder must be sent by a server via Web Push. A backend is mandatory from v1 (see ADR-0005).
- No Android home-screen widget; that would need a native wrapper later. Packaging the PWA as a Trusted Web Activity for the Play Store remains possible without a rewrite.
