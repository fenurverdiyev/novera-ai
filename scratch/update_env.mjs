import fs from 'fs';
const creds = fs.readFileSync('credentials.json', 'utf8');
const envLine = `\nGOOGLE_SA_JSON=${JSON.stringify(creds.trim())}\n`;
fs.appendFileSync('.env.local', envLine);
console.log('Updated .env.local with GOOGLE_SA_JSON');
