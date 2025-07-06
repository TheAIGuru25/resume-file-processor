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
// Main file processing endpoint with enhanced debugging
app.post('/extract-text', async (req, res) => {
  console.log('=== NEW REQUEST ===');
  console.log('Request headers:', req.headers);
  console.log('Request body keys:', Object.keys(req.body));
  
  try {
    const { fileData, fileType, fileName } = req.body;
    
    console.log('Received data:');
    console.log('- fileName:', fileName);
    console.log('- fileType:', fileType);
    console.log('- fileData length:', fileData ? fileData.length : 'undefined');
    console.log('- fileData type:', typeof fileData);
    
    if (!fileData || !fileType) {
      console.log('ERROR: Missing required fields');
      return res.status(400).json({
        error: 'Missing required fields: fileData and fileType',
        received: { fileData: !!fileData, fileType: !!fileType, fileName: !!fileName }
      });
    }

    // Convert base64 to buffer
    let fileBuffer;
    try {
      console.log('Converting base64 to buffer...');
      fileBuffer = Buffer.from(fileData, 'base64');
      console.log('Buffer created, size:', fileBuffer.length, 'bytes');
    } catch (error) {
      console.log('ERROR: Base64 conversion failed:', error.message);
      return res.status(400).json({
        error: 'Invalid base64 file data',
        details: error.message
      });
    }

    let extractedText = '';
    let extractionMethod = '';

    console.log('Processing file type:', fileType);

    // Process based on file type - improved handling
    switch (true) {
      case fileType === 'application/pdf':
      case fileType.includes('pdf'):
        console.log('Processing as PDF...');
        try {
          const pdfData = await pdfParse(fileBuffer);
          extractedText = pdfData.text;
          extractionMethod = 'PDF parsing';
          console.log('PDF processed successfully, text length:', extractedText.length);
        } catch (error) {
          console.log('PDF processing error:', error.message);
          throw new Error(`PDF extraction failed: ${error.message}`);
        }
        break;

     case fileType === 'application/msword':
      case fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case fileType.includes('wordprocessingml'):
      case fileType.includes('officedocument'):
      case fileType.includes('msword'):
      case fileType.includes('word'):
        console.log('Processing as Word document...');
        console.log('Buffer length:', fileBuffer.length);
        console.log('First 20 bytes:', fileBuffer.slice(0, 20));
        
        // Check if buffer is empty or too small
        if (fileBuffer.length === 0) {
          throw new Error('File buffer is empty - possible base64 decoding issue');
        }
        
        if (fileBuffer.length < 100) {
          throw new Error(`File buffer too small (${fileBuffer.length} bytes) - possible corruption`);
        }
        
        // Check if it looks like a ZIP file (DOCX files are ZIP archives)
        const zipSignature = fileBuffer.slice(0, 4);
        const expectedZipStart = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // "PK" ZIP signature
        
        if (!zipSignature.equals(expectedZipStart)) {
          console.log('Warning: File does not have ZIP signature. Expected:', expectedZipStart, 'Got:', zipSignature);
          // Try to process anyway, might be an older DOC format
        }
        
        try {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText = result.value;
          extractionMethod = 'Word document parsing';
          console.log('Word document processed successfully, text length:', extractedText.length);
        } catch (error) {
          console.log('Mammoth processing error:', error.message);
          console.log('File buffer info:', {
            length: fileBuffer.length,
            firstBytes: fileBuffer.slice(0, 10),
            lastBytes: fileBuffer.slice(-10)
          });
          throw new Error(`Word document extraction failed: ${error.message}`);
        }
        break;

      case fileType === 'text/plain':
      case fileType.includes('text'):
        console.log('Processing as text file...');
        try {
          extractedText = fileBuffer.toString('utf8');
          extractionMethod = 'Text file reading';
          console.log('Text file processed successfully, text length:', extractedText.length);
        } catch (error) {
          console.log('Text processing error:', error.message);
          throw new Error(`Text file reading failed: ${error.message}`);
        }
        break;

      default:
        console.log('Unsupported file type:', fileType);
        return res.status(400).json({
          error: `Unsupported file type: ${fileType}`,
          supportedTypes: [
            'application/pdf',
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
          ],
          receivedType: fileType,
          hint: 'This service supports PDF, Word documents, and text files'
        });
    }

    // Clean the extracted text
    console.log('Cleaning extracted text...');
    const cleanedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .trim();

    console.log('Text cleaned, final length:', cleanedText.length);

    // Validate extracted content
    if (!cleanedText || cleanedText.length < 50) {
      console.log('ERROR: Extracted text too short:', cleanedText.length);
      return res.status(400).json({
        error: 'Extracted text is too short or empty',
        extractedLength: cleanedText.length,
        minRequired: 50,
        preview: cleanedText.substring(0, 100)
      });
    }

    console.log('SUCCESS: File processed successfully');
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
    console.error('FATAL ERROR:', error.message);
    console.error('Stack trace:', error.stack);
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
