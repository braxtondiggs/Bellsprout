import { Injectable, Logger } from '@nestjs/common';
import Imap from 'node-imap';
import { inspect } from 'util';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private imap: Imap;
  private config = {
    user: process.env.GMAIL_EMAIL,
    password: process.env.GMAIL_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true
  };
  constructor() {
    console.log(process.env.GMAIL_PASSWORD);
    this.imap = new Imap(this.config);

    this.imap.once('ready', () => {
      this.logger.log('IMAP Connection ready!');
      this.openInbox((err, box) => {
        if (err) {
          this.logger.error(err);
          return;
        }
        this.searchUnreadMessages();
      });
    });

    this.imap.once('error', (err) => {
      this.logger.error('IMAP Error:', err);
    });

    this.imap.once('end', () => {
      this.logger.log('IMAP Connection ended.');
    });
  }

  connect() {
    this.imap.connect();
  }

  private openInbox(cb: (err: Error | null, box?: Imap.Box) => void) {
    this.imap.openBox('INBOX', false, cb);
  }

  private searchUnreadMessages() {
    this.imap.search(['UNSEEN'], (err, results) => {
      if (err) {
        this.logger.error(err);
        return;
      }
      if (!results || !results.length) {
        this.logger.log('No unread emails found.');
        return;
      }

      // Fetch the unseen emails
      const fetch = this.imap.fetch(results, {
        bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
        struct: true
      });

      fetch.on('message', (msg, seqno) => {
        this.logger.log(`Message #${seqno}`);

        let msgHeader = '';
        let msgBody = '';

        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          stream.once('end', () => {
            if (info.which.includes('HEADER.FIELDS')) {
              msgHeader = buffer;
            } else {
              msgBody = buffer;
            }
          });
        });

        msg.once('attributes', (attrs) => {
          this.logger.log(`Attributes: ${inspect(attrs, false, 8)}`);
        });

        msg.once('end', () => {
          this.logger.log(`----- HEADER -----\n${msgHeader}`);
          this.logger.log(`----- BODY -----\n${msgBody}`);
          // Process the email as needed...
        });
      });

      fetch.once('error', (fetchErr) => {
        this.logger.error('Fetch error:', fetchErr);
      });
    });
  }
}
