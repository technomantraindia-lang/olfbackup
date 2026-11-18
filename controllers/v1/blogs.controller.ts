import { Request, Response } from "express";
import { Constants } from "../../utils/constants.util";
import { ResponseEntity } from "../../entities/core/response.entity";
import MasterController from "../master.controller";
import { BlogsModel } from "../../models/v1/blogs.model";

export class BlogsController extends MasterController {

    private blogsModel: BlogsModel;

    constructor() {
        super();

        this.blogsModel = new BlogsModel();

        // bindings
        this.fetchBlogs = this.fetchBlogs.bind(this);
        this.createBlogs = this.createBlogs.bind(this);
        this.updateBlogs = this.updateBlogs.bind(this);
    }

    async fetchBlogs(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let params;
        try {
            params = req.query;
            resModel = await this.blogsModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to fetch blogs";
            this.logger.error(`${this.constructor.name} : fetchBlogs — ${error?.message ?? error}`, `${this.constructor.name} : fetchBlogs`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }

    async createBlogs(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let payload;
        try {
            payload = req.body;

            // make sure required keys exist
            var verifyKeys = this.verifyKeys(req.body, ['title', 'slug', 'content', 'cover', 'author', 'published_at']);
            if (verifyKeys.length != 0) {
                resModel.status = -9;
                resModel.info = "error: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            var mandatoryFields = this.mandatoryFields(req.body, ['title', 'slug', 'content', 'cover', 'author', 'published_at']);
            if (mandatoryFields.length != 0) {
                resModel.status = -9;
                resModel.info = "error: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // check if the blog exists
            let blog: any = await this.blogsModel.fetch({ title: payload.title })
            if (blog.data.rowCount != 0) {
                resModel.status = -9;
                resModel.info = "error: " + "Blog already exists";
                return res.status(Constants.HTTP_CONFLICT).json(resModel);
            }

            resModel = await this.blogsModel.createEntity(await this.columnPayload(payload, "public", "blogs"), "public", "blogs", "blog_id");

            resModel.status = 1;
            resModel.info = "Blog created successfully";
            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            return res.status(Constants.HTTP_CREATED).json(resModel);

        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to create blog";
            this.logger.error(`${this.constructor.name} : createBlog — ${error?.message ?? error}`, `${this.constructor.name} : createBlog`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }

    async updateBlogs(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let payload;
        try {
            payload = req.body;

            resModel = await this.blogsModel.updateEntity("public", "blogs", { blog_id: req.params.id }, await this.columnPayload(payload, "public", "blogs"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to update blog";
            this.logger.error(`${this.constructor.name} : updateBlog — ${error?.message ?? error}`, `${this.constructor.name} : updateBlog`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
}