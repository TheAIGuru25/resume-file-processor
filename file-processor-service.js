// file-processor-service.js
const express = require('express');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'File Processing Service Online',
    supportedFormats: ['pdf', 'doc', 'docx', 'txt'],
    version: '1.0.0'
  });
});

// Main file processing endpoint
app.post('/extract-text', async (req, res) => {
  try {
    const { fileData, fileType, fileName } = req.body;
    
    if (!fileData || !fileType) {
      return res.status(400).json({
        error: 'Missing required fields: fileData and fileType'
      });
    }

    // Convert base64 to buffer
    let fileBuffer;
    try {
      fileBuffer = Buffer.from(fileData, 'base64');
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid base64 file data'
      });
    }

    let extractedText = '';
    let extractionMethod = '';

    // Process based on file type
    switch (fileType) {
      case 'application/pdf':
        try {
          const pdfData = await pdfParse(fileBuffer);
          extractedText = pdfData.text;
          extractionMethod = 'PDF parsing';
        } catch (error) {
          throw new Error(`PDF extraction failed: ${error.message}`);
        }
        break;

      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        try {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText = result.value;
          extractionMethod = 'Word document parsing';
        } catch (error) {
          throw new Error(`Word document extraction failed: ${error.message}`);
        }
        break;

      case 'text/plain':
        try {
          extractedText = fileBuffer.toString('utf8');
          extractionMethod = 'Text file reading';
        } catch (error) {
          throw new Error(`Text file reading failed: ${error.message}`);
        }
        break;

      default:
        return res.status(400).json({
          error: `Unsupported file type: ${fileType}`,
          supportedTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
          ]
        });
    }

    // Clean the extracted text
    const cleanedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .trim();

    // Validate extracted content
    if (!cleanedText || cleanedText.length < 50) {
      return res.status(400).json({
        error: 'Extracted text is too short or empty',
        extractedLength: cleanedText.length,
        minRequired: 50
      });
    }

    // Return successful result
    res.json({
      success: true,
      extractedText: cleanedText,
      originalFileName: fileName,
      originalFileType: fileType,
      extractedLength: cleanedText.length,
      extractionMethod: extractionMethod,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('File processing error:', error);
    res.status(500).json({
      error: 'File processing failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`File Processing Service running on port ${PORT}`);
});
