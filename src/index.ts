import { createClient, SupabaseClient } from '@supabase/supabase-js';
import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import QRCode from 'qrcode';

export interface FamPayVerifierConfig {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  gmail: string;
  gmailAppPassword: string;
}

export interface GenerateQrParams {
  upiId: string;
  amount: number | string;
  name: string;
  userId?: string; // Optional user ID to associate logs if using Supabase
}

export interface VerifyPaymentParams {
  amount: number | string;
  utr?: string;
  txnid?: string;
  userId?: string; // Optional user ID to associate logs if using Supabase
}

export interface QrResult {
  qr_image: string;
  upi_uri: string;
  upi_id: string;
  amount: string;
  name: string;
  created_at_ist: string;
}

export interface VerificationResult {
  verified: boolean;
  transaction_id?: string;
  amount?: number;
  utr?: string | null;
  sender_name?: string;
  payment_time_ist?: string;
  message?: string;
  details?: string;
}

export class FamPayVerifier {
  private supabase: SupabaseClient | null = null;
  private gmail: string;
  private gmailAppPassword: string;

  constructor(config: FamPayVerifierConfig) {
    if (!config.gmail || !config.gmailAppPassword) {
      throw new Error('Gmail credentials (gmail and app password) are required.');
    }

    if (config.supabaseUrl && config.supabaseServiceRoleKey) {
      this.supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
    }
    this.gmail = config.gmail;
    this.gmailAppPassword = config.gmailAppPassword;
  }

  /**
   * Generates a UPI payment URI and its corresponding QR Code image in Base64 format.
   */
  async generateQr(params: GenerateQrParams): Promise<QrResult> {
    const { upiId, amount, name, userId = null } = params;

    if (!upiId || !amount || !name) {
      // Log failed request
      if (this.supabase) {
        await this.supabase.from('api_logs').insert({
          user_id: userId,
          endpoint: 'npm:generateQr',
          status: 400,
          amount: amount ? Number(amount) : null
        });
      }
      throw new Error('Missing parameters (upiId, amount, and name are required)');
    }

    try {
      const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
      const qrDataUrl = await QRCode.toDataURL(upiUri, {
        margin: 2,
        width: 400
      });

      const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      // Log success
      if (this.supabase) {
        await this.supabase.from('api_logs').insert({
          user_id: userId,
          endpoint: 'npm:generateQr',
          status: 200,
          amount: Number(amount)
        });
      }

      return {
        qr_image: qrDataUrl,
        upi_uri: upiUri,
        upi_id: upiId,
        amount: String(amount),
        name: name,
        created_at_ist: nowIST
      };
    } catch (err: any) {
      if (this.supabase) {
        await this.supabase.from('api_logs').insert({
          user_id: userId,
          endpoint: 'npm:generateQr',
          status: 500,
          amount: Number(amount)
        });
      }
      throw new Error(`Failed to generate QR code: ${err.message}`);
    }
  }

  /**
   * Connects to Gmail and verifies if a payment matches the specified criteria.
   * If UTR/TxnID is not provided, it does a dynamic amount match for recent emails.
   */
  async verifyPayment(params: VerifyPaymentParams): Promise<VerificationResult> {
    const { amount, utr, txnid, userId = null } = params;

    if (!amount) {
      throw new Error('Amount is required for verification.');
    }

    const targetTx = utr || txnid;
    const filterCol = utr ? 'utr' : 'txn_id';

    // Prevent double verification (if UTR or TxnID was supplied upfront)
    if (targetTx && this.supabase) {
      const { data: existingLogs } = await this.supabase
        .from('api_logs')
        .select('id')
        .eq('status', 200)
        .eq(filterCol, targetTx);

      if (existingLogs && existingLogs.length > 0) {
        return {
          verified: false,
          message: 'Transaction already verified',
          details: 'This UTR / Txn ID has already been used.'
        };
      }
    }

    const emailClean = this.gmail.includes('@') ? this.gmail : `${this.gmail}@gmail.com`;
    const appPasswordClean = this.gmailAppPassword.replace(/\s/g, '');

    const imapConfig = {
      imap: {
        user: emailClean,
        password: appPasswordClean,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000
      }
    };

    let connection;

    try {
      connection = await imapSimple.connect(imapConfig);
      await connection.openBox('INBOX');

      // Search query: search for UTR/TxnID if present, otherwise search for the amount text
      const searchVal = utr || txnid || String(amount);
      const searchCriteria = [['TEXT', searchVal]];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        markSeen: false
      };

      const messages = await connection.search(searchCriteria, fetchOptions);

      if (messages.length === 0) {
        await this.logFailure(userId, 404, utr, txnid, Number(amount));
        connection.end();
        return {
          verified: false,
          message: 'Transaction not found',
          details: 'No matching payment found in email inbox'
        };
      }

      // Parse emails
      for (const msg of messages) {
        const allParts = msg.parts.find(p => p.which === '');
        const rawEmail = allParts?.body;
        if (!rawEmail) continue;

        const parsed = await simpleParser(rawEmail);
        const subject = parsed.subject || '';
        const bodyText = parsed.text || '';
        const fullText = (subject + '\n' + bodyText).toLowerCase();

        // Check if it contains credit keywords
        const isReceived =
          fullText.includes('received') ||
          fullText.includes('credited') ||
          fullText.includes('added');

        if (!isReceived) continue;

        // Date restriction: ignore emails older than 15 mins for dynamic checks
        if (!utr && !txnid && parsed.date) {
          const emailTime = new Date(parsed.date).getTime();
          const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
          if (emailTime < fifteenMinutesAgo) {
            continue; // Skip old emails
          }
        }

        // Validate amount matching
        const expectedAmount = Number(amount);
        const amountRegex = new RegExp(`(?:rs\\.?|inr|₹|\\s|^)${expectedAmount}(?:\\.00)?(?:\\s|$|\\.)`, 'i');
        const hasAmount = amountRegex.test(fullText) || fullText.includes(expectedAmount.toString());

        if (!hasAmount) {
          continue;
        }

        // Extract sender name
        let senderName = 'UPI User';
        const nameRegex = /(?:from|received from|sender)\s+([a-zA-Z ]{3,30})/i;
        const nameMatch = bodyText.match(nameRegex);
        if (nameMatch && nameMatch[1]) {
          senderName = nameMatch[1].trim();
          if (senderName.toLowerCase().endsWith(' at')) {
            senderName = senderName.slice(0, -3).trim();
          }
        }

        // Extract UTR/TxnID if not supplied
        let extractedUtr = utr || null;
        let extractedTxnId = txnid || null;

        if (!extractedUtr) {
          const utrMatch = bodyText.match(/(?:utr|upi ref no|ref no|reference no)\s*:\s*([0-9]{12})/i);
          if (utrMatch && utrMatch[1]) {
            extractedUtr = utrMatch[1].trim();
          }
        }

        if (!extractedTxnId) {
          const txnMatch = bodyText.match(/(?:transaction id|txn id)\s*:\s*([a-zA-Z0-9]+)/i);
          if (txnMatch && txnMatch[1]) {
            extractedTxnId = txnMatch[1].trim();
          }
        }

        // Check if extracted UTR/TxnID was already verified
        const checkVal = extractedUtr || extractedTxnId;
        const checkCol = extractedUtr ? 'utr' : 'txn_id';
        if (checkVal && this.supabase) {
          const { data: existingLogs } = await this.supabase
            .from('api_logs')
            .select('id')
            .eq('status', 200)
            .eq(checkCol, checkVal);

          if (existingLogs && existingLogs.length > 0) {
            continue; // Skip already verified email
          }
        }

        const paymentTimeIST = parsed.date
          ? new Date(parsed.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        // Log success
        if (this.supabase) {
          await this.supabase.from('api_logs').insert({
            user_id: userId,
            endpoint: 'npm:verifyPayment',
            status: 200,
            utr: extractedUtr,
            txn_id: extractedTxnId,
            amount: expectedAmount
          });
        }

        connection.end();

        return {
          verified: true,
          transaction_id: extractedTxnId || extractedUtr || undefined,
          amount: expectedAmount,
          utr: extractedUtr,
          sender_name: senderName,
          payment_time_ist: paymentTimeIST
        };
      }

      // If loop ends without matching receipt
      connection.end();
      await this.logFailure(userId, 404, utr, txnid, Number(amount));
      return {
        verified: false,
        message: 'Transaction not found',
        details: 'No matching payment found in email inbox'
      };
    } catch (err: any) {
      if (connection) connection.end();

      const isAuthError =
        err.message.includes('AUTHENTICATIONFAILED') ||
        err.message.includes('invalid credentials') ||
        err.message.includes('auth');

      const errStatus = isAuthError ? 401 : 500;
      await this.logFailure(userId, errStatus, utr, txnid, Number(amount));

      return {
        verified: false,
        message: isAuthError ? 'Invalid Gmail credentials' : 'Error during check',
        details: err.message
      };
    }
  }

  private async logFailure(
    userId: string | null,
    status: number,
    utr: string | undefined,
    txnid: string | undefined,
    amount: number
  ) {
    if (this.supabase) {
      await this.supabase.from('api_logs').insert({
        user_id: userId,
        endpoint: 'npm:verifyPayment',
        status: status,
        utr: utr || null,
        txn_id: txnid || null,
        amount: amount
      });
    }
  }
}
