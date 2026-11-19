import axios from "axios";
import cors from "cors";
import dotenv from 'dotenv';
import express from "express";
import fs from "fs";
import path from "path";
import cron from 'node-cron';
import { runComplaintReminders } from './utils/complaint-reminders';
import { usersDBPool } from "./database/postgres.database";
import { AuthRoutes } from "./routes/auth.routes";
import { CronRoutes } from "./routes/cron.routes";
import { IRCTCRoutes } from "./routes/irctc.routes";
import { Routes } from "./routes/server.routes";
import { HrRoutes } from "./routes/hr.routes";
import Logger from "./utils/logger.util";
import {accessGate,serviceToken} from './middlewares/access.middleware';
import {startIrctcWorker} from './services/irctc-sync.service';
import { TrainEtaService } from './services/train-eta.service';
import {safeDiagnostic} from './utils/irctc-contract';
process.env.TZ = 'Asia/Kolkata'; // Force IST timezone globally for Node.js
dotenv.config();

/** Frontend page for each URL; entries match the exact path or any sub-path beneath it. */
const FRONTEND_PAGES: { paths: string[]; file: string; alt?: string }[] = [
  { paths: ['/irctc-logs', '/irctc/logs-ui'], file: 'irctc-logs.html' },
  { paths: ['/wallet', '/reports', '/complaint-reports'], file: 'reports.html' },
  { paths: ['/roles', '/access', '/roles-access'], file: 'access.html' },
  { paths: ['/outlet-detail', '/outlet-details'], file: 'outlet-detail.html', alt: 'outlet.html' },
  { paths: ['/outlets', '/alloutlets', '/prepaidoutlets', '/inactiveoutlets', '/pendingoutlets', '/deletedoutlets'], file: 'outlets-redesign.html', alt: 'outlet.html' },
  { paths: ['/customers'], file: 'customers.html' },
  { paths: ['/orders', '/outorders', '/allque', '/custque', '/create-order'], file: 'orders.html' },
  { paths: ['/menu-v2'], file: 'menu-v2.html' },
  { paths: ['/menu', '/pendingmenu', '/itemreq', '/newitemreq', '/delitemreq'], file: 'menu.html' },
  { paths: ['/requests', '/withdrawal-requests', '/withdrawals'], file: 'requests.html' },
  { paths: ['/invoices', '/payout-history', '/restreq', '/restproreq', '/delivery'], file: 'invoices.html' },
  { paths: ['/complaints', '/feedbacks', '/ratings', '/fssaiexp'], file: 'complaints.html' },
  { paths: ['/vendors', '/vendor'], file: 'vendors.html' },
  { paths: ['/trains', '/stations'], file: 'trains.html' },
  { paths: ['/hr', '/employees', '/departments', '/settings', '/templates', '/blogs'], file: 'hr.html' },
  { paths: ['/dashboardv2', '/dashboard-v2', '/v2'], file: 'dashboardv2.html' },
  { paths: ['/', '/dashboard'], file: 'dashboard.html' },
];

function frontendPageFor(reqPath: string) {
  return FRONTEND_PAGES.find(p => p.paths.some(x => reqPath === x || (x !== '/' && reqPath.startsWith(x + '/'))));
}

class App {
  public app: express.Application;
  private readonly SERVER_PORT = process.env.PORT || process.env.SERVER_PORT || 5004;
  private logger: Logger;
  private stopIrctcWorker:()=>void=()=>{};

  constructor() {
    this.app = express();
    this.app.set('trust proxy', true);
    this.ensurePostgresRunning();
    this.logger = new Logger();
    this.middlewares();
    this.routes();
    this.initializServer();
    this.scheduleCronJobs();
    this.stopIrctcWorker=startIrctcWorker();
  }

  private ensurePostgresRunning(): void {
    if (process.platform !== 'linux') return;
    const homeDir = process.env.HOME || '/home/u863663439';
    let pgCtl = path.join(homeDir, 'domains/olf.technomantra.in/hbuilds/current/nodejs/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl');
    if (!fs.existsSync(pgCtl)) {
      pgCtl = path.join(homeDir, 'domains/olf.technomantra.in/hbuilds/versions/olf-admin-20261104-release/nodejs/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl');
    }
    const dataDir = path.join(homeDir, 'data/postgres');

    const checkAndStart = () => {
      if (fs.existsSync(pgCtl) && fs.existsSync(dataDir)) {
        try {
          const { execSync } = require('child_process');
          let isRunning = false;
          try {
            execSync(`"${pgCtl}" -D "${dataDir}" status`, { stdio: 'ignore' });
            isRunning = true;
          } catch {
            isRunning = false;
          }

          if (!isRunning) {
            console.log('[WATCHDOG] PostgreSQL daemon down, cleaning stale locks and auto-starting...');
            const pidFile = path.join(dataDir, 'postmaster.pid');
            try {
              execSync(`rm -f /tmp/.s.PGSQL.54321* "${pidFile}"`, { stdio: 'ignore' });
            } catch (_) {}
            execSync(`"${pgCtl}" -D "${dataDir}" -o "-p 54321 -k /tmp" -l "${dataDir}/pg.log" start`, { stdio: 'ignore' });
            console.log('[WATCHDOG] PostgreSQL daemon started successfully.');
          }
        } catch (e: any) {
          console.error('[WATCHDOG] Error managing postgres:', e.message);
        }
      }
    };
    checkAndStart();
    setInterval(checkAndStart, 15000);
  }

  private middlewares(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '100mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Global HTTP Request & Response Logger (Filtered for IRCTC & Errors)
    this.app.use((req, res, next) => {
      const start = Date.now();

      const originalJson = res.json;
      res.json = function (body) {
        const isError = res.statusCode >= 400;
        const urlStr = req.url.toLowerCase();
        const isTargetApi = urlStr.includes('irctc') || urlStr.includes('order') || urlStr.includes('wallet');
        const isListApi = req.method === 'GET';

        // Log if it's an error, OR if it's a target API that is NOT a GET request (listing)
        if (isError || (isTargetApi && !isListApi)) {
          console.log(`\n=========================================`);
          console.log(`[REQUEST] ${req.method} ${req.path}`);
          const redact=safeDiagnostic;
          if(process.env.LOG_REQUEST_PAYLOADS==='true'){
            if (Object.keys(req.body).length) console.log(`[BODY]`, JSON.stringify(redact(req.body), null, 2));
            if (Object.keys(req.query).length) console.log(`[QUERY]`, JSON.stringify(redact(req.query), null, 2));
          }
          console.log(`[RESPONSE] Status: ${res.statusCode} | Time: ${Date.now() - start}ms`);
          if(process.env.LOG_REQUEST_PAYLOADS==='true')console.log(`[PAYLOAD]`, JSON.stringify(redact(body), null, 2));
          console.log(`=========================================\n`);
        }
        return originalJson.call(this, body);
      };

      next();
    });
  }

  private routes(): void {
    this.app.get('/health/live',(_req,res)=>res.json({status:1}));
    this.app.get(['/knowledge-graph', '/knowledge-graph.html'], (_req, res) => {
      const candidates = [
        path.resolve(__dirname, 'knowledge-graph.html'),
        path.resolve(__dirname, '../knowledge-graph.html'),
        path.resolve(__dirname, '../../knowledge-graph.html'),
      ];
      const target = candidates.find(p => fs.existsSync(p));
      if (target) {
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(target);
      }
      res.status(404).send('Knowledge Graph HTML not found.');
    });
    this.app.get('/health/ready',async(_req,res)=>{
      try{
        const check=await usersDBPool.query("SELECT to_regclass('auth.security_keys') IS NOT NULL AND to_regclass('auth.user_assignments') IS NOT NULL AS ready");
        if(!check.rows[0]?.ready||!process.env.SECRET_KEY)throw new Error('Configuration incomplete');
        res.setHeader('Cache-Control','no-store');res.json({status:1});
      }catch{res.status(503).json({status:-9,info:'Application configuration or database is not ready.'});}
    });
    this.app.use((req,res,next)=>{
      if(req.path.startsWith('/api/v1/')||req.path==='/order'||req.path==='/trains/public/order'){
        res.setHeader('Cache-Control','no-store');res.vary('Cookie');res.vary('Authorization');return accessGate(req,res,next);
      }
      next();
    });
    this.app.use("/api/v1/", new Routes().router);
    this.app.use("/api/v1/auth", new AuthRoutes().router);
    this.app.use("/api/v1/hr", new HrRoutes().router);
    this.app.use("/", new IRCTCRoutes().router);
    this.app.use("/api/v1/cron", new CronRoutes().router);

    // Serve frontend application
    const possibleFrontendPaths = [
      ...(process.env.FRONTEND_DIR?[path.resolve(process.env.FRONTEND_DIR)]:[]),
      path.resolve(__dirname, '../frontend'),
      path.resolve(__dirname, "../../frontend_staging"),
      path.resolve(__dirname, "../../../frontend_staging"),
      "E:\\ols\\website_backups\\frontend_staging"
    ];
    const uploadsDir = path.resolve(__dirname, '../uploads');
    if (fs.existsSync(uploadsDir)) {
      this.app.use('/uploads', express.static(uploadsDir));
    }

    const frontendPath = possibleFrontendPaths.find(p => fs.existsSync(p));
    if (frontendPath) {
      console.log(`[FRONTEND] Serving static frontend files from: ${frontendPath}`);
      this.app.use(express.static(frontendPath, { index: false, dotfiles:'deny', setHeaders:(res,file)=>{if(/\.(html|js|css)$/.test(file))res.setHeader('Cache-Control','no-cache');} }));
      this.app.get("*", (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const u = req.url.toLowerCase();
        if (u.startsWith("/api") || u === "/order" || u.startsWith("/trains/public")) {
          return next();
        }

        // Live Minimal Stitch Redesigned Pages - Complete Route Mapping
        const sendStitchPage = (subPath: string, altPath?: string) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          const p1 = path.join(frontendPath, 'stitch_pages', subPath);
          if (fs.existsSync(p1)) return res.sendFile(p1);
          const p2 = path.join(frontendPath, subPath);
          if (fs.existsSync(p2)) return res.sendFile(p2);
          const pRoot = path.resolve(__dirname, '..', subPath);
          if (fs.existsSync(pRoot)) return res.sendFile(pRoot);
          if (altPath) {
            const pRootAlt = path.resolve(__dirname, '..', altPath);
            if (fs.existsSync(pRootAlt)) return res.sendFile(pRootAlt);
            const p3 = path.join(frontendPath, altPath);
            if (fs.existsSync(p3)) return res.sendFile(p3);
          }
          // Never substitute the dashboard for a missing page; it hides deployment gaps.
          console.error(`[ROUTE] Frontend file missing: ${subPath} (looked in ${frontendPath})`);
          return res.status(404).type('text').send(`Page file "${subPath}" is not deployed.`);
        };
        const reqPath = req.path.toLowerCase().replace(/\/+$/, '') || '/';
        if (reqPath === '/login') return sendStitchPage('login.html');
        if (reqPath === '/no-access') return sendStitchPage('no-access.html');
        if (['/cockpit','/outlets-v2','/dashboardv3','/dashboard-v3'].includes(reqPath)) {
          return res.redirect(301, '/dashboard');
        }

        // Outlet-scoped deep links open the matching tab of the outlet page.
        const outletTab = reqPath.match(/^\/(wallet|delivery|feedbacks)\/(\d+)$/);
        if (outletTab) {
          const tab = ({ wallet: 'wallet', delivery: 'delivery', feedbacks: 'reviews' } as Record<string, string>)[outletTab[1]];
          return res.redirect(302, `/outlet/${outletTab[2]}?tab=${tab}`);
        }

        // Direct /outlet access -> redirect to /outlets directory
        if (reqPath === '/outlet') {
          return res.redirect(302, '/outlets');
        }

        // Distinguish /outlet/:id (numeric outlet ID -> outlet-detail.html) vs /outlet/:code (station code -> outlet.html)
        const outletParamMatch = reqPath.match(/^\/outlet\/([^/]+)$/);
        if (outletParamMatch) {
          const idOrCode = outletParamMatch[1];
          if (/^\d+$/.test(idOrCode)) {
            return sendStitchPage('outlet-detail.html', 'outlet.html');
          } else {
            return sendStitchPage('outlet.html', 'outlets-redesign.html');
          }
        }

        // Each page is matched on whole path segments ("/menu" and "/menu/x", never "/menus-x").
        // Order matters: the first match wins, so keep specific entries above general ones.
        const page = frontendPageFor(reqPath);
        if (page) return sendStitchPage(page.file, page.alt);

        // Unknown URL: say so instead of silently showing the dashboard.
        console.warn(`[ROUTE] No page mapped for ${req.method} ${req.originalUrl}`);
        res.status(404);
        const notFound = path.join(frontendPath, 'stitch_pages', '404.html');
        if (fs.existsSync(notFound)) return res.sendFile(notFound);
        return res.type('html').send('<!doctype html><meta charset="utf-8"><title>Page not found</title><body style="font-family:sans-serif;text-align:center;margin-top:15vh"><h1>Page not found</h1><p>The page <code>' + reqPath.replace(/[<>&"]/g, '') + '</code> does not exist.</p><p><a href="/dashboard">Go to the dashboard</a></p></body>');
      });
    }

    // Global Exception Logger
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error(`\n[CRITICAL EXCEPTION] ${req.method} ${req.url}`);
      console.error(err.stack || err.message || err);
      console.error(`=========================================\n`);
      if (res.headersSent) return next(err);
      res.status(500).json({ status: -9, info: err?.info || err?.message || "Internal Server Error" });
    });
  }

  private getBaseUrl(): string {
    const raw = process.env.BASE_URL || `http://localhost:${this.SERVER_PORT}`;
    return raw.replace(/\/+$/, '');
  }

  private scheduleCronJobs(): void {
    // Overdue customer complaints: email the complaint team every 30 minutes (each complaint at most every 6 hours).
    // Runs even when the other scheduled jobs are off; it does nothing unless COMPLAINT_ALERT_EMAIL is set.
    cron.schedule('*/30 * * * *', () => {
      runComplaintReminders().catch(error => console.error('[complaint reminders] failed:', error?.message || error));
    });

    // Separate admin deployments can use the existing backend's scheduler.
    if(process.env.ENABLE_CRON==='false')return;
    const baseUrl = this.getBaseUrl();

    // Delivery is updated by verified callbacks or explicit dispatch actions.

    // CRON-JOB-2 - Runs every 1 minute — evaluates scheduled outlet closures & reopens
    const outletStatusJob = cron.schedule('* * * * *', () => {
      const targetUrl = `${baseUrl}/api/v1/cron/outlet/status`;
      axios.get(targetUrl,{headers:{'x-olf-service-token':serviceToken}})
        .then(response => {
          // Keep normal status logs concise
        })
        .catch(error => {
          console.error('[CRON] Error executing outlet status cron:', error.message);
        });
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata"
    });
    outletStatusJob.start();

    // CRON-JOB-3 - Runs every 10 minutes — Live Train ETA Polling Worker
    TrainEtaService.getInstance().startBackgroundWorker(10);
  }

  private initializServer() {
    const server = this.app.listen(this.SERVER_PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 OLF Application is running at http://localhost:${this.SERVER_PORT}`);
      console.log(`======================================================\n`);
      this.logger.info(`Server is running on http://localhost:${this.SERVER_PORT}`, 'App.listen');
    });

    const shutdown = async (signal: string) => {
      this.stopIrctcWorker();
      console.log(`\n[SHUTDOWN] Received ${signal}. Closing server & database pool gracefully...`);
      server.close(async () => {
        try {
          await usersDBPool.end();
          console.log('[SHUTDOWN] Database pool closed successfully.');
        } catch (e: any) {
          console.error('[SHUTDOWN] Error closing database pool:', e.message);
        }
        process.exit(0);
      });
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }
}

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

export default new App().app;
