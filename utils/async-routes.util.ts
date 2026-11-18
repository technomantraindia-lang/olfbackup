import { Router } from 'express';

/** Express 4 does not forward rejected async handlers to error middleware. */
export function wrapAsyncRoutes(router: Router): void {
    for (const layer of (router as any).stack) {
        for (const handler of layer.route?.stack || []) {
            const original = handler.handle;
            if (original.length === 4) continue;
            handler.handle = (req: any, res: any, next: any) => {
                try { Promise.resolve(original(req, res, next)).catch(next); }
                catch (error) { next(error); }
            };
        }
    }
}
