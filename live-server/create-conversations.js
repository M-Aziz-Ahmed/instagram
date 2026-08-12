#!/usr/bin/env node

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI;
const { WARERA, WARERA_MESSENGER_USER_ID } = require('../lib/config.js');
const WARERA_JWT = process.env.WARERA_JWT;
const WARERA_CF_CLEARANCE = process.env.WARERA_CF_CLEARANCE;

if (!WARERA_JWT) {
  console.error('❌ WARERA_JWT not set in .env.local');
  process.exit(1);
}

const WareraPlayerSchema = new mongoose.Schema(
  {
    wareraId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    usernameLower: { type: String, required: true },
    level: { type: Number, default: 1 },
    countryId: { type: String, required: true },
    joinedAt: { type: Date, required: true },
    notified: { type: Boolean, default: false },
    ingameMessaged: { type: Boolean, default: false },
    ingameMessagedAt: { type: Date },
    conversationCreated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const WareraPlayer = mongoose.models.WareraPlayer || mongoose.model('WareraPlayer', WareraPlayerSchema, 'warera_players');

async function main() {
const puppeteer = require('puppeteer');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Get players without conversations
  const players = await WareraPlayer.find({ 
    conversationCreated: { $ne: true },
    ingameMessaged: { $ne: true }
  })
    .select('wareraId username level')
    .sort({ createdAt: -1 })
    .limit(10);

  console.log(`Found ${players.length} players needing conversation creation`);

  if (players.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Launch browser with existing session cookies
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Adjust if Chrome is elsewhere
  });

  const page = await browser.newPage();

  // Set cookies
  const cookies = [
    { name: 'jwt', value: WARERA_JWT, domain: '.warera.io', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
  ];
  if (WARERA_CF_CLEARANCE) {
    cookies.push({ name: 'cf_clearance', value: WARERA_CF_CLEARANCE, domain: '.warera.io', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
  }
  await page.setCookie(...cookies);

  for (const player of players) {
    try {
      console.log(`\n🌐 Opening profile for ${player.username} (${player.wareraId})...`);
      
      await page.goto(`https://app.warera.io/user/${player.wareraId}`, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for page to load
      await new Promise(r => setTimeout(r, 3000));

      // Try to find and click message button
      // Common selectors for "Message" button
      const messageSelectors = [
        'button:has-text("Message")',
        'a:has-text("Message")',
        '[data-testid="message-button"]',
        'button[aria-label="Message"]',
        '.message-button',
        'button:contains("Message")',
        'a[href*="conversation"]',
        'button[data-action="message"]',
      ];

      let clicked = false;
      for (const selector of messageSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            console.log(`  ✅ Clicked message button with selector: ${selector}`);
            clicked = true;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!clicked) {
        // Debug: get all buttons and links
        const allButtons = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('button, a'));
          return elements.map(el => ({
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 50),
            class: el.className,
            href: el.href,
            'data-testid': el.getAttribute('data-testid'),
            'aria-label': el.getAttribute('aria-label'),
          }));
        });
        console.log('  All buttons/links:', JSON.stringify(allButtons, null, 2));
        
        // Try using evaluate to find button by text
        clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a'));
          const msgButton = buttons.find(b => 
            b.textContent?.toLowerCase().includes('message') ||
            b.getAttribute('aria-label')?.toLowerCase().includes('message')
          );
          if (msgButton) {
            msgButton.click();
            return true;
          }
          return false;
        });
      }

      if (clicked) {
        // Wait for conversation to be created (redirect or modal)
        await new Promise(r => setTimeout(r, 3000));
        
        // Mark as conversation created
        await WareraPlayer.findOneAndUpdate(
          { wareraId: player.wareraId },
          { conversationCreated: true },
          { returnDocument: 'after' }
        );
        console.log(`  ✅ Conversation created for ${player.username}`);
      } else {
        console.log(`  ❌ Could not find message button for ${player.username}`);
        // Try to see what's on the page
        const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
        console.log(`  Page content preview: ${pageText}`);
      }

      // Rate limit between requests
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`  ❌ Error with ${player.username}:`, err.message);
    }
  }

  await browser.close();
  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

main().catch(console.error);