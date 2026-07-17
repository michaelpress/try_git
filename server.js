const path = require('path');
const express = require('express');
const { google } = require('googleapis');

const PORT = process.env.PORT || 8080;
const SHEET_ID = process.env.SHEET_ID;
const SHEET_RANGE = process.env.SHEET_RANGE || 'Sheet1';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 30000);

if (!SHEET_ID) {
  console.error('Missing required env var SHEET_ID');
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

let cache = { rows: null, headers: null, fetchedAt: 0 };

async function getSheetData() {
  const now = Date.now();
  if (cache.rows && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  });
  const values = res.data.values || [];
  const [headers = [], ...rows] = values;
  cache = { headers, rows, fetchedAt: now };
  return cache;
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  try {
    const { headers, rows } = await getSheetData();
    if (!q) {
      return res.json({ headers, rows: [] });
    }
    const matches = rows.filter((row) =>
      row.some((cell) => String(cell).toLowerCase().includes(q))
    );
    res.json({ headers, rows: matches });
  } catch (err) {
    console.error('Sheet fetch failed:', err.message);
    res.status(502).json({ error: 'Failed to read sheet data' });
  }
});

app.listen(PORT, () => {
  console.log(`sheet-search listening on port ${PORT}`);
});
