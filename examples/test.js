import { FamPayVerifier } from '../dist/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from parent folder .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Database-free config (works with MongoDB, Postgres, Discord Bots, etc.)
const config = {
  gmail: process.env.GMAIL || 'your_email@gmail.com',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || 'your_app_password'
};

async function runTest() {
  console.log('Initializing FamPayVerifier in Database-Free Mode...');
  const verifier = new FamPayVerifier(config);

  try {
    // Test 1: Generate QR
    console.log('\n--- Test 1: Generating QR Code ---');
    const qr = await verifier.generateQr({
      upiId: 'Your Upi Id',
      amount: 'Your Amount',
      name: 'Your Name'
    });
    console.log('UPI URI:', qr.upi_uri);
    console.log('QR Code generated successfully (Base64 length):', qr.qr_image.length);

    // Test 2: Verify Payment (Dynamic check for ₹25)
    console.log('\n--- Test 2: Verifying Payment (Dynamic Amount) ---');
    console.log('Searching for payment of ₹25 in the last 15 minutes...');
    const result = await verifier.verifyPayment({
      amount: 'your_amount'
    });
    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

runTest();
