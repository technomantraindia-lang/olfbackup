# IRCTC Background Worker — Deployment Reminder & Guide

> **Current Setting (Local PC):** `IRCTC_WORKER_ENABLED=false` in `.env`  
> **Status:**  **Correct for now** — Keep this `false` while developing on your laptop.

---

## 1. What is this Worker? (Simple Explanation)

Think of your OLF system as a **restaurant kitchen** and IRCTC as the **central railway office**.

When an order is updated:
* Your kitchen marks an order: *"Food is ready and out for delivery"*.
* OLF needs to notify IRCTC so the passenger can see it on their mobile phone.

### The Real-World Railway Problem:
Sometimes the train is in an area with weak network or IRCTC’s central server is temporarily busy. If OLF sends the update and IRCTC doesn't reply in time:
* **Without the Worker:** The message fails and is lost forever. IRCTC never gets updated.
* **With the Worker (`true`):** The message is saved in a persistent queue (`integrations.irctc_jobs`). Every 5 seconds, this worker checks the queue and automatically retries sending it until IRCTC confirms: *"Received successfully!"*.
* It also sends the automated **WhatsApp alerts to restaurant vendors** and **confirmation emails to passengers**.

---

## 2. Why is it OFF (`false`) on your Laptop right now?

| Scenario | What Happens |
| :--- | :--- |
| **If you turn it `true` on your Laptop right now:** | ❌ Your laptop does not have the secret government IRCTC API password (`IRCTC_AUTH_TOKEN`) in `.env`. Every 5 seconds, the worker would wake up, search for the password, fail to find it, and flood your terminal with red errors: `"[IRCTC worker] Missing API credentials"`. |
| **Keeping it `false` on your Laptop (Current):** |  Your laptop stays quiet, fast, and clean. You can browse outlets, test menus, and view orders without useless background errors. |

---

## 3. Production Deployment Checklist (When Launching Live)

When you are ready to launch OLF on a real cloud server (AWS / DigitalOcean / Hostinger VPS), follow these 3 steps:

- [ ] **Step 1: Add your real IRCTC Credentials in `.env`**
  ```env
  IRCTC_BASE_URL=https://ecatering.irctc.co.in
  IRCTC_AUTH_TOKEN=your_official_secret_token_here
  IRCTC_WEBHOOK_TOKEN=your_webhook_verification_token
  ```

- [ ] **Step 2: Turn ON the Worker in `.env`**
  ```env
  IRCTC_WORKER_ENABLED=true
  ```

- [ ] **Step 3: Restart your Node Server**
  ```bash
  npm restart
  # or: pm2 restart all
  ```

---

## 4. Quick Rule of Thumb
* **On your laptop right now:** Keep `IRCTC_WORKER_ENABLED=false` (He rests, no errors).
* **On launch day on your live cloud server:** Set `IRCTC_WORKER_ENABLED=true` (He works and retries in background).

