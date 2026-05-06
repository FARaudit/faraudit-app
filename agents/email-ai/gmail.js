import { google } from 'googleapis';

export class GmailClient {
  constructor(authClient) {
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
    this.labelCache = null;
  }

  async listInboxThreads(maxResults = 100, watermarkUnixSec = null) {
    // Watermark uses Gmail's `after:<unix-seconds>` operator. When null, fetch
    // the entire inbox (capped at maxResults) — used for first-run backfill.
    const q = watermarkUnixSec ? `in:inbox after:${watermarkUnixSec}` : 'in:inbox';
    const res = await this.gmail.users.threads.list({
      userId: 'me',
      q,
      maxResults,
    });
    return res.data.threads || [];
  }

  async listThreadsByLabel(labelId, maxResults = 100) {
    const res = await this.gmail.users.threads.list({
      userId: 'me',
      labelIds: [labelId],
      maxResults,
    });
    return res.data.threads || [];
  }

  async getThread(threadId) {
    const res = await this.gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe'],
    });
    return res.data;
  }

  async listLabels() {
    if (this.labelCache) return this.labelCache;
    const res = await this.gmail.users.labels.list({ userId: 'me' });
    this.labelCache = res.data.labels || [];
    return this.labelCache;
  }

  async ensureLabel(name) {
    const labels = await this.listLabels();
    const existing = labels.find((l) => l.name === name);
    if (existing) return existing.id;
    const res = await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    this.labelCache = null;
    return res.data.id;
  }

  async modifyThread(threadId, addLabelIds = [], removeLabelIds = []) {
    return this.gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }

  // Create a Gmail draft (saved, never sent). gmail.modify scope includes
  // drafts.create — no scope upgrade required. Returns the draft id.
  async createDraft({ to, subject, body }) {
    // RFC 2822 message — base64url-encoded for the API.
    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
    ];
    const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + body, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const res = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    });
    return res.data.id;
  }
}
