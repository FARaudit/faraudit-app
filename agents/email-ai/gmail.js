import { google } from 'googleapis';

export class GmailClient {
  constructor(authClient) {
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
    this.labelCache = null;
  }

  async listInboxThreads(maxResults = 100) {
    const res = await this.gmail.users.threads.list({
      userId: 'me',
      q: 'in:inbox',
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
}
