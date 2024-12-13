const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');
const textract = require('textract');
const fs = require('fs');
const path = require('path');
const nlp = require('compromise');
const natural = require('natural');

const app = express();
app.use(bodyParser.json());

app.use(cors({
  origin: 'https://terms-and-conditions-analyzer.netlify.app',
  methods: ['GET', 'POST'],
}));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Allowed file extensions
const allowedExtensions = ['.txt', '.pdf', '.docx'];

// Keyword extraction using natural
function extractKeywords(text) {
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const freq = {};
  tokens.forEach((word) => {
    if (!freq[word]) freq[word] = 0;
    freq[word]++;
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 10).map(([word]) => word); // Return top 10 keywords
}

// Identify key points and hidden clauses
function analyzeText(text) {
  const doc = nlp(text);
  const sentences = doc.sentences().json();

  // Look for keywords and potential clauses
  const keyPoints = [];
  const hiddenClauses = [];

  sentences.forEach((sentence) => {
    const text = sentence.text;

    // Key Points: Sentences with "must", "shall", "required"
    if (/must|shall|required/i.test(text)) {
      keyPoints.push(text);
    }

    // Hidden Clauses: Look for terms like "data", "third-party", "arbitration"
    if (/data|third-party|arbitration|privacy/i.test(text)) {
      hiddenClauses.push(text);
    }
  });

  return { keyPoints, hiddenClauses };
}

// Endpoint to handle file uploads
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const fileExtension = path.extname(req.file.originalname).toLowerCase();

  // Validate file type
  if (!allowedExtensions.includes(fileExtension)) {
    return res.status(400).send('Unsupported file type. Only .txt, .pdf, and .docx files are allowed.');
  }

  try {
    let text = '';

    // Handle .txt files directly
    if (fileExtension === '.txt') {
      text = fs.readFileSync(filePath, 'utf8');
    } else {
      // Use textract for other file types
      text = await new Promise((resolve, reject) => {
        textract.fromFileWithPath(filePath, (err, extractedText) => {
          if (err) return reject(err);
          resolve(extractedText);
        });
      });
    }

    // Analyze the extracted text
    const keywords = extractKeywords(text);
    const analysis = analyzeText(text);

    // Send response back to frontend
    res.json({
      success: true,
      keywords,
      ...analysis,
    });
  } catch (err) {
    console.error('Error processing file:', err);
    res.status(500).send('Error processing the file.');
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
