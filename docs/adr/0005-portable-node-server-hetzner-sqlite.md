---
status: proposed
---

# Portable Node server with SQLite, hosted on Hetzner (tentative)

A backend is required for Web Push reminders (ADR-0001), sync (ADR-0004) and later Outlook webhooks. It is a plain Node service with SQLite in Docker, on a small Hetzner cloud server (CX23, about €6/month incl. IPv4), with nightly off-site backups. Requirements: cheap, EU company and EU data. The hosting choice is not final, so nothing provider-specific may be used; moving means copying a container and a SQLite file.

## Considered Options

- Scaleway Serverless Functions + Serverless SQL: functions are nearly free, but the database bills about €0.14 per active vCPU-hour and only idles after 5 minutes without queries, so a reminder cron every 1–5 minutes keeps it awake (~€100/month). Cold starts also risk Microsoft Graph's 3-second webhook deadline.
- Scaleway Functions with object storage as the data store: cheap, but sync logic without a database and the same webhook cold-start issue.
- Supabase / Firebase in an EU region: convenient, but US companies (CLOUD Act) and Supabase's free tier pauses inactive projects.
