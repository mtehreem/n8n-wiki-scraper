import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/scrape', async (req, res) => {
  const { topic } = req.body;
  if (!topic) {
    return res.status(400).json({ success: false, error: 'Topic is required' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const targetUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(topic.trim().replace(/ /g, '_'))}`;
    
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const data = await page.evaluate(() => {
      const heading = document.querySelector('#firstHeading')?.innerText || '';
      const paragraphs = Array.from(document.querySelectorAll('.mw-parser-output > p'));
      const lead = paragraphs.find(p => p.innerText.trim().length > 50)?.innerText || '';
      
      return {
        title: heading,
        summary: lead.replace(/\[\d+\]/g, '').trim(),
        url: window.location.href
      };
    });

    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.post('/auth/supabase', async (req, res) => {
  const { email, password, supabaseUrl, supabaseAnonKey } = req.body;
  
  if (!email || !password || !supabaseUrl || !supabaseAnonKey) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required credentials' 
    });
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const session = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: session.error_description || session.msg || 'Authentication failed'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'You are logged in',
      user: {
        id: session.user?.id,
        email: session.user?.email,
        role: session.user?.role
      },
      token: session.access_token
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Live Scraper & Auth Service running on port ${PORT}`);
});
