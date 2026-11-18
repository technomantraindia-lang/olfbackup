import { Request, Response } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import MasterController from "../../master.controller";
import path from "path";
import fs from "fs";

// Configuration for AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export class UploadController extends MasterController {
  constructor() {
    super();
    this.uploadImage = this.uploadImage.bind(this);
  }

  async uploadImage(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      const file = (req as any).file;
      if (!file) {
        resModel.status = Constants.ERROR;
        resModel.info = "No image file provided.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Create a unique filename
      const ext = path.extname(file.originalname) || ".jpg";
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
      const fileName = `images/${uniqueSuffix}${ext}`;
      const bucketName = process.env.AWS_S3_BUCKET_NAME;

      if (bucketName && process.env.AWS_ACCESS_KEY_ID) {
        try {
          const uploadParams = {
            Bucket: bucketName,
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype || "image/jpeg",
          };

          await s3Client.send(new PutObjectCommand(uploadParams));

          const region = process.env.AWS_REGION || "ap-south-1";
          const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${fileName}`;

          resModel.status = Constants.SUCCESS;
          resModel.data = { url: s3Url, imageUrl: s3Url };
          resModel.info = "Image uploaded successfully.";
          resModel.endDT = new Date();
          resModel.tat = (new Date().getTime() - startMS) / 1000;
          return res.status(Constants.HTTP_OK).json(resModel);
        } catch (s3Err: any) {
          console.warn("[UPLOAD] S3 upload failed, fallback to local:", s3Err?.message);
        }
      }

      // Fallback: save locally
      const uploadsDir = path.resolve(__dirname, "../../../../uploads/images");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const localFileName = `${uniqueSuffix}${ext}`;
      const localFilePath = path.join(uploadsDir, localFileName);
      fs.writeFileSync(localFilePath, file.buffer);

      const localUrl = `/uploads/images/${localFileName}`;
      resModel.status = Constants.SUCCESS;
      resModel.data = { url: localUrl, imageUrl: localUrl };
      resModel.info = "Image uploaded successfully.";
      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      return res.status(Constants.HTTP_OK).json(resModel);

    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = "Error uploading image: " + error.message;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : uploadImage`
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }
}
