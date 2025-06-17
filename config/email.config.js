module.exports = {
  enabled: process.env.EMAIL_ENABLED === "true",
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  },
  from: process.env.EMAIL_FROM,
  to: process.env.EMAIL_TO,
  cc: process.env.EMAIL_CC,
  attachReports: process.env.EMAIL_ATTACH_REPORTS !== "false",
  maxAttachmentSize:
    parseInt(process.env.EMAIL_MAX_ATTACHMENT_SIZE) || 25 * 1024 * 1024,
};
