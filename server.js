// server.js
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware with explicit CORS configuration
app.use(cors({
  origin: '*', // Allow all origins for now
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));

app.use(express.json({ limit: '10mb' }));

// Handle preflight requests
app.options('*', cors());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Listicle Generator API is running!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET / - Health check',
      'POST /api/generate-listicle - Generate listicle content'
    ]
  });
});

// Test endpoint to check CORS
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'CORS test successful!',
    timestamp: new Date().toISOString()
  });
});

// Main listicle generation endpoint
app.post('/api/generate-listicle', async (req, res) => {
  try {
    const { apiKey, idea, audience, context, isDataDriven } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (!idea || !audience) {
      return res.status(400).json({ error: 'Article idea and audience are required' });
    }

    // Initialize OpenAI with the provided API key
    const openai = new OpenAI({
      apiKey: apiKey
    });

    const systemPrompt = `You are a professional financial content writer. Create structured listicle content for a financial news website. Always respond with valid JSON containing the following fields: title, introduction, tableOfContents, mainContent, conclusion.

Key requirements:
- Introduction: exactly 100 words
- Conclusion: exactly 50 words  
- Table of contents: HTML formatted list with proper heading structure
- Main content: Detailed sections for each point
- Tone: Professional but accessible for ${audience} level readers
- SEO optimized headlines and structure`;

    const userPrompt = isDataDriven 
      ? `Create a listicle for: "${idea}"
Target audience: ${audience}
${context ? `Additional context: ${context}` : ''}

This article requires current market data. For the main content, create detailed section headers and descriptions, but include placeholder text like "[INSERT CURRENT DATA TABLE]" where specific financial data would go. Focus on the structure and educational content around the data points.`
      : `Create a complete listicle for: "${idea}"
Target audience: ${audience}
${context ? `Additional context: ${context}` : ''}

This is evergreen content. Provide complete, detailed content for all sections with actionable advice and insights.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });

    const content = response.choices[0].message.content;
    
    try {
      const parsedContent = JSON.parse(content);
      res.json({
        success: true,
        data: parsedContent,
        isDataDriven
      });
    } catch (parseError) {
      // Fallback parsing if JSON is malformed
      const fallbackContent = parseContentFallback(content);
      res.json({
        success: true,
        data: fallbackContent,
        isDataDriven,
        warning: 'Content was parsed with fallback method'
      });
    }

  } catch (error) {
    console.error('Error generating listicle:', error);
    
    if (error.status === 401) {
      res.status(401).json({ error: 'Invalid API key. Please check your OpenAI API key.' });
    } else if (error.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else if (error.status === 400) {
      res.status(400).json({ error: 'Bad request. Please check your input.' });
    } else {
      res.status(500).json({ 
        error: 'Failed to generate content. Please try again.',
        details: error.message 
      });
    }
  }
});

// Fallback content parser
function parseContentFallback(content) {
  const sections = content.split('\n\n');
  return {
    title: sections[0] || 'Generated Article Title',
    introduction: sections[1] || 'Introduction content here...',
    tableOfContents: '<ol><li>Section 1</li><li>Section 2</li><li>Section 3</li></ol>',
    mainContent: sections.slice(2, -1).join('\n\n') || 'Main content here...',
    conclusion: sections[sections.length - 1] || 'Conclusion content here...'
  };
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/generate-listicle`);
});

module.exports = app;
