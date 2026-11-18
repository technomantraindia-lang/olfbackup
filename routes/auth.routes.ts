import { Router } from "express";
import { AuthMiddleware } from "../middlewares/auth.middleware";
import { AuthController } from "../controllers/v1/auth/auth.controller";
import { PermissionsController } from "../controllers/v1/auth/permissions.controller";
import {AccessController} from '../controllers/v1/auth/access.controller';

export class AuthRoutes {
  public readonly router: Router;

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes(): void {

    // middlewares
    const authMiddleware = new AuthMiddleware();

    // controllers
    const authController = new AuthController();
    const permissionsController = new PermissionsController();

    // auth routes routes
    const access=new AccessController();
    this.router.post('/login',access.login);
    this.router.post('/session',access.session);
    this.router.get('/me',access.me);
    this.router.post('/logout',access.logout);

    // permissions
    this.router.get('/permission', authMiddleware.checkAuth, authMiddleware.checkPermission("permissions", "read"), permissionsController.fetchPermissions);
    this.router.post('/permission', authMiddleware.checkAuth, authMiddleware.checkPermission("permissions", "write"), permissionsController.createPermissions);
    this.router.put('/permission/:id', authMiddleware.checkAuth, authMiddleware.checkPermission("permissions", "update"), permissionsController.updatePermissions);


  }
}
