# fampay-verify

[![npm version](https://img.shields.io/npm/v/fampay-verify.svg?style=flat-square)](https://www.npmjs.com/package/fampay-verify)
[![npm downloads](https://img.shields.io/npm/dm/fampay-verify.svg?style=flat-square)](https://www.npmjs.com/package/fampay-verify)

A lightweight, secure, and 100% universal Node.js package to verify FamPay UPI payments automatically by checking Gmail alerts via IMAP. 

Compatible with any database (MongoDB, Postgres, MySQL, Supabase, SQLite) and runs in any Node.js environment (Websites, Discord Bots, Telegram Bots, CLI tools).

## Features
- **Dynamic Amount Verification (No UTR Required):** Matches incoming payments automatically by searching for unique decimal amounts (e.g. ₹25.01).
- **Manual UTR/TxnID Verification:** Fallback to let users paste their 12-digit UTR number manually.
- **15-Minute Expiry Check:** Automatically ignores old payment emails to prevent duplicate claims.
- **Optional Supabase Logging:** Built-in auto-logging and replay attack protection if you choose to connect Supabase, or use your own custom database (like MongoDB).
- **QR Code Generator:** Built-in API to generate UPI payment links and base64 QR code images instantly.

---

## Installation

```bash
npm install fampay-verify
```

---

## Quick Start

### 1. Generating a Payment QR Code

```javascript
import { FamPayVerifier } from 'fampay-verify';

const verifier = new FamPayVerifier({
  gmail: 'your_email@gmail.com',
  gmailAppPassword: 'your_gmail_app_password_without_spaces'
});

// Generate UPI QR Code and Link
const qrResult = await verifier.generateQr({
  upiId: 'yuvraj@fam',
  amount: '25.01',
  name: 'Yuvraj Jaiswal'
});

console.log(qrResult.qr_image);  // Base64 Image string (insert into <img src="..." />)
console.log(qrResult.upi_uri);   // upi://pay?pa=yuvraj@fam&pn=...
```

### 2. Verifying a Payment (Database-Free / Custom DB)

```javascript
// Check for a recent ₹25.01 payment in the inbox
const result = await verifier.verifyPayment({
  amount: '25.01'
});

if (result.verified) {
  console.log(`Success! Received ₹${result.amount} from ${result.sender_name}`);
  console.log(`UTR Number: ${result.utr}`);
  
  // Here, you can save the result.utr to MongoDB/Postgres to prevent reuse
} else {
  console.log(`Failed: ${result.message}`);
}
```

### 3. Verifying a Payment (with Supabase Auto-Logging)

If you configure Supabase, the package will automatically check for duplicate UTR usage (replay protection) and write transaction logs to your Supabase tables.

```javascript
const verifier = new FamPayVerifier({
  supabaseUrl: 'https://your-supabase.supabase.co',
  supabaseServiceRoleKey: 'your-supabase-service-role-key',
  gmail: 'your_email@gmail.com',
  gmailAppPassword: 'your_gmail_app_password'
});

const result = await verifier.verifyPayment({
  amount: '25.01'
});
```

---

## How to get Google App Password

For security, Google requires an **App Password** to log in over IMAP:
1. Go to your [Google Account Settings](https://myaccount.google.com/).
2. Navigate to **Security** and turn on **2-Step Verification**.
3. Search for **"App passwords"** in the top search bar.
4. Create a new App Password (e.g. name it "FamPay Verifier"), copy the 16-character code, and use it in your code config.

---

## Dev Handle
Created by `@iy3k`.
