import axios from 'axios';
import OpenAI from 'openai';

export interface DocumentOcrResult {
  doc_type: 'pan' | 'gst' | 'fssai' | 'unknown';
  extracted_data: {
    pan_number?: string | null;
    gstin?: string | null;
    fssai_number?: string | null;
    business_name?: string | null;
    legal_name?: string | null;
    trade_name?: string | null;
    name?: string | null;
    father_name?: string | null;
    dob?: string | null;
    pan_type?: string | null;
    entity_type?: string | null;
    age?: number | null;
    expiry_date?: string | null;
    registration_date?: string | null;
    address?: string | null;
  };
  validation: {
    is_valid_format: boolean;
    is_expired?: boolean;
    days_until_expiry?: number | null;
    warnings: string[];
    details: string;
  };
  provider: 'gemini' | 'openai' | 'none';
}

export class OcrVisionService {
  private geminiApiKey: string;
  private openaiApiKey: string;

  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
  }

  hasConfiguredProvider(): boolean {
    return !!(this.geminiApiKey || this.openaiApiKey);
  }

  async extractDocumentData(
    imageBuffer: Buffer,
    mimeType: string,
    docType: 'pan' | 'gst' | 'fssai'
  ): Promise<DocumentOcrResult> {
    if (this.geminiApiKey) {
      return this.extractWithGemini(imageBuffer, mimeType, docType);
    } else if (this.openaiApiKey) {
      return this.extractWithOpenAI(imageBuffer, mimeType, docType);
    } else {
      throw new Error(
        'No AI Vision API key configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in .env'
      );
    }
  }

  private buildPrompt(docType: 'pan' | 'gst' | 'fssai'): string {
    if (docType === 'pan') {
      return `Analyze this Indian PAN card image. Return ONLY a valid JSON object:
{
  "doc_type": "pan",
  "pan_number": "10-character PAN number (5 letters, 4 digits, 1 letter)",
  "name": "Full legal name printed on card"
}`;
    }

    if (docType === 'gst') {
      return `Analyze this Indian GST certificate image. Return ONLY a valid JSON object:
{
  "doc_type": "gst",
  "gstin": "15-character GST identification number",
  "legal_name": "Legal name of business",
  "trade_name": "Trade name if visible"
}`;
    }

    return `Analyze this Indian FSSAI license / registration certificate image carefully. Look for the 14-digit license/registration number and the validity period ("Valid Upto", "Period of Validity", "Expiry Date"). Return ONLY a valid JSON object:
{
  "doc_type": "fssai",
  "fssai_number": "14-digit registration or license number (e.g. 10019011000123)",
  "business_name": "Name of Food Business Operator (FBO) / Restaurant name",
  "expiry_date": "Validity end date converted to YYYY-MM-DD format (e.g. 2028-04-29)"
}`;
  }

  private async extractWithGemini(
    imageBuffer: Buffer,
    mimeType: string,
    docType: 'pan' | 'gst' | 'fssai'
  ): Promise<DocumentOcrResult> {
    const prompt = this.buildPrompt(docType);
    const base64Data = imageBuffer.toString('base64');

    // Priority ordered by response latency: Flash-Lite models deliver sub-second to 2s responses
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-3.5-flash'
    ];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;

        const requestBody = {
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType || 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.0,
            max_output_tokens: 256,
          },
        };

        const response = await axios.post(url, requestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000,
        });

        const candidates = response.data?.candidates;
        if (!candidates || !candidates[0]?.content?.parts?.[0]?.text) {
          throw new Error('Gemini Vision API did not return readable text.');
        }

        let rawJson = candidates[0].content.parts[0].text.trim();
        // Strip markdown fences if present
        if (rawJson.startsWith('```')) {
          rawJson = rawJson.replace(/^```(json)?\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
        }

        const parsed = JSON.parse(rawJson);
        return this.postProcessAndValidate(parsed, docType, 'gemini');
      } catch (err: any) {
        lastError = err;
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        console.warn(`[OCR Gemini] Model ${model} failed (status ${status}): ${msg}. Trying next fallback model...`);
        // If 404 (model deprecated) or 503 (high demand), continue to next model
        if (status === 404 || status === 503) {
          continue;
        }
        // If other fatal error (e.g., auth 401/403 or invalid argument), stop and throw
        if (status === 401 || status === 403 || status === 400) {
          throw new Error(`Gemini API Error (${status}): ${msg}`);
        }
      }
    }

    throw new Error(
      `Gemini Vision API extraction failed across models: ${lastError?.response?.data?.error?.message || lastError?.message}`
    );
  }

  private async extractWithOpenAI(
    imageBuffer: Buffer,
    mimeType: string,
    docType: 'pan' | 'gst' | 'fssai'
  ): Promise<DocumentOcrResult> {
    const openai = new OpenAI({ apiKey: this.openaiApiKey });
    const prompt = this.buildPrompt(docType);
    const base64Data = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Data}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI Vision API did not return readable text.');
    }

    const parsed = JSON.parse(content);
    return this.postProcessAndValidate(parsed, docType, 'openai');
  }

  private postProcessAndValidate(
    data: any,
    docType: 'pan' | 'gst' | 'fssai',
    provider: 'gemini' | 'openai'
  ): DocumentOcrResult {
    const warnings: string[] = [];
    let isValidFormat = false;
    let isExpired: boolean | undefined = undefined;
    let daysUntilExpiry: number | null = null;
    let details = '';

    if (docType === 'pan') {
      const pan = (data.pan_number || '').trim().toUpperCase();
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (pan && panRegex.test(pan)) {
        isValidFormat = true;
        data.pan_number = pan;

        // Decode 4th letter of PAN to classify entity type accurately
        const fourthChar = pan.charAt(3);
        const entityMap: Record<string, string> = {
          'P': 'Individual (Person)',
          'C': 'Company (Corporate)',
          'H': 'Hindu Undivided Family (HUF)',
          'F': 'Partnership Firm / LLP',
          'A': 'Association of Persons (AOP)',
          'T': 'Trust',
          'B': 'Body of Individuals (BOI)',
          'L': 'Local Authority',
          'J': 'Artificial Juridical Person',
          'G': 'Government Agency'
        };
        data.entity_type = entityMap[fourthChar] || data.entity_type || 'Individual';
        data.pan_type = fourthChar === 'P' ? 'Individual' : 'Corporate / Entity';
        details = `Valid ${data.pan_type} PAN: ${pan}`;
      } else if (pan) {
        warnings.push(`Extracted PAN "${pan}" does not match the 10-character Indian PAN format.`);
      } else {
        warnings.push('Could not detect PAN number on the document.');
      }

      // Format DOB / Date of Birth if present
      if (data.dob) {
        const dmyMatch = String(data.dob).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (dmyMatch) {
          const [, d, m, y] = dmyMatch;
          data.dob = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        const birthDate = new Date(data.dob);
        if (!isNaN(birthDate.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (age > 0 && age < 120) {
            data.age = age;
          }
        }
      }
    } else if (docType === 'gst') {
      const gstin = (data.gstin || '').trim().toUpperCase();
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (gstin && gstRegex.test(gstin)) {
        isValidFormat = true;
        data.gstin = gstin;
        details = `Valid GSTIN: ${gstin}`;
      } else if (gstin) {
        warnings.push(`Extracted GSTIN "${gstin}" does not match the 15-character GST format.`);
      } else {
        warnings.push('Could not detect GSTIN on the certificate.');
      }
    } else if (docType === 'fssai') {
      const fssai = (data.fssai_number || '').toString().trim().replace(/\D/g, '');
      const fssaiRegex = /^[0-9]{14}$/;
      if (fssai && fssaiRegex.test(fssai)) {
        isValidFormat = true;
        data.fssai_number = fssai;
        details = `Valid 14-digit FSSAI: ${fssai}`;
      } else if (fssai) {
        warnings.push(`Extracted FSSAI number "${fssai}" is not 14 digits.`);
      } else {
        warnings.push('Could not detect 14-digit FSSAI license number.');
      }

      // Check Expiry Date (support DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD)
      const rawExp = data.expiry_date || data.valid_till || data.validity || data.valid_upto;
      if (rawExp) {
        const str = String(rawExp).trim();
        const dmyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
        const ymdMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
        if (dmyMatch) {
          data.expiry_date = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
        } else if (ymdMatch) {
          data.expiry_date = `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
        } else {
          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            data.expiry_date = `${y}-${m}-${d}`;
          } else {
            data.expiry_date = str;
          }
        }
      }

      if (data.expiry_date) {
        const expDate = new Date(data.expiry_date);
        if (!isNaN(expDate.getTime())) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffMs = expDate.getTime() - today.getTime();
          daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          if (diffMs < 0) {
            isExpired = true;
            warnings.push(
              `⚠️ CRITICAL: FSSAI License expired on ${data.expiry_date}! Upload a renewed certificate.`
            );
          } else {
            isExpired = false;
            if (daysUntilExpiry <= 30) {
              warnings.push(
                `Warning: FSSAI license expires soon in ${daysUntilExpiry} days (${data.expiry_date}).`
              );
            }
          }
        }
      }
    }

    return {
      doc_type: docType,
      extracted_data: data,
      validation: {
        is_valid_format: isValidFormat,
        is_expired: isExpired,
        days_until_expiry: daysUntilExpiry,
        warnings,
        details,
      },
      provider,
    };
  }
}

