import { Request, Response } from 'express';
import { OcrVisionService } from '../../../services/ocr-vision.service';
import { Constants } from '../../../utils/constants.util';

export class OcrController {
  private ocrService = new OcrVisionService();

  extractDocument = async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      const docType = ((req.body && req.body.doc_type) || '').toLowerCase();

      if (!file) {
        return res.status(Constants.HTTP_BAD_REQUEST).json({
          status: -1,
          info: 'No image file uploaded. Send file under "image" key.',
        });
      }

      if (!['pan', 'gst', 'fssai'].includes(docType)) {
        return res.status(Constants.HTTP_BAD_REQUEST).json({
          status: -1,
          info: 'Invalid doc_type. Must be "pan", "gst", or "fssai".',
        });
      }

      if (!this.ocrService.hasConfiguredProvider()) {
        return res.status(Constants.HTTP_BAD_REQUEST).json({
          status: -2,
          info: 'AI Vision API key not configured. Add GEMINI_API_KEY or OPENAI_API_KEY in .env',
          data: {
            needs_key: true,
            provider_options: ['GEMINI_API_KEY', 'OPENAI_API_KEY'],
          },
        });
      }

      const result = await this.ocrService.extractDocumentData(
        file.buffer,
        file.mimetype,
        docType as 'pan' | 'gst' | 'fssai'
      );

      return res.status(Constants.HTTP_OK).json({
        status: 1,
        info: 'Document extracted successfully via AI Vision.',
        data: result,
      });
    } catch (error: any) {
      console.error('OcrController.extractDocument error:', error?.message || error);
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json({
        status: -1,
        info: error?.message || 'Failed to extract text from document using AI Vision.',
      });
    }
  };
}
